---
"react-native-node-api": minor
---

Route `napi_fatal_exception` through React Native's `ErrorUtils.reportFatalError` instead of unconditionally logging and calling `abort()`. This is what node-addon-api calls whenever an exception escapes a thread-safe-function callback, so a single throwing tsfn callback no longer hard-kills the app: in dev the error and its stack now surface in LogBox, in release RN's default handler rethrows into the native crash path, and apps can observe or handle it via `ErrorUtils.setGlobalHandler` — the moral equivalent of Node's `'uncaughtException'`. The previous stringify-and-abort behavior remains as a fallback for when `ErrorUtils`/`reportFatalError` isn't available (non-RN embedders, very early startup) or the handler itself throws.
