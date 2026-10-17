#!/usr/bin/env python3
"""OQVIAN public-demo gateway: session-isolating reverse proxy in front of the private backend.

Standard library only. Browser sessions get an in-memory cookie; each session can read only the
receipts it created. Upstream Basic credentials never leave this process. Restart = all sessions gone.
"""
import base64
import http.client
import ipaddress
import json
import os
import re
import secrets
import stat
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

HERE = Path(__file__).resolve().parent
COOKIE = "__Host-oqvian_demo"
SESSION_TTL = 2 * 60 * 60
MAX_SESSIONS = 5000
MAX_SESSIONS_PER_IP = 20
MAX_RECEIPTS_PER_SESSION = 20
MAX_BODY = 16 * 1024
MAX_UPSTREAM_BODY = 4 * 1024 * 1024
MAX_THREADS = 32
MAX_LIMITER_KEYS = 20000
IP_REQUESTS_PER_MIN = 180
GLOBAL_REQUESTS_PER_MIN = 3000
SESSION_REVIEWS_PER_MIN = 3
GLOBAL_REVIEWS_PER_MIN = 12
CLIENT_TIMEOUT = 15
UPSTREAM_TIMEOUT = 15
UPSTREAM_REVIEW_TIMEOUT = 180

CSP = ("default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; "
       "base-uri 'none'; frame-ancestors 'none'; form-action 'self'")
UUID = r"[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}"
RECEIPT_PATH = re.compile(rf"/api/reviews/({UUID})(/export)?")
ASSET_PATH = re.compile(r"/assets/[A-Za-z0-9_-]{1,80}\.(js|css)")
SAFE_PATH = re.compile(r"/[A-Za-z0-9_./-]{0,120}")
STATIC = {"/oqvian-logo.png": "image/png", "/oqvian-favicon.png": "image/png"}
METADATA = {"/api/health": "ok", "/api/notices": "notices", "/api/cases": "cases"}
RECEIPT_KEYS = {
    "schema_version", "review_id", "case_id", "created_at_utc", "jurisdiction", "fixture_status",
    "input_revision", "history", "input_provenance", "question", "identity_status", "source_consistency",
    "propositions", "passages", "inference", "rule_baseline", "truncation", "elapsed_ms",
    "storage_security", "limitations", "input_digest_sha256", "receipt_digest_sha256",
}
NOTICE_HTML = (
    '<aside class="public-demo-notice" role="note" aria-label="Public demo notice">'
    "<strong>Live LinuxONE · Public demo.</strong> Use fictional histories only; no personal data. "
    "This browser can access its receipts for up to 2 hours. "
    "Restarting the temporary demo ends its sessions."
    "</aside>"
)


def fail(msg):
    raise SystemExit(f"Gateway startup refused: {msg}")


def load_basic_auth(path):
    p = Path(path)
    st = p.lstat()
    if not stat.S_ISREG(st.st_mode) or st.st_mode & 0o077:
        fail("credentials file must be a regular file with mode 0600 or stricter")
    creds = json.loads(p.read_text(encoding="utf-8"))
    if not isinstance(creds, dict) or set(creds) != {"username", "password"}:
        fail("credentials JSON must contain exactly username and password")
    user, pw = creds["username"], creds["password"]
    if not (isinstance(user, str) and re.fullmatch(r"[A-Za-z0-9_-]{1,64}", user) and isinstance(pw, str) and pw):
        fail("invalid credentials values")
    return "Basic " + base64.b64encode(f"{user}:{pw}".encode()).decode()


def read_public_host(path):
    """Allowed public hostname, re-read per request so the manager can set it after the tunnel exists."""
    try:
        host = Path(path).read_text(encoding="ascii").strip().lower()
    except (OSError, UnicodeError):
        return None
    labels = host.split(".")
    if len(host) > 253 or len(labels) < 2 or not all(re.fullmatch(r"[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?", x) for x in labels):
        return None
    return host


class Limiter:
    """Fixed one-minute windows. Fails closed (refuses) when the key table is full of live windows."""

    def __init__(self):
        self.buckets = {}

    def hit(self, key, limit, now):
        minute = int(now // 60)
        if key not in self.buckets and len(self.buckets) >= MAX_LIMITER_KEYS:
            self.buckets = {k: v for k, v in self.buckets.items() if v[0] == minute}
            if len(self.buckets) >= MAX_LIMITER_KEYS:
                return False
        window = self.buckets.get(key)
        if not window or window[0] != minute:
            window = self.buckets[key] = [minute, 0]
        window[1] += 1
        return window[1] <= limit


class State:
    def __init__(self):
        self.lock = threading.Lock()
        self.sessions = {}  # token -> {"ip", "exp", "receipts": list}
        self.limits = Limiter()
        self.inference = threading.Lock()  # one upstream review at a time, matching the backend

    def allow(self, key, limit):
        with self.lock:
            return self.limits.hit(key, limit, time.time())

    def session(self, token):
        with self.lock:
            s = self.sessions.get(token) if token else None
            if s and s["exp"] <= time.time():
                del self.sessions[token]
                return None
            return s

    def new_session(self, ip):
        now = time.time()
        with self.lock:
            if len(self.sessions) >= MAX_SESSIONS:
                self.sessions = {k: v for k, v in self.sessions.items() if v["exp"] > now}
            if len(self.sessions) >= MAX_SESSIONS:
                return None
            if sum(1 for v in self.sessions.values() if v["ip"] == ip and v["exp"] > now) >= MAX_SESSIONS_PER_IP:
                return None
            token = secrets.token_urlsafe(32)
            self.sessions[token] = {"ip": ip, "exp": now + SESSION_TTL, "receipts": []}
            return token


class Handler(BaseHTTPRequestHandler):
    server_version = "OQVIAN-demo"
    sys_version = ""
    timeout = CLIENT_TIMEOUT

    # ---- responses -------------------------------------------------------------------------
    def _send(self, status, body, ctype, extra=()):
        self.send_response(status)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("X-Frame-Options", "DENY")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("Cross-Origin-Resource-Policy", "same-origin")
        self.send_header("Content-Security-Policy", CSP)
        self.send_header("Strict-Transport-Security", "max-age=86400")
        self.send_header("Cache-Control", "no-store")
        for name, value in extra:
            self.send_header(name, value)
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def _json(self, status, value, extra=(), indent=None):
        body = json.dumps(value, ensure_ascii=False, indent=indent).encode("utf-8") + (b"\n" if indent else b"")
        self._send(status, body, "application/json; charset=utf-8", extra)

    def _err(self, status, code):
        self._json(status, {"error": code})

    def send_error(self, code, message=None, explain=None):
        # Replaces the stdlib HTML error page (also used for malformed request lines/headers).
        self.close_connection = True
        self._err(code if 400 <= code < 600 else 400, "bad_request" if code < 500 else "unsupported")

    def log_message(self, fmt, *args):
        pass  # never log URLs, cookies, bodies or receipt values

    def log_request(self, code="-", size="-"):
        print(f"[{self.log_date_time_string()}] method={self.command} status={code}", flush=True)

    # ---- upstream --------------------------------------------------------------------------
    def _upstream(self, method, path, body=None, timeout=UPSTREAM_TIMEOUT):
        cfg = self.server.cfg
        headers = {"Host": cfg["upstream_host"], "Authorization": cfg["auth"], "Accept": "*/*"}
        if body is not None:
            headers.update({"Content-Type": "application/json", "Content-Length": str(len(body)),
                            "Origin": f"http://{cfg['upstream_host']}"})
        conn = http.client.HTTPConnection(cfg["upstream_ip"], cfg["upstream_port"], timeout=timeout)
        try:
            conn.request(method, path, body=body, headers=headers)
            resp = conn.getresponse()
            data = resp.read(MAX_UPSTREAM_BODY + 1)
            if len(data) > MAX_UPSTREAM_BODY:
                raise ValueError("upstream body too large")
            return resp.status, resp.getheader("Content-Type", ""), data
        finally:
            conn.close()

    def _relay_error(self, status, data):
        # Pass the backend's short error code, never its headers (no WWW-Authenticate) or detail text.
        if status in (401, 403) or not 400 <= status < 600:
            return self._err(502, "upstream_refused")
        try:
            code = json.loads(data).get("error")
        except (ValueError, AttributeError):
            code = None
        self._err(status, code if isinstance(code, str) and re.fullmatch(r"[a-z_]{1,64}", code) else "upstream_error")

    # ---- request gate ----------------------------------------------------------------------
    def _client_ip(self):
        # Only cloudflared (on loopback) can reach this socket; Cloudflare overwrites CF-Connecting-IP.
        try:
            return str(ipaddress.ip_address(self.headers.get("CF-Connecting-IP", "").strip()))
        except ValueError:
            return self.client_address[0]

    def _token(self):
        for part in self.headers.get("Cookie", "").split(";"):
            name, _, value = part.strip().partition("=")
            if name == COOKIE and re.fullmatch(r"[A-Za-z0-9_-]{43}", value):
                return value
        return None

    def _gate(self):
        """Common checks. Returns the request path, or None after responding."""
        host = read_public_host(self.server.cfg["host_file"])
        if not host:
            return self._err(503, "public_host_not_configured")
        if (self.headers.get("Host", "").lower() != host
                or self.headers.get("X-Forwarded-Proto", "").lower() != "https"):
            return self._err(403, "host_or_scheme_refused")
        self.public_host = host
        self.ip = self._client_ip()
        if not (self.server.state.allow("global", GLOBAL_REQUESTS_PER_MIN)
                and self.server.state.allow("ip:" + self.ip, IP_REQUESTS_PER_MIN)):
            return self._err(429, "rate_limited")
        path = self.path
        # Origin-form only; no query, fragment, percent-encoding, dot segments or double slashes.
        if not SAFE_PATH.fullmatch(path) or "//" in path or "/." in path:
            return self._err(404, "not_found")
        return path

    def _require_session(self):
        s = self.server.state.session(self._token())
        if not s:
            self._err(401, "session_required")
        return s

    # ---- methods ---------------------------------------------------------------------------
    def do_GET(self):
        path = self._gate()
        if not path:
            return
        try:
            if path in ("/", "/index.html"):
                return self._root()
            if path == "/public-demo.css":
                return self._send(200, (HERE / "public-demo.css").read_bytes(), "text/css; charset=utf-8")
            if path in STATIC or ASSET_PATH.fullmatch(path):
                return self._static(path)
            if path in METADATA:
                return self._metadata(path)
            match = RECEIPT_PATH.fullmatch(path)
            if match:
                return self._receipt(match.group(1), bool(match.group(2)))
            return self._err(404, "not_found")
        except (OSError, ValueError, http.client.HTTPException):
            return self._err(502, "upstream_unavailable")

    def do_POST(self):
        path = self._gate()
        if not path:
            return
        if path != "/api/reviews":
            return self._err(404, "not_found")
        session = self._require_session()
        if not session:
            return
        # Exact Origin is mandatory; fetch metadata, when present, must agree.
        if (self.headers.get("Origin") != f"https://{self.public_host}"
                or self.headers.get("Sec-Fetch-Site", "same-origin") != "same-origin"):
            return self._err(403, "origin_not_allowed")
        if (self.headers.get("Content-Type", "").split(";", 1)[0].strip().lower() != "application/json"
                or self.headers.get("Transfer-Encoding")):
            return self._err(415, "json_content_type_required")
        try:
            length = int(self.headers.get("Content-Length", ""))
        except ValueError:
            length = -1
        if not 0 < length <= MAX_BODY:
            self.close_connection = True
            return self._err(413, "invalid_body_size")
        try:
            body = self.rfile.read(length)
            if len(body) != length or not isinstance(json.loads(body), dict):
                raise ValueError
        except (OSError, ValueError, RecursionError):
            return self._err(400, "invalid_json")
        state = self.server.state
        if len(session["receipts"]) >= MAX_RECEIPTS_PER_SESSION:
            return self._err(429, "session_receipt_limit")
        if not (state.allow("reviews:global", GLOBAL_REVIEWS_PER_MIN)
                and state.allow("reviews:" + self._token(), SESSION_REVIEWS_PER_MIN)):
            return self._err(429, "review_rate_limited")
        if not state.inference.acquire(blocking=False):
            return self._err(503, "review_busy")
        try:
            with state.lock:
                full = len(session["receipts"]) >= MAX_RECEIPTS_PER_SESSION
            if full:
                return self._err(429, "session_receipt_limit")
            status, _, data = self._upstream("POST", "/api/reviews", body, UPSTREAM_REVIEW_TIMEOUT)
            if status != 201:
                return self._relay_error(status, data)
            receipt = self._valid_receipt(data)
            if not receipt:
                return self._err(502, "upstream_shape_invalid")
            with state.lock:
                session["receipts"].append(receipt["review_id"])
        except (OSError, ValueError, http.client.HTTPException):
            return self._err(502, "upstream_unavailable")
        finally:
            state.inference.release()
        self._json(201, receipt)

    def do_HEAD(self):
        self._err(405, "method_not_allowed")

    # ---- handlers --------------------------------------------------------------------------
    def _root(self):
        status, ctype, data = self._upstream("GET", "/index.html")
        html = data.decode("utf-8") if status == 200 and ctype.startswith("text/html") else ""
        if "</head>" not in html or "<body>" not in html:
            return self._err(502, "upstream_unavailable")
        html = html.replace("</head>", '  <link rel="stylesheet" href="/public-demo.css">\n  </head>', 1)
        html = html.replace("<body>", "<body>\n    " + NOTICE_HTML, 1)
        extra = ()
        if not self.server.state.session(self._token()):
            token = self.server.state.new_session(self.ip)
            if not token:
                return self._err(503, "demo_capacity_reached")
            extra = (("Set-Cookie", f"{COOKIE}={token}; Path=/; Max-Age={SESSION_TTL}; Secure; HttpOnly; SameSite=Strict"),)
        self._send(200, html.encode("utf-8"), "text/html; charset=utf-8", extra)

    def _static(self, path):
        ctype = STATIC.get(path) or ("text/javascript; charset=utf-8" if path.endswith(".js") else "text/css; charset=utf-8")
        status, _, data = self._upstream("GET", path)
        if status != 200:
            return self._err(404, "not_found")
        self._send(200, data, ctype)

    def _metadata(self, path):
        if not self._require_session():
            return
        status, _, data = self._upstream("GET", path)
        if status != 200:
            return self._relay_error(status, data)
        value = json.loads(data)
        key = METADATA[path]
        if not isinstance(value, dict) or (value.get(key) is not True if key == "ok" else not isinstance(value.get(key), list)):
            return self._err(502, "upstream_shape_invalid")
        self._json(200, value)

    def _receipt(self, rid, export):
        session = self._require_session()
        if not session:
            return
        with self.server.state.lock:
            owned = rid in session["receipts"]
        if not owned:
            return self._err(404, "not_found")  # other sessions' IDs never reach upstream
        status, _, data = self._upstream("GET", f"/api/reviews/{rid}")
        if status != 200:
            return self._relay_error(status, data)
        receipt = self._valid_receipt(data)
        if not receipt or receipt["review_id"] != rid:
            return self._err(502, "upstream_shape_invalid")
        if export:
            return self._json(200, receipt, (("Content-Disposition", f'attachment; filename="oqvian-review-{rid}.json"'),), indent=2)
        self._json(200, receipt)

    @staticmethod
    def _valid_receipt(data):
        try:
            r = json.loads(data)
        except ValueError:
            return None
        ok = (isinstance(r, dict) and RECEIPT_KEYS <= r.keys() and r["schema_version"] == "1.1"
              and isinstance(r["review_id"], str) and re.fullmatch(UUID, r["review_id"])
              and isinstance(r["propositions"], list) and isinstance(r["passages"], list))
        return r if ok else None


class Server(ThreadingHTTPServer):
    daemon_threads = True
    request_queue_size = 64

    def __init__(self, addr, cfg):
        super().__init__(addr, Handler)
        self.cfg, self.state = cfg, State()
        self.slots = threading.BoundedSemaphore(MAX_THREADS)

    def process_request(self, request, client_address):
        if not self.slots.acquire(blocking=False):
            return self.shutdown_request(request)  # drop when saturated; do not grow a work queue
        try:
            super().process_request(request, client_address)
        except Exception:
            self.slots.release()
            raise

    def process_request_thread(self, request, client_address):
        try:
            super().process_request_thread(request, client_address)
        finally:
            self.slots.release()


def config():
    env = os.environ
    up = urlsplit(env.get("OQVIAN_GATEWAY_UPSTREAM", "http://127.0.0.1:18804"))
    if up.scheme != "http" or up.hostname != "127.0.0.1" or not up.port or up.path not in ("", "/") or up.query:
        fail("OQVIAN_GATEWAY_UPSTREAM must be http://127.0.0.1:<port>")
    bind = env.get("OQVIAN_GATEWAY_BIND", "127.0.0.1")
    if not ipaddress.ip_address(bind).is_loopback:
        fail("OQVIAN_GATEWAY_BIND must be a loopback address")
    try:
        auth = load_basic_auth(env["OQVIAN_GATEWAY_AUTH_FILE"])
        host_file = env["OQVIAN_GATEWAY_HOST_FILE"]
    except KeyError as missing:
        fail(f"{missing} is required")
    except (OSError, ValueError):
        fail("credentials file unreadable or not JSON")
    return (bind, int(env.get("OQVIAN_GATEWAY_PORT", "18805"))), {
        "upstream_ip": "127.0.0.1", "upstream_port": up.port, "upstream_host": f"127.0.0.1:{up.port}",
        "auth": auth, "host_file": host_file,
    }


if __name__ == "__main__":
    addr, cfg = config()
    server = Server(addr, cfg)
    print(f"OQVIAN public-demo gateway on http://{addr[0]}:{addr[1]} -> {cfg['upstream_host']}; "
          f"public host {'configured' if read_public_host(cfg['host_file']) else 'NOT configured (fail closed)'}",
          file=sys.stderr, flush=True)
    server.serve_forever()
