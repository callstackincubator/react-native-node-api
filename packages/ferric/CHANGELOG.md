# ferric-cli

## 0.4.2-rc.0

### Patch Changes

- 48fa7fc: Upgrade `bufout` to v1.0.0, which keeps the number of listeners on the process
  and the output streams constant regardless of how many children are spawned
  concurrently: a single shared `exit`/`SIGINT` listener is attached only while
  children are running, and every child pipes into one shared pass-through per
  destination stream.

  That removes the reason for the CLIs to raise `EventEmitter.defaultMaxListeners`
  to 100, so those assignments are gone and Node's default limit again applies —
  restoring the leak warning it exists to give.

- c73d30c: Add `--dts-only` flag to `ferric build`, generating just the TypeScript declaration file and JS entrypoint without cross-compiling any Android/Apple binaries. It still runs a real host `cargo build` (napi-rs has no lighter typegen-only mode), so it's meant for regenerating a checked-in declarations fixture rather than for environments without a Rust toolchain.
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
