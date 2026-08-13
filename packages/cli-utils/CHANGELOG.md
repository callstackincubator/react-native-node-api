# @react-native-node-api/cli-utils

## 0.1.5-rc.0

### Patch Changes

- 48fa7fc: Upgrade `bufout` to v1.0.0, which keeps the number of listeners on the process
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
