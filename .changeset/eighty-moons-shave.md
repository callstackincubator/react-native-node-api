---
"react-native-node-api": major
"weak-node-api": minor
---

Adopt Hermes' first-party Node-API (the `hermesNapi` target on the `static_h`
branch) instead of patching Hermes with our own implementation. Addons now run
against a real Node-API environment created with `hermes_napi_create_env()`, one
per addon as in Node, and Node-API is bumped from v8 to v10.

This drops support for React Native 0.79–0.81: the vendored Hermes is built from
a pinned `static_h` commit and requires the Hermes build scripts shipped with
React Native 0.87 and later. Older React Native versions are still served by
previously published releases.
