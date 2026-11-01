---
"cmake-rn": major
"react-native-node-api": minor
"weak-node-api": minor
---

Add `--node-api-linkage <weak-node-api|hermes|none>` to `cmake-rn`, replacing `--no-weak-node-api-linkage` (use `--node-api-linkage none`).

Addons linking the new neutral `node-api-linkage` CMake target (`find_package(node-api-linkage REQUIRED CONFIG)`) link whatever the mode selects. With `hermes` they link a link-time stub of `libhermesvm`, so they record `hermesvm` and call Hermes directly instead of going through `weak-node-api`. The stub is generated from the Node-API headers and built alongside `weak-node-api`; it never ships in an app. Addons naming the `weak-node-api` target directly keep linking it in every mode but `none`. The default stays `weak-node-api`.
