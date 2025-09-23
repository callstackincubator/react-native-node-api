# react-native-node-api

## 0.5.1

### Patch Changes

- 2a30d8d: Refactored CLIs to use a shared utility package
- c72970f: Move REACT_NATIVE_OVERRIDE_HERMES_DIR out of tasks to fail earlier

## 0.5.0

### Minor Changes

- 75aaed1: Add explicit support for React Native 0.81.2, 0.81.3 and 0.81.4
- 90a1471: Assert that REACT_NATIVE_OVERRIDE_HERMES_DIR is set when Android / Gradle projects depend on the host package

### Patch Changes

- 90a1471: Fix auto-linking from Gradle builds on Windows

## 0.4.0

### Minor Changes

- a0212c8: Add explicit support for React Native 0.81.1 (0.79.6, 0.80.0, 0.80.1, 0.80.2 & 0.81.0)

### Patch Changes

- a0212c8: Fix host library to not explicitly link with weak-node-api and instead rely on dlopen

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
