---
"react-native-node-api": patch
---

Drop the host's shadowing `napi_fatal_error` in favor of Hermes' own implementation. Fatal Node-API errors still abort the process, but on Android their message now goes to stderr instead of logcat.
