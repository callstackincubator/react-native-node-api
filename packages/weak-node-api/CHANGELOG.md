# weak-node-api

## 0.2.0-rc.0

### Minor Changes

- c3c321e: Adopt Hermes' first-party Node-API (the `hermesNapi` target on the `static_h`
  branch) instead of patching Hermes with our own implementation. Addons now run
  against a real Node-API environment created with `hermes_napi_create_env()`, one
  per addon as in Node, and Node-API is bumped from v8 to v10.

  This drops support for React Native 0.79–0.81: the vendored Hermes is built from
  a pinned `static_h` commit and requires the Hermes build scripts shipped with
  React Native 0.87 and later. Older React Native versions are still served by
  previously published releases.

## 0.1.1

### Patch Changes

- 1dee80f: Fix missing build artifacts 🙈

## 0.1.0

### Minor Changes

- 3d2e03e: Renamed WeakNodeApiHost to NodeApiHost

## 0.0.3

### Patch Changes

- 7ff2c2b: Fix minor package issues.
- 7ff2c2b: Add missing "generated" directory

## 0.0.2

### Patch Changes

- 60fae96: Initial release!
