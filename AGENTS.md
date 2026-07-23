# AGENTS.md

Instructions for AI coding agents working in the React Native Node-API repo.

This is a **monorepo** that brings Node-API support to React Native, enabling native addons written in C/C++/Rust to run on React Native across iOS and Android.

## Package-Specific Instructions

**IMPORTANT**: Before working on any package, always check for and read package-specific instruction files (`AGENTS.md` or `copilot-instructions.md`) in the package directory. These contain critical preferences and patterns for that specific package.

## Architecture Overview

**Core Flow**: JS `require("./addon.node")` → Babel transform → `requireNodeAddon()` TurboModule call → native library loading → Node-API module initialization

### Package Architecture

See the [README.md](README.md#packages) for detailed descriptions of each package and their roles in the system. Key packages include:

- `packages/host` - Core Node-API runtime and Babel plugin
- `packages/cmake-rn` - CMake wrapper for native builds
- `packages/cmake-file-api` - TypeScript wrapper for CMake File API with Zod validation
- `packages/ferric` - Rust/Cargo wrapper with napi-rs integration
- `packages/gyp-to-cmake` - Legacy binding.gyp compatibility
- `apps/test-app` - Integration testing harness

## Environment & Bootstrap

- **Node.js 24 is required** — pinned in `.nvmrc` as `lts/krypton` (matching CI); `package.json`'s `devEngines` requires Node `^24` and pnpm `^10`, and the package manager refuses to install with an older runtime. With nvm: `nvm install && nvm use`.
- **pnpm is the package manager** — pinned in `package.json`'s `packageManager` field. Let Corepack (bundled with Node) provide it: `corepack enable`, then use `pnpm`.
- Standard setup for the Node.js tooling packages:

  ```bash
  pnpm install     # Install workspace dependencies
  pnpm run build   # Incremental TypeScript build (tsc --build)
  ```

- On Claude Code on the web, `.claude/hooks/session-start.sh` performs the above automatically (selecting the `.nvmrc` version via nvm and pnpm via Corepack) at session start.
- **Native (iOS/Android) builds are not part of the default bootstrap.** `pnpm run bootstrap` and the native `bootstrap` scripts compile artifacts that require the Android NDK / Apple toolchains, which are absent on a generic Linux worker. Focus on the Node.js tooling packages; pass an explicit target (e.g. `pnpm exec ferric --apple`) only when the corresponding SDK is installed.

## Prefer an upstream fix over a local workaround

When a build/runtime failure looks like a known upstream bug, before writing a
patch or workaround:

1. Find where the fix actually landed and **verify at the source** — the
   changelog, lockfile, or the dependency's own manifest/podspec for a _specific
   installable version_, not the version list and not a related package's
   timeline (a fork or platform variant may carry a fix on a line its upstream
   never did).
2. If an installable version within our constraints contains the fix, prefer the
   **smallest** bump that includes it (patch > minor > major) over a workaround.
3. Treat the upgrade as a hypothesis under test: say so, and be ready to revert —
   every upgrade adds new unknown-bug surface. If it doesn't fix the issue, throw
   it away rather than stacking a workaround on top of it.
4. If the bump is more than a patch, or widens scope/risk, check with me before
   committing to it.
5. If no fixed version is reachable, a workaround is fine — but comment it with
   the exact condition that makes it removable (e.g. "remove once dep ships
   fmt ≥ 12.1"), and if you write that condition, verify it isn't already met.

## Critical Build Dependencies

- **Custom Hermes**: Currently depends on a patched Hermes with Node-API support (see [facebook/hermes#1377](https://github.com/facebook/hermes/pull/1377))
- **Prebuilt Binary Spec**: All tools must output to the exact naming scheme:
  - Android: `*.android.node/` with jniLibs structure + `react-native-node-api-module` marker file
  - iOS: `*.apple.node` (XCFramework renamed) + marker file

## Essential Workflows

### Package Development

- **TypeScript project references**: Use `tsc --build` for incremental compilation
- **Workspace scripts**: Most build/test commands use pnpm workspaces (`--filter` flag), run in topological (dependency) order and fail fast
- **Focus on Node.js packages**: AI development primarily targets the Node.js tooling packages rather than native mobile code
- **No TypeScript type asserts**: You have to ask explicitly and justify if you want to add `as` type assertions.

## Key Patterns

### Babel Transformation

The core magic happens in `packages/host/src/node/babel-plugin/plugin.ts`:

```js
// Input:  require("./addon.node")
// Output: require("react-native-node-api").requireNodeAddon("pkg-name--addon")
```

### CMake Integration

For linking against Node-API in CMakeLists.txt:

```cmake
include(${WEAK_NODE_API_CONFIG})
target_link_libraries(addon PRIVATE weak-node-api)
```

### Cross-Platform Naming

Library names use double-dash separation: `package-name--path-component--addon-name`

### Testing

- **Individual packages**: Some packages have VS Code test tasks and others have their own `test` scripts for focused iteration (e.g., `pnpm --filter cmake-rn run test`). Use the latter only if the former is missing.
- **Cross-package**: Use root-level `pnpm test` for cross-package testing once individual package tests pass
- **Mobile integration**: Available but not the primary AI development focus - ask the developer to run those tests as needed

**Documentation**: Integration details, platform setup, and toolchain configuration are covered in existing repo documentation files.
