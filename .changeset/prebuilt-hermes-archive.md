---
"react-native-node-api": minor
---

Stop compiling Hermes as part of every iOS app build. The Cocoapods integration
now resolves the pinned commit with `prebuilt-hermes` and hands the archive's
path to React Native through `HERMES_ENGINE_TARBALL_PATH` — so
`hermes-engine.podspec` vendors the prebuilt frameworks instead of running its
"Build Hermesc" and "Build Hermes" script phases.

Building Hermes from source remains available and is the faster loop while
iterating on Hermes itself, since Xcode then rebuilds it incrementally: set
`REACT_NATIVE_NODE_API_HERMES_FROM_SOURCE=1` before `pod install`. Setting
`REACT_NATIVE_OVERRIDE_HERMES_DIR` or `HERMES_ENGINE_TARBALL_PATH` yourself
still takes precedence, and Android is unchanged.
