# OQVIAN Recall Remedy Review

**[Open the public demo](https://ahnaf-code55.github.io/oqvian-recall-remedy-review-release/)** — live LinuxONE CPU app plus a separately labeled rules-only fallback. See [PUBLIC-DEMO.md](PUBLIC-DEMO.md) for access and hosting limits.

A source release of the IBM Z Datathon 2026 project. The app helps a human reviewer compare a stated repair history with conditions in retained U.S. CPSC recall notices. It presents cited passages, unknown facts and source conflicts. It does not determine product safety, eligibility, refund entitlement or permission to resell.

## Evidence boundaries

- The DR Power, Vitamix and York histories are constructed fixtures, not customer cases or observed owner histories.
- The retained CPSC pages are dated snapshots; their current live status is not established.
- Product identity and serial-range matching remain unresolved.
- The York source disagreement is shown to a human and not automatically reconciled.
- The pinned NLI model is an optional CPU passage-ranking signal, not a decision maker. In one small, team-authored, unblinded five-pair comparison, it ranked the expected passage top-one in 3/5 cases versus 4/5 for lexical retrieval. This does not show an AI improvement or real-world accuracy.
- A private LinuxONE s390x CPU run and private staging HTTP observations were recorded for constructed data. They are not a public deployment or performance benchmark, and no Telum/NNPA acceleration is claimed.

## Run the frontend demo

```sh
cd application/frontend
npm ci
npm run dev
```

Without `VITE_API_BASE_URL`, the frontend uses its local rules-only interface demo and labels inference unavailable. To build static files, run `npm run build` in that directory.

## Backend and model

The backend is Python and uses the standard library plus `cryptography` for authenticated encrypted receipts. Optional inference requires CPU PyTorch, Transformers, `huggingface_hub`, and the exact pinned model revision recorded in `application/inference/nli_worker.py`. Model weights are not included. The worker loads only a matching local cache snapshot and abstains when unavailable. Package versions and platform wheels must be resolved for the target LinuxONE image before deployment; this release does not bundle an image, environment, model, or credentials.

The private API requires `OQVIAN_AUTH_FILE`, `OQVIAN_RECEIPT_KEY_FILE`, and `OQVIAN_RECEIPTS_DIR`. Keep credentials/key/vault state outside Git, in separate app-owned directories/files with the strict permissions described in `application/backend/API-CONTRACT.md`. Set `OQVIAN_NOTEBOOK_SHARED_ROOTS` to a path-list of every notebook/shared mount where private state must be refused; the default is `~/shared`. Never put secrets or receipts in a notebook workspace or Git checkout. The service is a private single-reviewer demo; use an approved private transport. This repository does not provide public production hosting.

## Public-release scope

This is a curated source snapshot from development commit `d15cd12a90953bf65a1adf1edfd266a908c04f60`, with environment-specific mount paths replaced by the required `OQVIAN_NOTEBOOK_SHARED_ROOTS` setting. It excludes Git history, private deployment/evidence notes, screenshots, videos, pitch assets, model weights, generated build output, dependency installations, and OQVIAN logo/favicons whose separate redistribution terms were not confirmed. The frontend uses a simple text mark in their place.

Application code is offered under Apache-2.0; see `LICENSE`. CPSC text and separately fetched libraries/model keep their own terms; see `NOTICE` and `DEPENDENCIES.md`. Apache-2.0 does not grant OQVIAN name or trademark rights.

## Team

See [CONTRIBUTORS.md](CONTRIBUTORS.md) for the four team members and their recorded contributions.

For the authenticated backend deployment, build the frontend with `VITE_SERVICE_MODE=live npm run build`. The default development command above deliberately opens the labeled rules-only interface demo. Keep the live service on private loopback transport; do not place credentials in Vite configuration.
