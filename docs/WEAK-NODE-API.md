# The `weak-node-api` library

Android's dynamic linker imposes restrictions on the access to global symbols (such as the Node-API free functions): A dynamic library must explicitly declare any dependency bringing symbols it needs as `DT_NEEDED`.

The implementation of Node-API is split between Hermes and our host package and to avoid addons having to explicitly link against either, we've introduced a `weak-node-api` library (published in `react-native-node-api` package). This library exposes only Node-API and will have its implementation injected by the host.

While technically not a requirement on non-Android platforms, we choose to make this the general approach across React Native platforms. This keeps things aligned across platforms, while exposing just the Node-API without forcing libraries to build with suppression of errors for undefined symbols.
