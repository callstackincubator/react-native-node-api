# gyp-to-cmake

## 0.5.2

### Patch Changes

- Updated dependencies [441dcc4]
  - @react-native-node-api/cli-utils@0.1.3

## 0.5.1

### Patch Changes

- Updated dependencies [7ff2c2b]
  - @react-native-node-api/cli-utils@0.1.2

## 0.5.0

### Minor Changes

- 60fae96: Use `find_package` instead of `include` to locate "weak-node-api"

## 0.4.0

### Minor Changes

- 5156d35: Use of CMake targets producing Apple frameworks instead of free dylibs is now supported

### Patch Changes

- 5156d35: Refactored moving prettyPath util to CLI utils package
- Updated dependencies [5156d35]
  - @react-native-node-api/cli-utils@0.1.1

## 0.3.0

### Minor Changes

- ff34c45: Add --weak-node-api option to emit CMake configuration for use with cmake-rn's default way of Node-API linkage.

### Patch Changes

- 2a30d8d: Refactored CLIs to use a shared utility package

## 0.2.0

### Minor Changes

- 4379d8c: Initial release
