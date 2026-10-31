---
"react-native-node-api": patch
---

Install a Hermes fatal handler when the host library loads, on Android and Apple platforms. Hermes' fatal errors, including those that never pass through Node-API, are now logged through the host logger before the process aborts, so they reach logcat on Android instead of only stderr. The handler is process-wide: it replaces one set before the host library loads, and one set afterwards replaces it.
