# react-native-node-api

## 0.3.3

### Patch Changes

- a477b84: Added implementation of napi_fatal_error, napi_get_node_version and napi_get_version. Improved the Logger functionalities
- dc33f3c: Added implementation of async work runtime functions
- 4924f66: Refactor into a platform abstraction
- acf1a7c: Treating failures when scanning filesystems for Node-API prebuilds more gracefully

## 0.3.2

### Patch Changes

- 045e9e5: Fix hasDuplicateLibraryNames by filtering out node_modules in package rootse

## 0.3.1

### Patch Changes

- 7ad62f7: Adding support for React Native 0.79.3, 0.79.4 & 0.79.5

## 0.3.0

### Minor Changes

- bd733b8: Derive the tag used to clone the React Native fork bringing Node-API support from the .hermesversion file in the react-native package.

### Patch Changes

- b771a27: Removed unused Codegen related configurations.

## 0.2.0

### Minor Changes

- 4379d8c: Initial release
