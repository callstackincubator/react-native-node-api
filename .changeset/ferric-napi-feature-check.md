---
"ferric-cli": minor
---

Check the crate's resolved `napi-sys` features before building and fail if `dyn-symbols` is enabled (it prevents linking against `weak-node-api`) or a `napiN` feature above the supported Node-API version 10. Pass `--skip-feature-check` to bypass.
