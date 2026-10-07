---
"react-native-node-api": minor
---

Add a `prebuilt-hermes` command, which resolves an archive of the pinned Hermes
commit prebuilt for Apple platforms and prints its path. The archive holds the
`destroot` layout React Native's `hermes-engine.podspec` expects from a tarball
pointed at by `HERMES_ENGINE_TARBALL_PATH`, so an app that sets that variable
vendors the prebuilt frameworks rather than compiling Hermes as part of its own
build.

It is resolved from a local cache, then from a release asset published for the
pinned commit, and only built locally if neither has it. Its name covers
everything that changes its contents — the pinned commit, the React Native
version whose `ReactCommon/jsi` it is compiled against, the build type and the
platforms — so a stale archive can never be mistaken for a matching one.

Nothing consumes this yet: `pod install` still builds Hermes from source.
