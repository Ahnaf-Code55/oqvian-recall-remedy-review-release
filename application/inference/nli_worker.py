"""Bounded CPU NLI passage-ranking worker for OQVIAN Recall Remedy Review.

Scores (premise=official passage, hypothesis=review claim) pairs with the pinned
cross-encoder and returns raw logits/softmax as a secondary, inspectable signal.
It never decides a remedy, condition or eligibility. Loads from the local cache
only; installation is a separate step (see README.md).

Usage: python nli_worker.py < request.json
  request: {"hypothesis": str, "passages": [{"passage_id": str, "text": str}]}
"""
import json
import os
import sys
import time
from pathlib import Path

MODEL_ID = "cross-encoder/nli-MiniLM2-L6-H768"
REVISION = "b95119ce93d3e065de6214e38cd4a97b0f2f2c6d"
MAX_PASSAGES = 32
SIGNAL_ROLE = "secondary ranking signal only; not a remedy, condition or eligibility decision; scores are not calibrated probabilities"

_loaded = None  # (tokenizer, model, meta) or (None, None, {"error": ...})


def load():
    """Load once from local cache on CPU. Never raises; failure is recorded in meta['error']."""
    global _loaded
    if _loaded:
        return _loaded
    started = time.perf_counter()
    try:
        import torch
        from huggingface_hub import snapshot_download
        from transformers import AutoModelForSequenceClassification, AutoTokenizer

        torch.set_num_threads(int(os.environ.get("OQVIAN_NLI_THREADS", "3")))
        # Resolve strictly from the already-cached, exact revision. Some Transformers
        # versions leave config._commit_hash unset for local-only loads, so verify the
        # Hugging Face cache snapshot path itself and load from that resolved directory.
        snapshot = Path(snapshot_download(
            MODEL_ID, revision=REVISION, local_files_only=True,
            allow_patterns=["config.json", "model.safetensors", "tokenizer.json",
                            "tokenizer_config.json", "special_tokens_map.json",
                            "vocab.txt", "vocab.json", "merges.txt"],
        )).resolve()
        if snapshot.parent.name != "snapshots" or snapshot.name != REVISION:
            raise RuntimeError(f"resolved local snapshot {snapshot.name!r} does not match pinned {REVISION}")
        kw = dict(trust_remote_code=False, local_files_only=True)
        tokenizer = AutoTokenizer.from_pretrained(str(snapshot), **kw)
        model = AutoModelForSequenceClassification.from_pretrained(
            str(snapshot), use_safetensors=True, dtype=torch.float32, attn_implementation="eager", **kw
        ).to("cpu").eval()
        cfg = model.config
        deployed = snapshot.name
        # Label order comes from the deployed config, never from an assumed index.
        id2label = {int(k): v for k, v in cfg.id2label.items()}
        if sorted(v.lower() for v in id2label.values()) != ["contradiction", "entailment", "neutral"]:
            raise RuntimeError(f"unexpected id2label {id2label}")
        meta = {
            "model": MODEL_ID,
            "revision": deployed,
            "id2label": id2label,
            "max_tokens": min(tokenizer.model_max_length, cfg.max_position_embeddings),
            "device": str(next(model.parameters()).device),
            "threads": torch.get_num_threads(),
            "torch": torch.__version__,
            "load_seconds": time.perf_counter() - started,
            "snapshot_verified": True,
        }
        _loaded = (tokenizer, model, meta)
    except Exception as e:  # missing cache, bad revision, import failure: inference unavailable
        _loaded = (None, None, {"model": MODEL_ID, "revision": None, "pinned_revision": REVISION,
                                "error": f"{type(e).__name__}: {e}"})
    return _loaded


def rank(hypothesis, passages):
    """Return per-passage raw scores and an entailment-ordered ranking, or an abstention."""
    started = time.perf_counter()
    tokenizer, model, meta = load()
    out = {"signal_role": SIGNAL_ROLE, "pinned_revision": REVISION, **meta,
           "status": "scored", "abstention_reason": None, "ranking": [], "passages": []}

    def abstain(status, reason):
        out.update(status=status, abstention_reason=reason, elapsed_seconds=time.perf_counter() - started)
        return out

    if model is None:
        return abstain("inference_unavailable", meta["error"])
    if not isinstance(hypothesis, str) or not hypothesis.strip():
        return abstain("invalid_input", "hypothesis must be a non-empty string")
    if not isinstance(passages, list) or not passages or len(passages) > MAX_PASSAGES:
        return abstain("invalid_input", f"passages must be a list of 1..{MAX_PASSAGES} items")
    if any(not isinstance(p, dict) or not str(p.get("passage_id") or "").strip()
           or not isinstance(p.get("text"), str) or not p["text"].strip() for p in passages):
        return abstain("invalid_input", "each passage needs a non-empty passage_id and text")

    import torch

    entail = next(i for i, v in meta["id2label"].items() if v.lower() == "entailment")
    scorable = []
    for p in passages:
        n = len(tokenizer(p["text"], hypothesis, truncation=False)["input_ids"])
        row = {"passage_id": p["passage_id"], "pair_tokens": n, "truncated": n > meta["max_tokens"],
               "logits": None, "softmax": None, "abstention_reason": None}
        if row["truncated"]:
            # Never score a silently cut passage: an exception clause could be in the cut part.
            row["abstention_reason"] = f"pair is {n} tokens, model limit {meta['max_tokens']}; truncation unresolved"
        else:
            scorable.append((row, p["text"]))
        out["passages"].append(row)

    if scorable:
        feats = tokenizer([t for _, t in scorable], [hypothesis] * len(scorable),
                          padding=True, truncation=False, return_tensors="pt")
        t0 = time.perf_counter()
        with torch.no_grad():
            logits = model(**feats).logits
        out["inference_seconds"] = time.perf_counter() - t0
        for (row, _), lg, sm in zip(scorable, logits.tolist(), logits.softmax(-1).tolist()):
            row["logits"], row["softmax"] = lg, sm
        out["ranking"] = [r["passage_id"] for r, _ in
                          sorted(scorable, key=lambda x: x[0]["softmax"][entail], reverse=True)]
        out["ranking_key"] = f"softmax[{entail}] ({meta['id2label'][entail]})"
    else:
        out.update(status="abstained", abstention_reason="no passage fits the model context")
    out["elapsed_seconds"] = time.perf_counter() - started
    return out


if __name__ == "__main__":
    try:
        req = json.load(sys.stdin)
        result = rank(req.get("hypothesis"), req.get("passages"))
    except (ValueError, AttributeError) as e:
        result = {"signal_role": SIGNAL_ROLE, "status": "invalid_input", "abstention_reason": str(e)}
    print(json.dumps(result, indent=2, ensure_ascii=False))
    sys.exit(0 if result["status"] in ("scored", "abstained") else 2)
