# Copilot Instructions for React Native Node-API

This is a **monorepo** that brings Node-API support to React Native, enabling native addons written in C/C++/Rust to run on React Native across iOS and Android.

## Architecture Overview

**Core Flow**: JS `require("./addon.node")` → Babel transform → `requireNodeAddon()` TurboModule call → native library loading → Node-API module initialization

### Package Architecture

See the [README.md](../README.md#packages) for detailed descriptions of each package and their roles in the system. Key packages include:

- `packages/host` - Core Node-API runtime and Babel plugin
- `packages/cmake-rn` - CMake wrapper for native builds
- `packages/ferric` - Rust/Cargo wrapper with napi-rs integration
- `packages/gyp-to-cmake` - Legacy binding.gyp compatibility
- `apps/test-app` - Integration testing harness

## Critical Build Dependencies

- **Custom Hermes**: Currently depends on a patched Hermes with Node-API support (see [facebook/hermes#1377](https://github.com/facebook/hermes/pull/1377))
- **Prebuilt Binary Spec**: All tools must output to the exact naming scheme:
  - Android: `*.android.node/` with jniLibs structure + `react-native-node-api-module` marker file
  - iOS: `*.apple.node` (XCFramework renamed) + marker file

## Essential Workflows

### Development Setup

```bash
npm ci && npm run build      # Install deps and build all packages
npm run bootstrap           # Build native components (weak-node-api, examples)
```

### Package Development

- **TypeScript project references**: Use `tsc --build` for incremental compilation
- **Workspace scripts**: Most build/test commands use npm workspaces (`--workspace` flag)
- **Focus on Node.js packages**: AI development primarily targets the Node.js tooling packages rather than native mobile code

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

- **Individual packages**: Have their own `npm test` scripts for focused iteration (e.g., `npm test --workspace cmake-rn`)
- **Cross-package**: Use root-level `npm test` for cross-package testing once individual package tests pass
- **Mobile integration**: Available but not the primary AI development focus - ask the developer to run those tests as needed

**Documentation**: Integration details, platform setup, and toolchain configuration are covered in existing repo documentation files.
