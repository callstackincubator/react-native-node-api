# react-native-node-api

## 0.6.2

### Patch Changes

- 07ea9dc: Add x86_64 and universal simulator triplets
- 7536c6c: Add --react-native-package option to "vendor-hermes" command, allowing caller to choose the package to download hermes into
- c698698: Moved and simplify Apple host TurboModule
- a2fd422: Detects "pod install" from React Native MacOS apps and vendors Hermes accordingly
- bdc172e: Add explicit support for React Native v0.79.7
- 4672e01: Warn on "pod install" with the new architecture disabled

## 0.6.1

### Patch Changes

- 5c3de89: Rebuild any dSYM directory when linking frameworks.
- bb9a78c: Fixed visualizing duplicate library names

## 0.6.0

### Minor Changes

- 5156d35: Use of CMake targets producing Apple frameworks instead of free dylibs is now supported
- 5016ed2: Scope is now stripped from package names when renaming libraries while linking

### Patch Changes

- acd06f2: Linking Node-API addons for Apple platforms is no longer re-creating Xcframeworks
- 9f1a301: Fix requireNodeAddon return type
- 5156d35: Refactored moving prettyPath util to CLI utils package
- Updated dependencies [5156d35]
  - @react-native-node-api/cli-utils@0.1.1

## 0.5.2

### Patch Changes

- 2b9a538: Handle Info.plist lookup in versioned frameworks

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
