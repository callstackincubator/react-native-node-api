# cmake-rn

## 0.5.0

### Minor Changes

- 5156d35: Use of CMake targets producing Apple frameworks instead of free dylibs is now supported

### Patch Changes

- d8e90a8: Filter CMake targets by target name when passed
- 0c3e8ba: Fix expansion of options in --build and --out
- 5156d35: Refactored moving prettyPath util to CLI utils package
- Updated dependencies [acd06f2]
- Updated dependencies [5156d35]
- Updated dependencies [9f1a301]
- Updated dependencies [5016ed2]
- Updated dependencies [5156d35]
  - react-native-node-api@0.6.0
  - @react-native-node-api/cli-utils@0.1.1

## 0.4.1

### Patch Changes

- a23af5a: Use CMake file API to read shared library target paths
- Updated dependencies [2b9a538]
  - react-native-node-api@0.5.2

## 0.4.0

### Minor Changes

- ff34c45: Breaking: `CMAKE_JS_*` defines are no longer injected by default (use --cmake-js to opt-in)
- a336f07: Breaking: Renamed --target to --triplet to free up --target for passing CMake targets
- 2ecf894: Add passing of definitions (-D) to cmake when configuring
- 633dc34: Pass --target to CMake
- ff34c45: Expose includable WEAK_NODE_API_CONFIG to CMake projects

### Patch Changes

- 2a30d8d: Refactored CLIs to use a shared utility package
- f82239c: Pretty print spawn errors instead of simply rethrowing to commander.
- 9861bad: Assert the existence of CMakeList.txt before passing control to CMake
- Updated dependencies [2a30d8d]
- Updated dependencies [c72970f]
  - react-native-node-api@0.5.1

## 0.3.2

### Patch Changes

- ad2ec51: Removing an extraneous dependency on cmake-js
- Updated dependencies [90a1471]
- Updated dependencies [75aaed1]
- Updated dependencies [90a1471]
  - react-native-node-api@0.5.0

## 0.3.1

### Patch Changes

- Updated dependencies [a0212c8]
- Updated dependencies [a0212c8]
  - react-native-node-api@0.4.0

## 0.3.0

### Minor Changes

- 8557768: Derive default targets from the CMAKE_RN_TRIPLETS environment variable

### Patch Changes

- 4924f66: Refactor into a platform abstraction
- Updated dependencies [a477b84]
- Updated dependencies [dc33f3c]
- Updated dependencies [4924f66]
- Updated dependencies [acf1a7c]
  - react-native-node-api@0.3.3

## 0.2.3

### Patch Changes

- Updated dependencies [045e9e5]
  - react-native-node-api@0.3.2

## 0.2.2

### Patch Changes

- Updated dependencies [7ad62f7]
  - react-native-node-api@0.3.1

## 0.2.1

### Patch Changes

- Updated dependencies [bd733b8]
- Updated dependencies [b771a27]
  - react-native-node-api@0.3.0

## 0.2.0

### Minor Changes

- 4379d8c: Initial release

### Patch Changes

- Updated dependencies [4379d8c]
  - react-native-node-api@0.2.0
