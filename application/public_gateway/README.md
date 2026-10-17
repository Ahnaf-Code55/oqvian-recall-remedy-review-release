# OQVIAN public-demo gateway

`gateway.py` is a small reverse proxy, written with the Python standard library only. It sits between Cloudflare and a separate, isolated copy of the private single-reviewer backend. Public visitors never see the backend's Basic credentials. Each browser session can open only the receipts it created.

```
browser --HTTPS--> Cloudflare tunnel --> gateway 127.0.0.1:18805 --> isolated backend 127.0.0.1:18804
```

This keeps sessions apart for a temporary demo. It is not tenant isolation, and it is not a security certification. The backend still has one shared reviewer identity and can read every receipt in its vault. The gateway only decides which receipt IDs a given browser may ask for.

## Configuration

| Variable | Default | Meaning |
| --- | --- | --- |
| `OQVIAN_GATEWAY_AUTH_FILE` | required | JSON `{"username": "...", "password": "..."}` for the isolated backend. Must be a regular file (not a symlink) with mode 0600 or stricter. |
| `OQVIAN_GATEWAY_HOST_FILE` | required | File holding the one allowed public hostname, e.g. `demo.example.org`. It is re-read on every request. |
| `OQVIAN_GATEWAY_UPSTREAM` | `http://127.0.0.1:18804` | Isolated backend. Only `http://127.0.0.1:<port>` is accepted. |
| `OQVIAN_GATEWAY_BIND` | `127.0.0.1` | Must be a loopback address. |
| `OQVIAN_GATEWAY_PORT` | `18805` | Listen port. |

The backend must be reachable at `127.0.0.1:18804` and accept that Host in `OQVIAN_ALLOWED_HOSTS`. It may listen there directly or use a loopback container mapping to its internal port. Its auth file holds the SHA-256 of the same password that goes into the gateway's credentials file. Use a fresh random password for this isolated backend, never the private staging one. Do not put either credential in a URL, a process argument or the frontend build.

```sh
OQVIAN_GATEWAY_AUTH_FILE=/path/private/gateway-upstream.json \
OQVIAN_GATEWAY_HOST_FILE=/path/private/public-host.txt \
python3 application/public_gateway/gateway.py
```

The gateway can start before the tunnel URL exists. While the host file is missing or invalid, every request gets `503 public_host_not_configured`. Once the tunnel is up, write the bare hostname into the file (no scheme, port or path). No restart is needed.

## What it enforces

- **Host and scheme.** `Host` must equal the configured hostname and `X-Forwarded-Proto` must be `https`, which Cloudflare sets. Anything else gets 403.
- **Path allowlist.** Paths are matched exactly: `/`, `/index.html`, `/public-demo.css`, `/assets/<name>.js|.css`, `/oqvian-logo.png`, `/oqvian-favicon.png`, `GET /api/health|notices|cases`, `POST /api/reviews` and `GET /api/reviews/<uuid>[/export]`. A query string, `%`, dot segment or unknown path gets 404. The two PNGs are on the list because the built UI loads them.
- **Sessions.** The first `GET /` without a valid session sets `__Host-oqvian_demo` with a random 256-bit value, flagged `Secure; HttpOnly; SameSite=Strict; Path=/`. Sessions live in memory and expire 2 hours after creation. Every `/api/*` call requires a live session (401 otherwise).
- **Receipt ownership.** A session can create at most 20 receipts. `GET /api/reviews/<id>` and `/export` return 404 before contacting the backend unless the ID was created by that same session. Malformed IDs also get 404.
- **POST.** `Origin` must be exactly `https://<host>`. `Sec-Fetch-Site`, if sent, must be `same-origin`. `Content-Type` must be `application/json`, with no `Transfer-Encoding`, a body of at most 16 KB, and a JSON object as the body. Only after these checks does the gateway forward the body, with `Origin` rewritten to the upstream origin.
- **Upstream requests.** These are built from scratch: upstream `Host`, server-side `Authorization: Basic`, and for POST only `Content-Type`, `Content-Length` and `Origin`. Client cookies, auth, `CF-*` and forwarding headers are never passed on.
- **Responses.** No upstream header is relayed. The gateway sets its own `Content-Type`, `no-store`, `nosniff`, `DENY` framing, `no-referrer`, the backend's self-only CSP and HSTS. API JSON is parsed and re-serialised. Receipts must match schema `1.1`: all contract fields present, a UUID `review_id` (matching the requested ID on reads), and `propositions` and `passages` as lists. Anything else gets 502. Upstream errors are reduced to their short `error` code. An upstream 401/403 becomes a plain 502, so no `WWW-Authenticate` prompt reaches the public.
- **Limits.**
  - Requests: 180 per minute per client IP and 3000 per minute overall.
  - Reviews: 3 per minute per session and 12 per minute overall.
  - Only one review is in flight to the backend at a time; others get `503 review_busy`.
  - Sessions: at most 5000 live, 20 per IP.
  - Request threads: at most 32. Extra connections are dropped.
  - Timeouts: 15 s on client sockets, 15 s on upstream metadata/static calls, 180 s on upstream reviews.
  - Rate-limit tables are capped and refuse new keys when full.
  - The constants are at the top of `gateway.py`.
- **Client IP.** This is `CF-Connecting-IP` when it parses as an IP address, otherwise the socket peer. That is safe only because the gateway listens on loopback and cloudflared is its only client.
- **Logging.** Each request logs method and status only: no URLs, cookies, bodies or receipt content.

The root HTML is fetched from the backend's built `index.html`. A short notice (`<aside class="public-demo-notice">`) and a link to the self-hosted `public-demo.css` are inserted into it. The notice says that reviews run on a real LinuxONE CPU, inputs must be fictional, receipts are visible only to the current browser session, and the demo is temporary. No inline script or style is added, so the self-only CSP stays as it is.

## Known limits

- **Restart loses sessions.** A gateway restart clears every session and every receipt-ownership record. Receipts stay encrypted in the backend vault, but no public session can open them again. Plan restarts with that in mind.
- **Cross-site links start a new session.** Because of `SameSite=Strict`, a visitor who arrives from a link on another site gets a fresh session on `/`, and receipts from their previous session can no longer be reached from that browser.
- **Wording inside receipts.** Receipts still contain the backend's own `storage_security.authorization` text ("shared private reviewer; HTTP Basic over SSH tunnel"). That describes the backend, not the public path.
- **One process only.** All state is in memory in a single process. Run exactly one gateway instance.
- **No automated tests.** Per the repository AGENTS rules, there is no test suite. The gateway was checked by hand with a throwaway fake upstream.
