# The `react-native-node-api` command-line interface (CLI)

The `react-native-node-api` package installs a `react-native-node-api` binary, which app and library authors use to vendor Hermes, link Node-API modules into an app and inspect how the library-naming scheme resolves for a given module.

```bash
npx react-native-node-api <command> [options]
```

Run `npx react-native-node-api help` or `npx react-native-node-api help <command>` to see this same information from the CLI itself.

> [!NOTE]
> This document is hand-written from the [Commander](https://github.com/tj/commander.js) program definition in [`packages/host/src/node/cli/program.ts`](../packages/host/src/node/cli/program.ts) (with the `vendor-hermes` command defined in [`hermes.ts`](../packages/host/src/node/cli/hermes.ts)). It needs to be kept in sync by hand whenever a command or its options change.

## `vendor-hermes [from]`

Clones the pinned commit of Hermes' `static_h` branch (which carries Hermes' first-party Node-API implementation) into the `sdks/node-api-hermes` directory of the app's `react-native` package, so the native build can compile against it. Prints the path to the vendored checkout on success.

- `[from]` — Path to a file inside the app package. Defaults to the current working directory.
- `--react-native-package <package-name>` — The React Native package to vendor Hermes into. Defaults to `react-native`.
- `--silent` — Don't print anything except the final path. Defaults to `false`.
- `--force` — Don't check timestamps of input files to skip unnecessary rebuilds; removes and re-clones an existing checkout. Defaults to `false`.

## `link [path]`

Auto-links the Node-API modules found among the app's dependencies for one or more platforms, copying (and, on Apple, signing) them into place.

- `[path]` — Some path inside the app package. Defaults to the current working directory.
- `--android` — Link Android modules.
- `--apple` — Link Apple modules.
- `--prune` — Delete previously vendored modules that are no longer auto-linked. Defaults to `true`.
- `--package-name <strategy>` — Controls how a dependency's package name is transformed into a library name. One of `strip`, `keep` or `omit` (see [Library naming](#library-naming) below). Defaults to `strip`, or the `NODE_API_PACKAGE_NAME` environment variable if set.
- `--path-suffix <strategy>` — Controls how the path of the addon inside a package is transformed into a library name. One of `strip`, `keep` or `omit` (see [Library naming](#library-naming) below). Defaults to `strip`, or the `NODE_API_PATH_SUFFIX` environment variable if set.

At least one of `--android` / `--apple` must be passed, or the command exits with an error listing the supported platforms.

## `list [from-path]`

Lists the Node-API modules found among the dependencies of the package at (or above) a path, without linking them.

- `[from-path]` — Some path inside the app package. Defaults to the current working directory.
- `--json` — Output the result as JSON instead of a human-readable summary. Defaults to `false`.
- `--package-name <strategy>` — Same as for `link` (see [Library naming](#library-naming)).
- `--path-suffix <strategy>` — Same as for `link` (see [Library naming](#library-naming)).

## `info <path>`

Utility to print the resolved module path, package name and computed library name for a single Node-API module, given its path. Useful for debugging naming collisions.

- `<path>` — Path to a Node-API module (e.g. an `*.android.node` directory or `*.apple.node` framework).
- `--package-name <strategy>` — Same as for `link` (see [Library naming](#library-naming)).
- `--path-suffix <strategy>` — Same as for `link` (see [Library naming](#library-naming)).

## `patch-xcode-project [path]`

Patches the app's Xcode project to add a build phase which copies, renames and signs the Node-API frameworks (equivalent to running `link --apple` as part of the Xcode build). Only supported on macOS.

- `[path]` — Some path inside the app package. Defaults to the current working directory.

## Library naming

`--package-name` and `--path-suffix` both control how the [cross-platform library name](./PREBUILDS.md) (`package-name--path-component--addon-name`) is derived, and accept the same three strategies. Given a package `@my-org/my-pkg` with an addon at `build/Release/my-addon.node`:

| Strategy | `--package-name` effect                   | `--path-suffix` effect                              |
| -------- | ----------------------------------------- | --------------------------------------------------- |
| `strip`  | Scope is dropped: `my-pkg--my-addon`      | Path is reduced to its basename: `my-pkg--my-addon` |
| `keep`   | Scope is kept: `my-org--my-pkg--my-addon` | Full path is kept: `my-pkg--build-Release-my-addon` |
| `omit`   | Package name is dropped: `my-addon`       | Path is dropped: `my-pkg`                           |
