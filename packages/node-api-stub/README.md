# Node-API stub

Describes the Node-API functions declared by [`node-api-headers`](https://www.npmjs.com/package/node-api-headers) and generates a link-time stub of a library exporting them.

This package is part of the [Node-API for React Native](https://github.com/callstackincubator/react-native-node-api) project.

## The stub

Linking an addon against the stub makes it record the stub's library name (`hermesvm` by default) as a dependency, so it calls that library's Node-API directly at runtime. The stub is only ever linked against: every function aborts, and it's never shipped in an app.

`CMakeLists.txt` defines the `node-api-stub` target, excluded from `all`. It expects `NODE_API_INC` to point at the Node-API headers, and `NODE_API_STUB_LIBRARY_NAME` picks the library it stands in for. [`cmake-rn`](../cmake-rn) adds it to an addon's build when passed `--node-api-linkage hermes`.
