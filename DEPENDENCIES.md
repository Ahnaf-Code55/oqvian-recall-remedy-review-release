# Dependencies and separate licensing

This source snapshot contains no vendored package binaries, `node_modules`, built frontend, model weights, or container image. Dependency records are in `application/frontend/package.json` and `package-lock.json`.

## Frontend

Direct packages: React and React DOM (MIT); TypeScript (Apache-2.0); Vite and oxlint (MIT). The lockfile's license metadata also identifies transitive packages under MIT, Apache-2.0, MPL-2.0, ISC and BSD-3-Clause. Each package remains governed by its own license. Installing dependencies or redistributing a compiled bundle can trigger separate notice obligations; retain the applicable upstream notices.

## Backend and inference

The HTTP server uses Python's standard library. Receipt encryption requires `cryptography`; optional model ranking uses CPU PyTorch, Transformers and huggingface_hub. The project does not vendor those packages or their transitive dependencies. They must be resolved for the target s390x environment and their license notices retained for any binary/container distribution.

The NLI checkpoint is referenced by model ID and immutable revision in `application/inference/nli_worker.py`; it is not included. Read its pinned model card and license before separately downloading or redistributing it.
