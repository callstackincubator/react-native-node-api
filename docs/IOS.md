# iOS support

Because we're using a version of Hermes patched with Node-API support, we need to build React Native from source. Special environment variables (`REACT_NATIVE_OVERRIDE_HERMES_DIR`, `BUILD_FROM_SOURCE`) must be set to the path of a Hermes engine with Node-API support. The podspec of the iOS Pod already includes instrumentation to configure React Native appropriately via [`patch-hermes.rb`](../packages/host/scripts/patch-hermes.rb).
