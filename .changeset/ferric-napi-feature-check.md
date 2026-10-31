---
"ferric-cli": minor
---

Check the crate's resolved `napi-sys` features before building and fail if `dyn-symbols` is enabled, as it prevents linking against `weak-node-api`. Pass `--skip-feature-check` to bypass.
