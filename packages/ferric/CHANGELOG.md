# ferric-cli

## 0.5.0-rc.0

### Minor Changes

- 1f1085f: Add a `--cwd <path>` option to `ferric build`, to build a crate outside the
  current directory. Outputs default to that directory, unless `--output` is
  passed.
- c5278fd: Add a `ferric init [path]` command, scaffolding a package building a Rust Node-API module.

  It writes the `package.json`, `Cargo.toml`, `build.rs`, `src/lib.rs` and `.gitignore` a package needs, and adds it to the workspace of the mono-repo it is initialized into. Run against a package that already exists, it bumps outdated dependencies and crates in place, and prints a diff for every update. A differing entrypoint or source file is skipped with a diff to merge by hand, unless `--force` is passed. `--dry-run` prints all of this without writing anything.

  A new `Cargo.toml` enables Node-API version 10 by default, and can be configured with `--node-api-version`, `--napi-crate-version`, `--napi-derive-crate-version`, `--napi-build-crate-version` and `--release-profile`.

- 51503b0: Check the crate's resolved `napi-sys` features before building and fail if `dyn-symbols` is enabled (it prevents linking against `weak-node-api`) or a `napiN` feature above the supported Node-API version 10. Pass `--skip-feature-check` to bypass.

### Patch Changes

- a136f6f: Update `@napi-rs/cli` to 3.10.8.
- Updated dependencies [831e233]
- Updated dependencies [ba85f07]
- Updated dependencies [98c4c2d]
- Updated dependencies [29ca6a3]
- Updated dependencies [5568756]
- Updated dependencies [a654059]
- Updated dependencies [dfd38ed]
- Updated dependencies [fbe5ed9]
- Updated dependencies [983cb55]
- Updated dependencies [21bd99a]
- Updated dependencies [bd6748d]
  - @react-native-node-api/cli-utils@0.2.0-rc.0
  - react-native-node-api@2.0.0-rc.0
  - weak-node-api@0.2.0-rc.0

## 0.4.6

### Patch Changes

- Updated dependencies [ff237c0]
  - react-native-node-api@1.2.2
  - weak-node-api@0.1.1

## 0.4.5

### Patch Changes

- Updated dependencies [62f421b]
  - react-native-node-api@1.2.1
  - weak-node-api@0.1.1

## 0.4.4

### Patch Changes

- Updated dependencies [14e5119]
- Updated dependencies [8d125fa]
- Updated dependencies [ba6a527]
- Updated dependencies [c8d5b80]
- Updated dependencies [44617d2]
  - react-native-node-api@1.2.0
  - weak-node-api@0.1.1

## 0.4.3

### Patch Changes

- 8a81b9b: Add `--dts-only` flag to `ferric build`, generating just the TypeScript declaration file and JS entrypoint without cross-compiling any Android/Apple binaries. It still runs a real host `cargo build` (napi-rs has no lighter typegen-only mode), so it's meant for regenerating a checked-in declarations fixture rather than for environments without a Rust toolchain.
- Updated dependencies [7962f09]
- Updated dependencies [1d0e670]
  - react-native-node-api@1.1.3
  - weak-node-api@0.1.1

## 0.4.2

### Patch Changes

- 294de3f: Upgrade `bufout` to v1.0.0, which keeps the number of listeners on the process
  and the output streams constant regardless of how many children are spawned
  concurrently: a single shared `exit`/`SIGINT` listener is attached only while
  children are running, and every child pipes into one shared pass-through per
  destination stream.

  That removes the reason for the CLIs to raise `EventEmitter.defaultMaxListeners`
  to 100, so those assignments are gone and Node's default limit again applies —
  restoring the leak warning it exists to give.

- Updated dependencies [294de3f]
  - @react-native-node-api/cli-utils@0.1.5
  - react-native-node-api@1.1.2
  - weak-node-api@0.1.1

## 0.4.1

### Patch Changes

- 37e8081: Add x86_64-apple-ios as a default target on an Apple host
- Updated dependencies [37e8081]
  - react-native-node-api@1.1.1
  - weak-node-api@0.1.1

## 0.4.0

### Minor Changes

- 7349c34: Add support for building versioned frameworks for Apple Darwin / macOS

### Patch Changes

- ea26287: Add support for source maps across CLI bins
- Updated dependencies [ea26287]
- Updated dependencies [7349c34]
- Updated dependencies [80ae73b]
  - react-native-node-api@1.1.0
  - weak-node-api@0.1.1

## 0.3.11

### Patch Changes

- 1dee80f: Fix missing build artifacts 🙈
- Updated dependencies [1dee80f]
  - @react-native-node-api/cli-utils@0.1.4
  - react-native-node-api@1.0.1
  - weak-node-api@0.1.1

## 0.3.10

### Patch Changes

- 441dcc4: Add --verbose, --concurrency, --clean options
- Updated dependencies [441dcc4]
- Updated dependencies [3d2e03e]
  - @react-native-node-api/cli-utils@0.1.3
  - weak-node-api@0.1.0
  - react-native-node-api@1.0.0

## 0.3.9

### Patch Changes

- Updated dependencies [7ff2c2b]
- Updated dependencies [7ff2c2b]
  - weak-node-api@0.0.3
  - @react-native-node-api/cli-utils@0.1.2
  - react-native-node-api@0.7.1

## 0.3.8

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

## 0.3.7

### Patch Changes

- 9411a8c: Add x86_64 ios simulator target and output universal libraries for iOS simulators.
- 9411a8c: It's no longer required to pass "build" to ferric, as this is default now
- b661176: Add support for visionOS and tvOS targets
- Updated dependencies [07ea9dc]
- Updated dependencies [7536c6c]
- Updated dependencies [c698698]
- Updated dependencies [a2fd422]
- Updated dependencies [bdc172e]
- Updated dependencies [4672e01]
  - react-native-node-api@0.6.2

## 0.3.6

### Patch Changes

- Updated dependencies [5c3de89]
- Updated dependencies [bb9a78c]
  - react-native-node-api@0.6.1

## 0.3.5

### Patch Changes

- 5156d35: Refactored moving prettyPath util to CLI utils package
- Updated dependencies [acd06f2]
- Updated dependencies [5156d35]
- Updated dependencies [9f1a301]
- Updated dependencies [5016ed2]
- Updated dependencies [5156d35]
  - react-native-node-api@0.6.0
  - @react-native-node-api/cli-utils@0.1.1

## 0.3.4

### Patch Changes

- Updated dependencies [2b9a538]
  - react-native-node-api@0.5.2

## 0.3.3

### Patch Changes

- 2a30d8d: Refactored CLIs to use a shared utility package
- Updated dependencies [2a30d8d]
- Updated dependencies [c72970f]
  - react-native-node-api@0.5.1

## 0.3.2

### Patch Changes

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

- 8557768: Derive default targets from the FERRIC_TARGETS environment variable

### Patch Changes

- e613efe: Fixed cargo build release flag
- a7cc35a: Updated napi packages.
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
