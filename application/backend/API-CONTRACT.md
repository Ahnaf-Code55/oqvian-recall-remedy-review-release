# Private API and runtime contract

Entrypoint: `python3 application/backend/server.py` from this repository root. This is a private single-reviewer demonstration, not a public service. Protect HTTP Basic with an approved private transport. Do not expose it directly to the public internet.

## Runtime configuration

Required environment variables:

- `OQVIAN_AUTH_FILE`: private JSON with exactly `username` and `password_sha256`.
- `OQVIAN_RECEIPT_KEY_FILE`: file containing exactly 32 random raw key bytes.
- `OQVIAN_RECEIPTS_DIR`: private receipt directory, separate from the key/auth directories.
- `OQVIAN_NOTEBOOK_SHARED_ROOTS`: optional path-list (use the platform path separator) naming all shared notebook/workspace mounts. Private state inside those roots is refused. If omitted, `~/shared` is protected.

Private directories must be canonical, non-symlinked, app-owned, and mode 0700. Key/auth files must be canonical, app-owned, singly linked regular files, and mode 0600. Secrets and the receipt directory must be separate. The application refuses to create replacement keys or credentials automatically.

Optional: `OQVIAN_HOST` (defaults to loopback), `OQVIAN_PORT`, `OQVIAN_ALLOWED_HOSTS`, `OQVIAN_FRONTEND_DIR`, and `OQVIAN_NLI_THREADS`.

## Inference

The NLI worker references `cross-encoder/nli-MiniLM2-L6-H768` at revision `b95119ce93d3e065de6214e38cd4a97b0f2f2c6d`; weights are not bundled. It loads only an exact local cache snapshot with remote code disabled, uses CPU, and abstains on missing or over-limit passages. Model scores are uncalibrated secondary ranking signals, not eligibility or safety decisions.

## Receipt handling

Receipts use AES-256-GCM with the canonical receipt UUID bound as associated data. The application does not treat the separate unkeyed content digest as a signature. Missing, malformed or tampered receipts are refused without returning plaintext. Follow the operational safeguards in the source and do not expose credentials, keys, receipts or host paths in public logs/screenshots.
