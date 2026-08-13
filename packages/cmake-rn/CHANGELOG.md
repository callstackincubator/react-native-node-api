# cmake-rn

## 0.8.0-rc.0

### Minor Changes

- 1ab6a11: Add support for building projects declaring multiple shared object libraries into Node-API addons.

  Each addon is emitted next to the sources it was built from, so that a project
  declaring many addons produces the same layout as building each of them on its
  own. Both the location and the name of an artifact are derived from the target
  that produced it:
  - `--out` supports a new `{targetSourceDir}` placeholder, expanding to the source
    directory of the target being emitted, and now defaults to
    `{targetSourceDir}/build/{configuration}`. This resolves to the same path as
    before, unless `--build` is pointed outside of the source directory.
  - The artifact is named after the target's `OUTPUT_NAME` rather than the CMake
    target name. These are the same unless `OUTPUT_NAME` is set explicitly, which is
    how a project can give its targets the unique names CMake requires without
    affecting the name of the addon.

  Also adds `--concurrency`, limiting how many build tasks run at once. It defaults
  to the available parallelism, or to 1 when `--verbose` is enabled, since
  interleaved output from concurrent builds is hard to read.

- 0c1d597: Let a consumer override the Android `ANDROID_STL` CMake cache variable via
  the existing `-D`/`--define` option (e.g. `--define ANDROID_STL=c++_static`).
  It still defaults to `c++_shared`, matching what React Native itself uses,
  but an addon that must match a prebuilt third-party dependency's STL, or one
  that's genuinely self-contained, can now ask for a different value.

  This also fixes an ordering bug where a `--define` targeting any of the
  Android platform's own default CMake variables (including `ANDROID_STL`) was
  silently discarded: our hardcoded defaults were appended to the CMake
  command line _after_ the user-provided `-D` arguments, and CMake resolves a
  cache variable set multiple times via `-D` to its last occurrence.

- d9ab417: Add a `--code-signing-allowed` flag to `cmake-rn`. `CODE_SIGNING_ALLOWED=NO` remains the default (needed for the free-standing dynamic libraries we produce), but a consumer who needs signed binaries in the XCFramework can now pass `--code-signing-allowed` to opt in.

### Patch Changes

- 48fa7fc: Upgrade `bufout` to v1.0.0, which keeps the number of listeners on the process
  and the output streams constant regardless of how many children are spawned
  concurrently: a single shared `exit`/`SIGINT` listener is attached only while
  children are running, and every child pipes into one shared pass-through per
  destination stream.

  That removes the reason for the CLIs to raise `EventEmitter.defaultMaxListeners`
  to 100, so those assignments are gone and Node's default limit again applies —
  restoring the leak warning it exists to give.

- Updated dependencies [48fa7fc]
- Updated dependencies [c22f39c]
- Updated dependencies [c3c321e]
- Updated dependencies [f41deb0]
- Updated dependencies [cf5ed4e]
- Updated dependencies [56ae5f8]
- Updated dependencies [166b3bf]
- Updated dependencies [263a3bc]
- Updated dependencies [8f91084]
- Updated dependencies [0b3df68]
- Updated dependencies [715a24e]
- Updated dependencies [8cc8e59]
  - @react-native-node-api/cli-utils@0.1.5-rc.0
  - react-native-node-api@2.0.0-rc.0
  - weak-node-api@0.2.0-rc.0

## 0.7.1

### Patch Changes

- Updated dependencies [37e8081]
  - react-native-node-api@1.1.1
  - weak-node-api@0.1.1

## 0.7.0

### Minor Changes

- 7349c34: Add support for building versioned frameworks for Apple Darwin / macOS
- bfd07ee: Detect ccache and use when building for Android and Apple

### Patch Changes

- d43350e: Fix auto-linking failures due to lack of padding when renaming install name of libraries, by passing headerpad_max_install_names argument to linker.
- ea26287: Add support for source maps across CLI bins
- 9c3dfb4: Error early when using conflicting architectures for across triplets
- Updated dependencies [ea26287]
- Updated dependencies [7349c34]
- Updated dependencies [80ae73b]
  - react-native-node-api@1.1.0
  - weak-node-api@0.1.1

## 0.6.3

### Patch Changes

- 1dee80f: Fix missing build artifacts 🙈
- Updated dependencies [1dee80f]
  - @react-native-node-api/cli-utils@0.1.4
  - cmake-file-api@0.1.2
  - react-native-node-api@1.0.1
  - weak-node-api@0.1.1

## 0.6.2

### Patch Changes

- Updated dependencies [441dcc4]
- Updated dependencies [3d2e03e]
  - @react-native-node-api/cli-utils@0.1.3
  - weak-node-api@0.1.0
  - react-native-node-api@1.0.0

## 0.6.1

### Patch Changes

- Updated dependencies [7ff2c2b]
- Updated dependencies [7ff2c2b]
  - cmake-file-api@0.1.1
  - weak-node-api@0.0.3
  - @react-native-node-api/cli-utils@0.1.2
  - react-native-node-api@0.7.1

## 0.6.0

### Minor Changes

- 60fae96: Use `find_package` instead of `include` to locate "weak-node-api"

### Patch Changes

- 61fff3f: Allow passing --apple-bundle-identifier to specify the bundle identifiers used when creating Apple frameworks.
- Updated dependencies [60fae96]
- Updated dependencies [61fff3f]
- Updated dependencies [61fff3f]
- Updated dependencies [5dea205]
- Updated dependencies [60fae96]
- Updated dependencies [60fae96]
- Updated dependencies [eca721e]
- Updated dependencies [60fae96]
  - react-native-node-api@0.7.0
  - weak-node-api@0.0.2

## 0.5.2

### Patch Changes

- 07ea9dc: Add x86_64 and universal simulator triplets
- Updated dependencies [07ea9dc]
- Updated dependencies [7536c6c]
- Updated dependencies [c698698]
- Updated dependencies [a2fd422]
- Updated dependencies [bdc172e]
- Updated dependencies [4672e01]
  - react-native-node-api@0.6.2

## 0.5.1

### Patch Changes

- 5c9321b: Add `--strip` option to strip debug symbols from outputs
- 5c3de89: Locate and include debug symbols when creating an Xcframework.
- 5c3de89: Allow passing "RelWithDebInfo" and "MinSizeRel" as --configuration
- Updated dependencies [5c3de89]
- Updated dependencies [bb9a78c]
  - react-native-node-api@0.6.1

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
