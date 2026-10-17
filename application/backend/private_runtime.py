"""Private single-reviewer authentication and Turjo's encrypted receipt adapter.

Credentials are HTTP Basic over the approved SSH tunnel. This demo has one
shared reviewer identity; it does not claim per-person roles or tenant isolation.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
from pathlib import Path
import re
import stat
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "ops"))
from receipt_vault import VaultError, load, store, notebook_shared_roots


def private_directory(path: Path) -> Path:
    path = path.expanduser().absolute()
    if path.resolve() != path:
        raise ValueError("Private paths must be canonical and contain no symlinks")
    try:
        shared_roots = notebook_shared_roots()
    except VaultError as exc:
        raise ValueError(str(exc)) from None
    for shared in shared_roots:
        if path == shared or shared in path.parents:
            raise ValueError("Private state must be outside configured notebook mounts")
    for parent in (path, *path.parents):
        if (parent / '.git').exists():
            raise ValueError("Private state must be outside Git")
    info = path.stat()
    if not stat.S_ISDIR(info.st_mode) or info.st_uid != os.getuid() or stat.S_IMODE(info.st_mode) != 0o700:
        raise ValueError("Private directory must be owned by the app user with mode 0700")
    return path


def private_file(path: Path, limit: int) -> bytes:
    parent = private_directory(path.parent)
    fd = os.open(parent / path.name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    with os.fdopen(fd, 'rb') as source:
        info = os.fstat(source.fileno())
        if not stat.S_ISREG(info.st_mode) or info.st_uid != os.getuid() or stat.S_IMODE(info.st_mode) != 0o600 or info.st_nlink != 1:
            raise ValueError("Private file must be singly linked, app-owned and mode 0600")
        raw = source.read(limit + 1)
    if len(raw) > limit:
        raise ValueError("Private file exceeds size bound")
    return raw


class PrivateRuntime:
    def __init__(self):
        # No plaintext fallback, default account, auto-generated replacement key,
        # or credentials from URL arguments.
        self.vault = private_directory(Path(os.environ['OQVIAN_RECEIPTS_DIR']))
        self.key_path = Path(os.environ['OQVIAN_RECEIPT_KEY_FILE']).expanduser().absolute()
        auth_path = Path(os.environ['OQVIAN_AUTH_FILE']).expanduser().absolute()
        for secret in (self.key_path, auth_path):
            if secret.parent == self.vault or self.vault in secret.parent.parents or secret.parent in self.vault.parents:
                raise ValueError("Secrets and receipt directories must be separate")
        if self.key_path == auth_path:
            raise ValueError("Authentication and encryption require separate files")
        if len(private_file(self.key_path, 32)) != 32:
            raise ValueError("Receipt key must contain exactly 32 raw bytes")
        credentials = json.loads(private_file(auth_path, 4096))
        if not isinstance(credentials, dict) or set(credentials) != {'username', 'password_sha256'}:
            raise ValueError("Invalid authentication configuration")
        self.username = credentials['username']
        self.password_hash = credentials['password_sha256']
        if not isinstance(self.username, str) or not re.fullmatch(r'[A-Za-z0-9_-]{1,64}', self.username):
            raise ValueError("Invalid reviewer name")
        if not isinstance(self.password_hash, str) or not re.fullmatch(r'[0-9a-f]{64}', self.password_hash):
            raise ValueError("Invalid password fingerprint")
        from cryptography.hazmat.primitives.ciphers.aead import AESGCM
        AESGCM(private_file(self.key_path, 32))  # verify the actual dependency at startup

    def authorized(self, header: str) -> bool:
        try:
            scheme, encoded = header.split(' ', 1)
            if scheme.lower() != 'basic' or len(encoded) > 1024:
                return False
            decoded = base64.b64decode(encoded, validate=True).decode('utf-8')
            username, password = decoded.split(':', 1)
            user_ok = hmac.compare_digest(username.encode('utf-8'), self.username.encode('utf-8'))
            password_ok = hmac.compare_digest(hashlib.sha256(password.encode('utf-8')).hexdigest(), self.password_hash)
            return user_ok and password_ok
        except (ValueError, UnicodeError):
            return False

    def persist(self, receipt: dict) -> dict:
        # The public review ID is the vault's opaque UUID. The vault authenticates
        # it as AES-GCM associated data. The content digest excludes this storage ID.
        receipt_id = store(self.vault, self.key_path, receipt)
        return {**receipt, 'review_id': receipt_id}

    def retrieve(self, receipt_id: str) -> dict:
        receipt = load(self.vault, self.key_path, receipt_id)
        if 'review_id' in receipt:
            raise VaultError('Unexpected receipt schema')
        return {**receipt, 'review_id': receipt_id}
