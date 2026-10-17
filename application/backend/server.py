#!/usr/bin/env python3
"""Private recall-review HTTP service with CPU ranking and encrypted receipts."""
from __future__ import annotations

import hashlib
import json
import mimetypes
import os
import re
import sys
import threading
import time
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse
from private_runtime import PrivateRuntime, VaultError

ROOT = Path(__file__).resolve().parents[2]
APP = ROOT / "application"
DATA = APP / "data"
FRONTEND = Path(os.environ.get("OQVIAN_FRONTEND_DIR", str(APP / "frontend" / "dist"))).resolve()
REVIEW_LOCK = threading.Lock()
NOTICE_MANIFEST = DATA / "notices.json"
CASES_PATH = DATA / "cases.json"
sys.path.insert(0, str(APP / "inference"))
try:
    from nli_worker import rank as rank_nli
except Exception:  # keeps the rule and lexical baseline usable without optional inference
    rank_nli = None

MODEL_ID = "cross-encoder/nli-MiniLM2-L6-H768"
MODEL_REVISION = "b95119ce93d3e065de6214e38cd4a97b0f2f2c6d"


def load_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def request_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("Duplicate JSON field")
        result[key] = value
    return result


def notices_by_id():
    return {str(x["cpsc_id"]): x for x in load_json(NOTICE_MANIFEST)["notices"]}


class SourceIntegrityError(RuntimeError):
    pass


def sections_for(notice: dict) -> list[dict]:
    source_path = DATA / notice["source_text_file"]
    try:
        raw = source_path.read_bytes()
    except OSError as exc:
        raise SourceIntegrityError(f"source unavailable: CPSC {notice['cpsc_id']}") from exc
    if hashlib.sha256(raw).hexdigest() != notice["source_sha256"]:
        raise SourceIntegrityError(f"full-source SHA-256 mismatch: CPSC {notice['cpsc_id']}")
    source = raw.decode("utf-8")
    result = []
    for section in notice["sections"]:
        if not section.get("condition_retrieval_candidate"):
            continue
        if section.get("section_role") == "remedy" and section.get("label") == "Remedy type":
            continue  # single-word metadata is not a remedy condition or supporting passage
        start, end = int(section["char_start"]), int(section["char_end_exclusive"])
        text = source[start:end]
        if hashlib.sha256(text.encode("utf-8")).hexdigest() != section["section_sha256"]:
            raise SourceIntegrityError(f"section SHA-256 mismatch: {section['section_id']}")
        result.append({**section, "text": text})
    return result


def tokenize(text: str) -> set[str]:
    return {x for x in re.findall(r"[a-z0-9]+", text.lower()) if len(x) > 1}


def retrieve(case: dict, query: str, limit: int = 6) -> list[dict]:
    notices = notices_by_id()
    terms = tokenize(query)
    found = []
    for nid in case.get("notice_ids", []):
        notice = notices.get(str(nid))
        if not notice:
            continue
        for section in sections_for(notice):
            text = section["text"].strip()
            words = tokenize(text)
            overlap = terms & words
            score = len(overlap) / max(1, len(terms))
            found.append({
                "notice_id": str(nid), "title": notice["document_title"],
                "url": notice["official_url"], "source_sha256": notice["source_sha256"],
                "source_retrieved_at_utc": notice["source_retrieved_at_utc"],
                "section_id": section["section_id"], "section_label": section["label"],
                "section_role": section["section_role"], "start_offset": section["char_start"],
                "end_offset": section["char_end_exclusive"], "section_sha256": section["section_sha256"],
                "source_hash_verified": True, "section_hash_verified": True,
                "text": text, "lexical_score": round(score, 4),
                "matched_terms": sorted(overlap), "retrieval_method": "lexical-overlap-baseline",
                "truncated": False,
            })
    found.sort(key=lambda x: (x["lexical_score"] + (0.08 if x["section_role"] == "remedy" else 0), x["section_id"]), reverse=True)
    required = set(case.get("required_evidence_section_ids", []))
    available = {p["section_id"] for p in found}
    if not required or required - available or len(required) > limit:
        raise SourceIntegrityError("Required condition evidence is unavailable")
    selected = set(required)
    for index, passage in enumerate(found, start=1):
        passage["lexical_rank"] = index
        passage["required_for_case"] = passage["section_id"] in required
        if passage["required_for_case"]:
            passage["retrieval_method"] = "required-source-section; lexical display order"
        if len(selected) < limit:
            selected.add(passage["section_id"])
    return [p for p in found if p["section_id"] in selected]


def tri(value):
    if isinstance(value, dict):
        value = value.get("value")
    if value is True or value in ("yes", "observed_present"):
        return True
    if value is False or value in ("no", "observed_absent"):
        return False
    return None


def fact_source(intake: dict, name: str) -> str:
    sources = intake.get("fact_provenance", {})
    source = sources.get(name) if isinstance(sources, dict) else None
    return str(source or "provenance not supplied")


PROVENANCE_ALIASES = {
    "documented_third_party_confirmation": "third_party_confirmation",
    "unknown": "not_supplied",
}
PROVENANCE_CLASSES = {"owner_statement", "third_party_confirmation", "observed_present", "observed_absent",
                      "constructed_fixture", "not_checked", "not_supplied"}


def provenance_class(value) -> str:
    normalized = re.sub(r"[\s-]+", "_", str(value or "not_supplied").strip().lower())
    return PROVENANCE_ALIASES.get(normalized, normalized)


def effective_fact(intake: dict, name: str):
    value = tri(intake.get(name))
    provenance = provenance_class((intake.get("fact_provenance") or {}).get(name))
    if provenance in {"not_checked", "not_supplied"} or provenance not in PROVENANCE_CLASSES:
        return None
    if (provenance == "observed_present" and value is False) or (provenance == "observed_absent" and value is True):
        return None  # conflicting supplied value/provenance is not an observed fact
    return value


def proposition(status, statement, evidence, rationale, unknowns=None):
    labels = {"Supported": "Supported by supplied evidence", "Contradicted": "Contradicted by supplied evidence", "Unresolved": "Unresolved"}
    return {"status": status, "status_label": labels.get(status, status), "statement": statement,
            "evidence": evidence, "rationale": rationale, "unknowns": unknowns or []}


def decide(case: dict, intake: dict, passages: list[dict]) -> tuple[list[dict], dict]:
    cid = case["case_id"]
    required = set(case.get("required_evidence_section_ids", []))
    if not required or required - {p["section_id"] for p in passages}:
        raise SourceIntegrityError("Required condition evidence is missing from review")
    propositions = []
    source_consistency = {"status": "not_compared", "conflicts": [],
                          "note": "Cross-source consistency was not checked for this case."}
    if cid == "vitamix-2018-2024":
        later = [p for p in passages if p["notice_id"] == "9982" and p["section_role"] in {"identity_and_scope", "remedy"}]
        earlier = [p for p in passages if p["notice_id"] == "8374" and p["section_role"] in {"identity_and_scope", "remedy"}]
        repair = effective_fact(intake, "prior_repair_claim")
        if repair is True:
            propositions.append(proposition("Contradicted", "A claimed 2018 repair alone satisfies the later 2024 notice's remedy", later,
                "The retained 2024 notice says containers and blade bases are included even if repaired as part of the previous recall, and describes a new protective shroud kit. The intake claim is not independently verified."))
        else:
            propositions.append(proposition("Unresolved", "A claimed 2018 repair alone satisfies the later 2024 notice's remedy", later,
                "An affirmative prior-repair claim is not established for this proposition. New 2024 remedy facts are considered separately; an unchecked or unprovenanced value is unknown.", ["Whether an earlier repair is claimed with usable provenance."]))
        received, attached = effective_fact(intake, "kit_received"), effective_fact(intake, "kit_installed")
        if received is True and attached is True:
            status, unknowns = "Supported", []
            why = "Both selected-case facts are supplied with provenance: the new 2024 protective shroud kit was received and attached. These inputs are not independently verified, and item identity remains unconfirmed."
        elif received is False or attached is False:
            status, unknowns = "Contradicted", []
            why = "At least one usable supplied fact records that the new 2024 kit was not received or its protective shroud was not attached. An earlier kit or repair does not settle this later notice's remedy."
        else:
            status = "Unresolved"
            unknowns = [name for name, value in (("2024 protective shroud kit received", received), ("2024 protective shroud attached", attached)) if value is None]
            why = "At least one new 2024 remedy fact is unknown, unchecked, missing provenance or inconsistent with its provenance. An earlier repair does not supply these facts."
        propositions.append(proposition(status, "The supplied history records receipt and attachment of the new 2024 protective shroud remedy", later, why, unknowns))
        propositions.append(proposition("Unresolved", "The listed product identity is confirmed for this item", earlier + later,
            "This review has not verified the item's model, date code, or identity from a label or serial record.", ["Confirm the item against the notice's exact product identifiers."]))
    elif cid == "dr-power-mower-2026":
        received, installed = effective_fact(intake, "kit_received"), effective_fact(intake, "kit_installed")
        evidence = [p for p in passages if p["section_role"] in {"identity_and_scope", "remedy"}]
        if received is True and installed is True:
            status = "Supported"
            why = (f"Both required facts are supplied as yes. Receipt provenance: {fact_source(intake, 'kit_received')}; "
                   f"installation provenance: {fact_source(intake, 'kit_installed')}. The app has not independently verified these inputs.")
            unknowns = []
        elif received is False or installed is False:
            status = "Contradicted"
            why = "At least one required condition is supplied as no with usable provenance; the notice's exception requires kit receipt and installation. Unchecked values are not treated as absence."
            unknowns = []
        else:
            status = "Unresolved"
            why = "The notice requires both kit receipt and installation; at least one fact is unknown, unchecked, missing provenance or inconsistent with its provenance."
            unknowns = [name for name, value in (("repair kit received", received), ("repair kit installed", installed)) if value is None]
        propositions.append(proposition(status, "The supplied history meets the notice's received-and-installed repair-kit exception", evidence, why, unknowns))
        propositions.append(proposition("Unresolved", "This specific mower is confirmed inside the recalled model and serial scope", evidence,
            "This version does not perform serial-range matching. Model and serial inputs are not independently verified.", ["Confirm exact model and serial against the official table."]))
    elif cid == "york-api-page":
        comparison = load_json(DATA / "york-source-comparison.json")
        api_path = DATA / comparison["api_record_file"]
        api_bytes = api_path.read_bytes()
        if hashlib.sha256(api_bytes).hexdigest() != comparison.get("api_record_sha256"):
            raise SourceIntegrityError("York API record SHA-256 mismatch")
        api_record = json.loads(api_bytes)
        api = api_record["Remedies"][0]["Name"]
        html_notice = next(n for n in notices_by_id().values() if n["cpsc_id"] == "974")
        html_raw = (DATA / html_notice["source_text_file"]).read_bytes()
        html_section = next((s for s in html_notice["sections"]
                             if s["section_id"] == comparison.get("html_remedy_section_id")), None)
        if hashlib.sha256(html_raw).hexdigest() != html_notice["source_sha256"]:
            raise SourceIntegrityError("York webpage full-source SHA-256 mismatch")
        if html_notice["source_sha256"] != comparison.get("html_source_sha256") or html_notice["official_url"] != comparison.get("html_source"):
            raise SourceIntegrityError("York webpage snapshot identity does not match the source-comparison record")
        if not html_section:
            raise SourceIntegrityError("York webpage remedy-instructions section is missing")
        html = html_raw.decode("utf-8")[int(html_section["char_start"]):int(html_section["char_end_exclusive"])]
        if api != comparison.get("api_remedy_text"):
            raise SourceIntegrityError("York API remedy text does not match the retained API record")
        if html != comparison.get("html_remedy_text") or html_section["section_sha256"] != comparison.get("html_remedy_section_sha256"):
            raise SourceIntegrityError("York webpage remedy-instructions excerpt does not match the annotated source section")
        source_consistency = {"status": "conflict", "conflicts": [
            {"source": "retained API snapshot", "url": comparison.get("api_source"),
             "record_url": api_record.get("URL"), "record_id": api_record.get("RecallID"),
             "captured_at_utc": comparison.get("api_snapshot_retrieved_at_utc"),
             "record_sha256": comparison.get("api_record_sha256"), "text": api},
            {"source": "retained official webpage snapshot", "url": comparison.get("html_source"),
             "captured_at_utc": html_notice["source_retrieved_at_utc"],
             "source_sha256": html_notice["source_sha256"], "section_id": html_section["section_id"],
             "section_sha256": html_section["section_sha256"], "start_offset": html_section["char_start"],
             "end_offset": html_section["char_end_exclusive"], "remedy_type_label": comparison.get("html_remedy_type_text"),
             "text": html}],
            "note": comparison.get("interpretation")}
        propositions.append(proposition("Unresolved", "A prior repair history establishes eligibility for the refund", [p for p in passages if p["section_role"] == "remedy"],
            "The retained API remedy says inspect and repair; the retained official webpage says previously repaired units are not eligible for the refund. The review is blocked by source disagreement; no automatic resolution is made.", ["Human reviewer must inspect both retained sources and verify current official guidance."]))
        propositions.append(proposition("Unresolved", "This specific furnace is confirmed inside the notice's product scope", [p for p in passages if p["section_role"] == "identity_and_scope"],
            "This version does not perform furnace identity or serial-range matching. Supplied identifiers remain unverified.", ["Confirm exact furnace identity against the official notice."]))
    else:
        propositions.append(proposition("Unresolved", "The supplied history satisfies the selected notice condition", passages, "No configured condition rule exists for this case."))
    return propositions, source_consistency


def review(payload: dict, runtime: PrivateRuntime) -> dict:
    started = time.perf_counter()
    case_id = payload.get("case_id")
    case = next((x for x in load_json(CASES_PATH)["cases"] if x["case_id"] == case_id), None)
    if case is None:
        raise ValueError("Unknown case_id")
    known_notices = notices_by_id()
    for nid in case.get("notice_ids", []):
        if str(nid) not in known_notices:
            raise SourceIntegrityError(f"curated notice missing from manifest: {nid}")
        sections_for(known_notices[str(nid)])  # fail closed before producing any proposition
    intake = payload.get("history")
    if not isinstance(intake, dict):
        raise ValueError("history must be an object")
    fields = {"exact_model", "serial", "prior_repair_claim", "prior_action_date", "kit_received", "kit_installed"}
    if set(intake) - fields - {"fact_provenance"}:
        raise ValueError("history contains unsupported fields")
    if any(not isinstance(value, (str, bool)) or isinstance(value, str) and len(value) > 2000
           for name, value in intake.items() if name != "fact_provenance"):
        raise ValueError("history fields must be bounded strings or booleans")
    provenance = intake.get("fact_provenance", {})
    if not isinstance(provenance, dict) or set(provenance) - fields or any(not isinstance(v, str) or len(v) > 200 for v in provenance.values()):
        raise ValueError("fact_provenance must contain bounded field labels")
    if any(provenance_class(v) not in PROVENANCE_CLASSES for v in provenance.values()):
        raise ValueError("Unsupported provenance class")
    revision = payload.get("input_revision", 1)
    if type(revision) is not int or not 0 <= revision <= 2_147_483_647:
        raise ValueError("input_revision must be a non-negative integer")
    question = payload.get("question") or case.get("review_question") or "review remedy history"
    if not isinstance(question, str) or len(question) > 500:
        raise ValueError("question must be a string of at most 500 characters")
    passages = retrieve(case, question + " " + json.dumps(intake, ensure_ascii=False), limit=8)
    inference = {"available": False, "status": "unavailable", "model_id": MODEL_ID,
                 "model_revision": MODEL_REVISION, "device": "CPU only; execution not verified",
                 "signal_role": "secondary passage-reranking signal only; never decides a condition",
                 "ranking": [], "elapsed_seconds": None, "scores": [],
                 "note": "Pinned local model has not completed inference in this runtime."}
    if rank_nli is not None:
        try:
            nli = rank_nli(question + "\nSupplied history: " + json.dumps(intake, ensure_ascii=False),
                           [{"passage_id": p["section_id"], "text": p["text"]} for p in passages])
            inference.update({"available": nli.get("status") == "scored", "status": nli.get("status"),
                              "model_id": nli.get("model", MODEL_ID), "model_revision": nli.get("revision") or nli.get("pinned_revision", MODEL_REVISION),
                              "device": nli.get("device", "CPU unavailable"),
                              "id2label": {str(key): value for key, value in (nli.get("id2label") or {}).items()},
                              "elapsed_seconds": nli.get("inference_seconds", nli.get("elapsed_seconds")),
                              "abstention_reason": nli.get("abstention_reason"),
                              "ranking": nli.get("ranking", []), "scores": nli.get("passages", []),
                              "threads": nli.get("threads"), "torch": nli.get("torch"),
                              "load_seconds": nli.get("load_seconds"),
                              "note": "NLI scores are a secondary ranking aid, not calibrated probabilities or condition decisions."})
            order = {sid: i + 1 for i, sid in enumerate(inference["ranking"])}
            if order:
                for passage in passages:
                    passage["ai_rank"] = order.get(passage["section_id"])
                passages.sort(key=lambda p: order.get(p["section_id"], len(order) + 1))
            scores = {x["passage_id"]: x for x in inference["scores"]}
            for passage in passages:
                passage["ai_signal"] = scores.get(passage["section_id"])
        except Exception as exc:
            inference.update({"status": "inference_error", "abstention_reason": f"{type(exc).__name__}; rule review retained",
                              "note": "Model execution failed; rule-supported propositions and citations are retained. No model result is inferred."})
    propositions, consistency = decide(case, intake, passages)
    canonical_inputs = json.dumps({"case_id": case_id, "history": intake, "question": question},
                                  ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    input_digest = hashlib.sha256(canonical_inputs.encode("utf-8")).hexdigest()
    output = {
        "schema_version": "1.1", "case_id": case_id,
        "created_at_utc": datetime.now(timezone.utc).isoformat(),
        "jurisdiction": "United States; U.S. CPSC retained public notice snapshots",
        "fixture_status": case.get("fixture_status", "constructed functional fixture"),
        "input_revision": revision, "history": intake,
        "input_digest_sha256": input_digest,
        "input_provenance": {"fixture_status": case.get("fixture_status", "constructed functional fixture"),
                             "field_sources": intake.get("fact_provenance", {}) if isinstance(intake.get("fact_provenance", {}), dict) else {},
                             "effective_condition_facts": {name: "yes" if effective_fact(intake, name) is True else "no" if effective_fact(intake, name) is False else "unknown" for name in ("prior_repair_claim", "kit_received", "kit_installed")},
                             "note": "Supplied statements and confirmations are not independently verified. Unchecked, unprovenanced or internally inconsistent yes/no values are treated as unknown."},
        "review_method_version": "notice-conditions-2026-10-17.2",
        "question": question, "identity_status": "unconfirmed; reviewer-supplied facts are not independently verified",
        "source_consistency": consistency, "propositions": propositions, "passages": passages,
        "inference": inference,
        "rule_baseline": {"status": "available", "source": "notice-specific explicit condition rules", "outcomes": [x["status"] for x in propositions]},
        "truncation": {"occurred": any((p.get("ai_signal") or {}).get("truncated", False) for p in passages),
                       "status": "unresolved" if any((p.get("ai_signal") or {}).get("truncated", False) for p in passages) else "none"},
        "elapsed_ms": round((time.perf_counter() - started) * 1000, 2),
        "storage_security": {"at_rest": "AES-256-GCM", "schema": "oqvian.receipt-vault.v1",
                             "authorization": "shared private reviewer; HTTP Basic over SSH tunnel",
                             "digest_scope": "canonical receipt content excluding review_id and receipt_digest_sha256; vault authenticates storage ID",
                             "limits": "No per-person roles; same-UID/root operators and key-holding process compromise are outside this boundary."},
        "limitations": ["Human review aid; not a safety, legal, refund, or resale determination.",
                        "Constructed intake history; source snapshots are dated and live freshness is not established.",
                        "Lexical retrieval is the candidate-set baseline; the model only reranks passages and does not make the stated condition result.",
                        "A missing or truncated passage causes abstention/uncertainty; scores are not calibrated probabilities."],
    }
    output["receipt_digest_sha256"] = hashlib.sha256(json.dumps(output, sort_keys=True, ensure_ascii=False, separators=(",", ":")).encode("utf-8")).hexdigest()
    return runtime.persist(output)


def read_verified_receipt(runtime: PrivateRuntime, receipt_id: str):
    receipt = runtime.retrieve(receipt_id)
    digest = receipt.pop("receipt_digest_sha256", None)
    content = {key: value for key, value in receipt.items() if key != "review_id"}
    actual = hashlib.sha256(json.dumps(content, sort_keys=True, ensure_ascii=False, separators=(",", ":")).encode("utf-8")).hexdigest()
    receipt["receipt_digest_sha256"] = digest
    if not digest or digest != actual:
        raise SourceIntegrityError("review receipt SHA-256 mismatch")
    return receipt


class Handler(BaseHTTPRequestHandler):
    server_version = "OQVIAN"
    sys_version = ""

    def setup(self):
        super().setup()
        self.connection.settimeout(30)

    def _request_allowed(self):
        host = self.headers.get("Host", "").lower()
        if host not in self.server.allowed_hosts:
            self._json(403, {"error": "host_not_allowed"})
            return False
        if not self.server.private_runtime.authorized(self.headers.get("Authorization", "")):
            body = b'{"error":"authentication_required"}'
            self.send_response(401)
            self.send_header("WWW-Authenticate", 'Basic realm="OQVIAN private review", charset="UTF-8"')
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self._security_headers()
            self.end_headers()
            self.wfile.write(body)
            return False
        return True

    def _security_headers(self):
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("X-Frame-Options", "DENY")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("Cross-Origin-Resource-Policy", "same-origin")
        self.send_header("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; base-uri 'none'; frame-ancestors 'none'; form-action 'self'")
        self.send_header("Cache-Control", "no-store")

    def _json(self, status: int, value):
        body = json.dumps(value, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self._security_headers()
        self.end_headers()
        self.wfile.write(body)

    def _file(self, path: Path):
        if not path.is_file():
            self._json(404, {"error": "not_found"})
            return
        body = path.read_bytes()
        mime = mimetypes.guess_type(str(path))[0] or "application/octet-stream"
        self.send_response(200)
        self.send_header("Content-Type", mime)
        self.send_header("Content-Length", str(len(body)))
        self._security_headers()
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        try:
            parsed = urlparse(self.path)
        except ValueError:
            return self._json(400, {"error": "invalid_request_path"})
        path = unquote(parsed.path)
        if path == "/api/health":
            return self._json(200, {"ok": True, "service": "oqvian-recall-remedy-review", "model_id": MODEL_ID,
                                   "model_revision": MODEL_REVISION, "model_device": "CPU; lazy-load on first review",
                                   "ai_available": None, "ai_status": "lazy-load on the first review; not executed in health check"})
        if not self._request_allowed():
            return
        if path == "/api/notices":
            return self._json(200, {"notices": [{k: n.get(k) for k in ("cpsc_id", "document_title", "official_url", "publication_date", "source_update_note", "source_sha256", "source_retrieved_at_utc", "source_version_status")} for n in load_json(NOTICE_MANIFEST)["notices"]]})
        if path == "/api/cases":
            return self._json(200, load_json(CASES_PATH))
        match = re.fullmatch(r"/api/reviews/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})(/export)?", path)
        if match:
            rid, export = match.group(1), match.group(2)
            try:
                verified = read_verified_receipt(self.server.private_runtime, rid)
            except (VaultError, SourceIntegrityError, OSError, ValueError):
                return self._json(409, {"error": "receipt_unavailable_or_integrity_failure"})
            if not export:
                return self._json(200, verified)
            body = (json.dumps(verified, indent=2, ensure_ascii=False) + "\n").encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Disposition", f'attachment; filename="oqvian-review-{rid}.json"')
            self.send_header("Content-Length", str(len(body)))
            self._security_headers()
            self.end_headers()
            return self.wfile.write(body)
        try:
            candidate = (FRONTEND / ("index.html" if path == "/" else path.lstrip("/"))).resolve()
        except (ValueError, OSError):
            return self._json(404, {"error": "not_found"})
        permitted = {".html", ".css", ".js", ".png", ".jpg", ".jpeg", ".webp", ".svg", ".ico", ".woff", ".woff2"}
        if candidate.is_relative_to(FRONTEND) and not any(part.startswith(".") for part in candidate.relative_to(FRONTEND).parts) and candidate.suffix.lower() in permitted:
            return self._file(candidate)
        self._json(404, {"error": "not_found"})

    def do_POST(self):
        if not self._request_allowed():
            return
        try:
            post_path = urlparse(self.path).path
            origin = self.headers.get("Origin")
            parsed_origin = urlparse(origin) if origin else None
        except ValueError:
            return self._json(400, {"error": "invalid_request_metadata"})
        if post_path != "/api/reviews":
            return self._json(404, {"error": "not_found"})
        if self.headers.get("Sec-Fetch-Site") == "cross-site" or parsed_origin and (
            parsed_origin.scheme != "http" or parsed_origin.netloc.lower() != self.headers.get("Host", "").lower()
            or parsed_origin.path not in {"", "/"} or parsed_origin.query or parsed_origin.fragment
        ):
            return self._json(403, {"error": "origin_not_allowed"})
        if self.headers.get("Content-Type", "").split(";", 1)[0].strip().lower() != "application/json" or self.headers.get("Transfer-Encoding"):
            return self._json(415, {"error": "json_content_type_required"})
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length <= 0 or length > 100_000:
                return self._json(413, {"error": "invalid_body_size"})
            payload = json.loads(self.rfile.read(length), object_pairs_hook=request_object)
            if not isinstance(payload, dict):
                raise ValueError("body must be an object")
            if not REVIEW_LOCK.acquire(blocking=False):
                return self._json(503, {"error": "review_busy", "detail": "One CPU review is active; retry shortly."})
            try:
                result = review(payload, self.server.private_runtime)
            finally:
                REVIEW_LOCK.release()
            return self._json(201, result)
        except SourceIntegrityError:
            return self._json(409, {"error": "source_integrity_failure", "detail": "Retained source verification failed."})
        except (ValueError, TypeError, OverflowError, json.JSONDecodeError):
            return self._json(400, {"error": "invalid_input", "detail": "Check the case, history fields, question and revision."})
        except (RecursionError, UnicodeError):
            return self._json(400, {"error": "invalid_json"})
        except TimeoutError:
            return self._json(408, {"error": "request_timeout"})
        except (VaultError, OSError):
            return self._json(503, {"error": "private_storage_unavailable"})

    def log_message(self, fmt, *args):
        # Do not log request URLs/queries, Authorization, bodies or receipt values.
        pass

    def log_request(self, code='-', size='-'):
        print(f"[{self.log_date_time_string()}] method={self.command} status={code}", flush=True)


if __name__ == "__main__":
    os.umask(0o077)
    host = os.environ.get("OQVIAN_HOST", "127.0.0.1")
    port = int(os.environ.get("OQVIAN_PORT", "8000"))
    try:
        runtime = PrivateRuntime()
    except (KeyError, ValueError, OSError, ImportError, VaultError):
        raise SystemExit("Startup refused: configure private authentication, encryption key, vault modes and cryptography dependency.")
    server = ThreadingHTTPServer((host, port), Handler)
    server.daemon_threads = True
    server.private_runtime = runtime
    server.allowed_hosts = {item.strip().lower() for item in os.environ.get("OQVIAN_ALLOWED_HOSTS", f"127.0.0.1:{port},localhost:{port}").split(",") if item.strip()}
    print(f"OQVIAN review service listening at http://{host}:{port} (loopback only by default)")
    server.serve_forever()
