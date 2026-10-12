---
"react-native-node-api": minor
---

Provide a `hermes_napi_host` implementation to the Hermes Node-API environments. This enables thread-safe functions (`napi_create_threadsafe_function` and friends) and moves `napi_async_work` execution onto a worker pool — previously the `execute` callback ran on the JavaScript thread, blocking it for the duration of the work. The host is also in place before an addon's module init runs, so async work and thread-safe functions can now be created during initialization.
