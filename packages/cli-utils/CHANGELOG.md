# @react-native-node-api/cli-utils

## 0.2.0-rc.0

### Minor Changes

- 831e233: Add the helpers shared by the `ferric init` and `cmake-rn init` commands: planning file changes, updating a `package.json` without overwriting what it declares, printing diffs, and adding a package to a pnpm, npm or yarn workspace.

## 0.1.5

### Patch Changes

- 294de3f: Upgrade `bufout` to v1.0.0, which keeps the number of listeners on the process
  and the output streams constant regardless of how many children are spawned
  concurrently: a single shared `exit`/`SIGINT` listener is attached only while
  children are running, and every child pipes into one shared pass-through per
  destination stream.

  That removes the reason for the CLIs to raise `EventEmitter.defaultMaxListeners`
  to 100, so those assignments are gone and Node's default limit again applies —
  restoring the leak warning it exists to give.

## 0.1.4

### Patch Changes

- 1dee80f: Fix missing build artifacts 🙈

## 0.1.3

### Patch Changes

- 441dcc4: Add re-export of "p-limit"

## 0.1.2

### Patch Changes

- 7ff2c2b: Fix minor package issues.

## 0.1.1

### Patch Changes

- 5156d35: Refactored moving prettyPath util to CLI utils package
