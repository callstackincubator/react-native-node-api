---
"cmake-rn": major
"react-native-node-api": minor
"weak-node-api": minor
"node-api-stub": minor
---

Add `--node-api-linkage <weak-node-api|hermes|none>` to `cmake-rn`, replacing `--no-weak-node-api-linkage` (use `--node-api-linkage none`).

Addons linking the new `node-api` CMake target (`find_package(node-api REQUIRED CONFIG)`) link whatever the mode selects. With `hermes` they link a link-time stub of `libhermesvm`, built along with the addon, so they record `hermesvm` and call Hermes directly instead of going through `weak-node-api`, which doesn't need to be built. The stub never ships in an app. Addons naming the `weak-node-api` target directly keep building alongside. The default stays `weak-node-api`.

The new `node-api-stub` package holds the stub and `getNodeApiFunctions()`, which moved there from `weak-node-api`.
