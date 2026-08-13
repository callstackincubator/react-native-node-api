# react-native-node-api

## 2.0.0-rc.0

### Major Changes

- c3c321e: Adopt Hermes' first-party Node-API (the `hermesNapi` target on the `static_h`
  branch) instead of patching Hermes with our own implementation. Addons now run
  against a real Node-API environment created with `hermes_napi_create_env()`, one
  per addon as in Node, and Node-API is bumped from v8 to v10.

  This drops support for React Native 0.79–0.81: the vendored Hermes is built from
  a pinned `static_h` commit and requires the Hermes build scripts shipped with
  React Native 0.87 and later. Older React Native versions are still served by
  previously published releases.

### Minor Changes

- cf5ed4e: Provide a `hermes_napi_host` implementation to the Hermes Node-API environments. This enables thread-safe functions (`napi_create_threadsafe_function` and friends) and moves `napi_async_work` execution onto a worker pool — previously the `execute` callback ran on the JavaScript thread, blocking it for the duration of the work. The host is also in place before an addon's module init runs, so async work and thread-safe functions can now be created during initialization.
- 56ae5f8: Stop compiling Hermes as part of every iOS app build. The Cocoapods integration
  now resolves the pinned commit with `prebuilt-hermes` and hands the archive's
  path to React Native through `HERMES_ENGINE_TARBALL_PATH` — so
  `hermes-engine.podspec` vendors the prebuilt frameworks instead of running its
  "Build Hermesc" and "Build Hermes" script phases.

  Building Hermes from source remains available and is the faster loop while
  iterating on Hermes itself, since Xcode then rebuilds it incrementally: set
  `REACT_NATIVE_NODE_API_HERMES_FROM_SOURCE=1` before `pod install`. Setting
  `REACT_NATIVE_OVERRIDE_HERMES_DIR` or `HERMES_ENGINE_TARBALL_PATH` yourself
  still takes precedence, and Android is unchanged.

- 166b3bf: Add a `prebuilt-hermes` command, which resolves an archive of the pinned Hermes
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

- 715a24e: Route `napi_fatal_exception` through React Native's `ErrorUtils.reportFatalError` instead of unconditionally logging and calling `abort()`. This is what node-addon-api calls whenever an exception escapes a thread-safe-function callback, so a single throwing tsfn callback no longer hard-kills the app: in dev the error and its stack now surface in LogBox, in release RN's default handler rethrows into the native crash path, and apps can observe or handle it via `ErrorUtils.setGlobalHandler` — the moral equivalent of Node's `'uncaughtException'`. The previous stringify-and-abort behavior remains as a fallback for when `ErrorUtils`/`reportFatalError` isn't available (non-RN embedders, very early startup) or the handler itself throws.

### Patch Changes

- 48fa7fc: Upgrade `bufout` to v1.0.0, which keeps the number of listeners on the process
  and the output streams constant regardless of how many children are spawned
  concurrently: a single shared `exit`/`SIGINT` listener is attached only while
  children are running, and every child pipes into one shared pass-through per
  destination stream.

  That removes the reason for the CLIs to raise `EventEmitter.defaultMaxListeners`
  to 100, so those assignments are gone and Node's default limit again applies —
  restoring the leak warning it exists to give.

- c22f39c: Drop the host's shadowing implementations of Node-API functions that Hermes'
  first-party Node-API already provides, so addons observe Hermes' behavior
  instead of the host's older shims:
  - `napi_get_node_version` now reports Hermes' own version (release name
    `"hermes"`) instead of unconditionally failing with `napi_generic_failure`.
  - `napi_is_buffer` now returns `true` only for `Uint8Array`, matching Node,
    instead of any `ArrayBuffer`/`TypedArray`.
  - `napi_get_buffer_info` now returns `napi_invalid_arg` for non-`Uint8Array`
    values, matching Node, instead of `napi_ok` with zeroed output.
  - `napi_create_buffer_copy` now writes a non-`NULL` `result_data` argument, as
    documented, instead of silently ignoring it.
  - `napi_create_buffer`, `napi_create_external_buffer` and `napi_get_version`
    are unchanged in observable behavior, now served by Hermes directly.

  This also fixes a bug where calling `napi_get_buffer_info` on a non-`Uint8Array`
  typed array (e.g. a `Float64Array`) left a process-global flag corrupted, so
  that every subsequent `napi_create_buffer`/`napi_create_external_buffer` call
  produced the wrong typed array view.

  `napi_fatal_error` keeps its host-side implementation, so fatal Node-API
  errors keep reaching logcat on Android instead of only stderr.

- f41deb0: Load addons through Hermes' `hermes_napi_load_module` instead of the host's own
  `dlopen` + `dlsym` implementation:
  - Addons that register themselves by calling the deprecated
    `napi_module_register` are now supported. Previously only addons exporting a
    `napi_register_module_v1` symbol could be loaded, and the rest resolved to
    `undefined`.
  - A failing `requireNodeAddon` now throws an error naming the addon, the path
    that was tried and the underlying reason (e.g. the `dlopen` error), instead
    of silently resolving to `undefined`.
  - `node_api_get_module_file_name` now reports the path the addon was loaded
    from, instead of an empty string.

  This also opens a Node-API handle scope around loading and initializing an
  addon. Without one, the `exports` object handed to the addon's initialization
  function was not reachable by the garbage collector, so a collection triggered
  during initialization could free it while the addon was still populating it.

- 263a3bc: Fix `prebuilt-hermes` failing to configure the host Hermes compiler. It passed
  `CMAKE_OSX_ARCHITECTURES=arm64;x86_64` to build a universal `hermesc`, but a
  multi-arch host configure makes llvh's feature try-compiles fail — standard
  headers report as missing and the configure dies with "Host compiler appears to
  require libatomic, but cannot find it". The host compiler is now configured the
  way Hermes and React Native configure it, for the host architecture only.

  `hermesc` is consequently native to the Mac that built the archive, so the
  archive name now carries the host architecture. An Intel Mac finds no published
  archive for its architecture and builds its own, rather than downloading one
  whose `hermesc` it cannot execute.

- 8f91084: Fix `prebuilt-hermes` failing to configure the host Hermes compiler with "Host
  compiler appears to require libatomic, but cannot find it". It exported all
  three deployment targets Hermes' `build-apple-framework.sh` can ask for to every
  command it ran, including the host compiler build. `XROS_DEPLOYMENT_TARGET` is
  also a clang driver variable, so clang targeted visionOS against the macOS
  sysroot, and every API marked unavailable there — `pthread_mutexattr_init`, the
  `fd_set` helpers reached through `unistd.h` — failed to compile. Each platform
  build now gets only the deployment target it needs, and the host compiler build
  gets none.
- 0b3df68: Stop emitting `log_debug`'s per-addon diagnostic chatter (library
  found/loaded, symbol resolution, ...) in release builds. It is now compiled
  out in `NDEBUG` builds (CMake's `Release`/`MinSizeRel`/`RelWithDebInfo`
  configurations, and Xcode's default `Release` configuration), mirroring React
  Native's own dev/release logging split. `log_warning` and `log_error` are
  unaffected and keep firing in every build type.
- 8cc8e59: Make `vendor-hermes --silent` actually silent. The spinners were passed
  `isEnabled: false`, which stops the animation but still writes the spinner text
  and its final symbol to stderr. They now use `isSilent`, which suppresses the
  output entirely, leaving the vendored Hermes path on stdout as the command's
  only output.
- Updated dependencies [48fa7fc]
- Updated dependencies [c3c321e]
  - @react-native-node-api/cli-utils@0.1.5-rc.0
  - weak-node-api@0.2.0-rc.0

## 1.1.1

### Patch Changes

- 37e8081: Print module path on framework slicing failure
- weak-node-api@0.1.1

## 1.1.0

### Minor Changes

- 7349c34: Add support for building versioned frameworks for Apple Darwin / macOS
- 80ae73b: Modify Xcode project to add a build phase to the main project app to link Node-API frameworks directly

### Patch Changes

- ea26287: Add support for source maps across CLI bins
  - weak-node-api@0.1.1

## 1.0.1

### Patch Changes

- 1dee80f: Fix missing build artifacts 🙈
- Updated dependencies [1dee80f]
  - @react-native-node-api/cli-utils@0.1.4
  - weak-node-api@0.1.1

## 1.0.0

### Patch Changes

- Updated dependencies [441dcc4]
- Updated dependencies [3d2e03e]
  - @react-native-node-api/cli-utils@0.1.3
  - weak-node-api@0.1.0

## 0.7.1

### Patch Changes

- 7ff2c2b: Fix minor package issues.
- Updated dependencies [7ff2c2b]
- Updated dependencies [7ff2c2b]
  - weak-node-api@0.0.3
  - @react-native-node-api/cli-utils@0.1.2

## 0.7.0

### Minor Changes

- 61fff3f: Ensure proper escaping when generating a bundle identifier while creating an Apple framework
- 60fae96: Use `find_package` instead of `include` to locate "weak-node-api"
- 60fae96: No longer exporting weakNodeApiPath, import from "weak-node-api" instead

### Patch Changes

- 60fae96: Moved weak-node-api into a separate "weak-node-api" package.
- 61fff3f: Allow passing --apple-bundle-identifier to specify the bundle identifiers used when creating Apple frameworks.
- 5dea205: Add "apple" folder into the package (follow-up to #301)
- eca721e: Don't instruct users to pass --force when vendoring hermes
- Updated dependencies [60fae96]
  - weak-node-api@0.0.2

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
