#!/usr/bin/env python3
"""Opt-in AES-256-GCM storage for review receipts; not backend integration."""
from __future__ import annotations

import argparse
import base64
import json
import functools
import math
import os
from pathlib import Path
import secrets
import stat
import sys
import uuid

SCHEMA = 'oqvian.receipt-vault.v1'
MAX_RECEIPT_BYTES = 1024 * 1024
MAX_ENVELOPE_BYTES = 2 * MAX_RECEIPT_BYTES


class VaultError(Exception):
    pass


def notebook_shared_roots() -> tuple[Path, ...]:
    """Return configured notebook mounts that must never hold private state."""
    raw = os.environ.get('OQVIAN_NOTEBOOK_SHARED_ROOTS', str(Path.home() / 'shared'))
    roots = []
    for item in raw.split(os.pathsep):
        if not item.strip():
            continue
        root = Path(item).expanduser().absolute()
        if root.resolve() != root:
            raise VaultError('Notebook mount roots must be canonical and contain no symlinks.')
        roots.append(root)
    if not roots:
        raise VaultError('Configure OQVIAN_NOTEBOOK_SHARED_ROOTS before storing private state.')
    return tuple(roots)


def _outside_repo(path: Path) -> None:
    for shared in notebook_shared_roots():
        if path == shared or shared in path.parents:
            raise VaultError('Secrets and receipts must remain outside configured notebook mounts.')
    for parent in (path, *path.parents):
        if (parent / '.git').exists():
            raise VaultError('Keys and persisted receipts must be outside a Git checkout.')


def _directory(path: Path) -> Path:
    path = path.expanduser().absolute()
    if path.is_symlink() or path.resolve() != path:
        raise VaultError('Directory paths must not traverse symbolic links.')
    _outside_repo(path)
    info = path.stat()
    if not stat.S_ISDIR(info.st_mode) or info.st_uid != os.getuid() or stat.S_IMODE(info.st_mode) != 0o700:
        raise VaultError('Storage/key directory must be owned by this user with mode 0700.')
    return path


def _read_private(path: Path, limit: int) -> bytes:
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    with os.fdopen(fd, 'rb') as source:
        info = os.fstat(source.fileno())
        if not stat.S_ISREG(info.st_mode) or info.st_uid != os.getuid() or stat.S_IMODE(info.st_mode) != 0o600 or info.st_nlink != 1:
            raise VaultError('Private file must be a singly linked regular file, owned by this user, mode 0600.')
        raw = source.read(limit + 1)
    if len(raw) > limit:
        raise VaultError('Private file exceeds the size limit.')
    return raw


def _new_private(path: Path, raw: bytes) -> None:
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    try:
        with os.fdopen(fd, 'wb') as target:
            target.write(raw)
            target.flush()
            os.fsync(target.fileno())
        directory_fd = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
        try:
            os.fsync(directory_fd)
        finally:
            os.close(directory_fd)
    except BaseException:
        path.unlink(missing_ok=True)
        raise


def _key(path: Path, vault: Path) -> bytes:
    path = path.expanduser()
    if path.name in ('', '.', '..'):
        raise VaultError('Key path must name a regular file.')
    parent = _directory(path.parent)
    if parent == vault or vault in parent.parents or parent in vault.parents:
        raise VaultError('Keep the key outside the receipt storage directory.')
    raw = _read_private(parent / path.name, 32)
    if len(raw) != 32:
        raise VaultError('Key must contain exactly 32 raw bytes.')
    return raw


def _crypto():
    try:
        from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    except ImportError:
        raise VaultError('The approved runtime requires the cryptography package; nothing was installed.') from None
    return AESGCM


def _receipt_id(value: str) -> str:
    try:
        if str(uuid.UUID(value)) != value:
            raise ValueError
    except ValueError:
        raise VaultError('Receipt ID must be a canonical UUID.') from None
    return value


def _aad(receipt_id: str) -> bytes:
    return (SCHEMA + ':' + receipt_id).encode('ascii')


def _pairs(pairs):
    value = {}
    for key, item in pairs:
        if key in value:
            raise ValueError('Duplicate JSON field.')
        value[key] = item
    return value


def _json_loads(raw):
    return json.loads(raw, object_pairs_hook=_pairs,
                      parse_constant=lambda _: (_ for _ in ()).throw(ValueError()))


def _validate_json(value, depth=0):
    if depth > 64:
        raise VaultError('Receipt nesting exceeds 64 levels.')
    if isinstance(value, dict):
        for key, item in value.items():
            if not isinstance(key, str):
                raise VaultError('Receipt field names must be strings.')
            _validate_json(item, depth + 1)
    elif isinstance(value, list):
        for item in value:
            _validate_json(item, depth + 1)
    elif value is not None and not isinstance(value, (str, bool, int, float)):
        raise VaultError('Receipt contains a value outside the JSON data types.')
    elif isinstance(value, float) and not math.isfinite(value):
        raise VaultError('Receipt numbers must be finite.')


def _sanitized(operation):
    @functools.wraps(operation)
    def call(*args, **kwargs):
        try:
            return operation(*args, **kwargs)
        except (OSError, RecursionError):
            raise VaultError('Private storage unavailable or input nesting invalid.') from None
    return call


@_sanitized

def store(vault: Path, key_path: Path, receipt: dict) -> str:
    """Encrypt one JSON object. Caller is responsible for user authorization."""
    AESGCM = _crypto()
    vault = _directory(vault)
    key = _key(key_path, vault)
    if not isinstance(receipt, dict):
        raise VaultError('Receipt must be a JSON object.')
    _validate_json(receipt)
    try:
        raw = json.dumps(receipt, ensure_ascii=False, allow_nan=False, separators=(',', ':')).encode('utf-8')
    except (ValueError, TypeError, UnicodeError):
        raise VaultError('Receipt must contain valid finite JSON values.') from None
    if len(raw) > MAX_RECEIPT_BYTES:
        raise VaultError('Receipt exceeds the 1 MiB limit.')
    receipt_id = str(uuid.uuid4())
    nonce = secrets.token_bytes(12)
    encrypted = AESGCM(key).encrypt(nonce, raw, _aad(receipt_id))
    envelope = {
        'schema': SCHEMA, 'receipt_id': receipt_id, 'algorithm': 'AES-256-GCM',
        'nonce': base64.b64encode(nonce).decode('ascii'),
        'ciphertext': base64.b64encode(encrypted).decode('ascii'),
    }
    _new_private(vault / (receipt_id + '.json'), json.dumps(envelope, separators=(',', ':')).encode('ascii'))
    return receipt_id


@_sanitized
def load(vault: Path, key_path: Path, receipt_id: str) -> dict:
    """Authenticate before returning plaintext. Does not provide app authorization."""
    AESGCM = _crypto()
    receipt_id = _receipt_id(receipt_id)
    vault = _directory(vault)
    key = _key(key_path, vault)
    raw_envelope = _read_private(vault / (receipt_id + '.json'), MAX_ENVELOPE_BYTES)
    try:
        envelope = _json_loads(raw_envelope)
        if not isinstance(envelope, dict) or set(envelope) != {'schema', 'receipt_id', 'algorithm', 'nonce', 'ciphertext'}:
            raise ValueError
        if envelope['schema'] != SCHEMA or envelope['receipt_id'] != receipt_id or envelope['algorithm'] != 'AES-256-GCM':
            raise ValueError
        nonce = base64.b64decode(envelope['nonce'], validate=True)
        ciphertext = base64.b64decode(envelope['ciphertext'], validate=True)
        if len(nonce) != 12 or not 16 <= len(ciphertext) <= MAX_RECEIPT_BYTES + 16:
            raise ValueError
        raw = AESGCM(key).decrypt(nonce, ciphertext, _aad(receipt_id))
        receipt = _json_loads(raw)
        if not isinstance(receipt, dict):
            raise ValueError
        _validate_json(receipt)
        return receipt
    except VaultError:
        raise
    except Exception:
        raise VaultError('Receipt authentication or format validation failed; no plaintext returned.') from None


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest='command', required=True)
    keygen = sub.add_parser('keygen', help='Create a private key in an existing mode-0700 directory outside Git.')
    keygen.add_argument('--key', type=Path, required=True)
    for command in ('put', 'get'):
        command_parser = sub.add_parser(command)
        command_parser.add_argument('--key', type=Path, required=True)
        command_parser.add_argument('--vault', type=Path, required=True)
        if command == 'get':
            command_parser.add_argument('receipt_id')
            command_parser.add_argument('--reveal', action='store_true', help='Explicitly permit plaintext receipt on stdout.')
    args = parser.parse_args()
    try:
        if args.command == 'keygen':
            args.key = args.key.expanduser()
            if args.key.name in ('', '.', '..'):
                raise VaultError('Key path must name a regular file.')
            parent = _directory(args.key.parent)
            _new_private(parent / args.key.name, secrets.token_bytes(32))
            print('Private key created; key value is never printed.')
        elif args.command == 'put':
            raw = sys.stdin.buffer.read(MAX_RECEIPT_BYTES + 1)
            if len(raw) > MAX_RECEIPT_BYTES:
                raise VaultError('Receipt exceeds the 1 MiB limit.')
            try:
                receipt = _json_loads(raw)
            except (ValueError, UnicodeError, RecursionError):
                raise VaultError('Input must be a valid JSON object.') from None
            print(store(args.vault, args.key, receipt))
        elif args.command == 'get':
            receipt = load(args.vault, args.key, args.receipt_id)
            if args.reveal:
                print(json.dumps(receipt, ensure_ascii=False, allow_nan=False))
            else:
                print('Receipt authenticated. Use --reveal only in a private output channel.')
        return 0
    except (VaultError, OSError, RecursionError):
        # Filesystem errors can contain sensitive paths. Keep CLI diagnostics bounded.
        print('Receipt operation refused. Check input, private file modes, key and authentication.', file=sys.stderr)
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
