# `cmake-rn`

A wrapper around Cmake making it easier to produce prebuilt binaries targeting iOS and Android matching [the prebuilt binary specification](https://github.com/callstackincubator/react-native-node-api/blob/main/docs/PREBUILDS.md).

Serves the same purpose as `cmake-js` does for the Node.js community and could potentially be upstreamed into `cmake-js` eventually.

## Linking against Node-API

Android's dynamic linker impose restrictions on the access to global symbols (such as the Node-API free functions): A dynamic library must explicitly declare any dependency bringing symbols it needs as `DT_NEEDED`.

The implementation of Node-API is split between Hermes and our host package and to avoid addons having to explicitly link against either, we've introduced a `weak-node-api` library (published in `react-native-node-api` package). This library expose only Node-API and will have it's implementation injected by the host.

To link against `weak-node-api` just include the CMake config exposed through `WEAK_NODE_API_CONFIG` and add `weak-node-api` to the `target_link_libraries` of the addon's library target.

```cmake
cmake_minimum_required(VERSION 3.15...3.31)
project(tests-buffers)

include(${WEAK_NODE_API_CONFIG})

add_library(addon SHARED addon.c)
target_link_libraries(addon PRIVATE weak-node-api)
target_compile_features(addon PRIVATE cxx_std_20)
```

This is different from how `cmake-js` "injects" the Node-API for linking (via `${CMAKE_JS_INC}`, `${CMAKE_JS_SRC}` and `${CMAKE_JS_LIB}`). To allow for interoperability between these tools, we inject these when you pass `--cmake-js` to `cmake-rn`.
