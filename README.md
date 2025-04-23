<h1 align="center">
  Node-API Modules<br/>for React Native
</h1>

<p align="center">
  <strong>Write once, run anywhere:</strong><br/>
  Build native modules for <a href="https://reactnative.dev/">React Native</a> with <a href="https://nodejs.org/api/n-api.html">Node-API</a>.
</p>

## Getting started

> [!WARNING]
> This library is still under active development. Feel free to hack around, but use at your own risk.

## How does this work?

> [!NOTE]
> This library is currently dependent on a custom version of Hermes and therefore has a very limited range of supported React Native versions.
> Once the [PR adding Node-API support to Hermes](https://github.com/facebook/hermes/pull/1377) merges, we expect this restriction to be lifted.

> [!NOTE]
> This library is currently only implemented for iOS, we want to add support for Android next and eventually React Native for Windows and macOS too.

See the document on ["how it works"](./docs/HOW_IT_WORKS.md) for a detailed description of what it's like to write native modules using this package.

## Packages

This mono-repository hosts the development of a few packages:

### `packages/react-native-node-api-modules`

Responsible for adding Node-API support to your React Native application:

- Declares a Podspec which downloads a special version of Hermes, with Node-API support,
  - instructing React Native's Hermes Podspecs to compile from this custom source-code.
  - patching React Native's JSI copy, with the updates introduced by our special version of Hermes.
  - we expect this to eventually be removed, as Node-API support gets merged into Hermes upstream.
- Automatically discovers and adds Node-API binaries, matching the [the prebuilt binary specification](./docs/PREBUILDS.md)
  - This is driven by the platform specific build tools (through the Podspec on iOS and eventually Gradle on Android)
- Implements a TurboModule with a `requireNodeAddon` function responsible for
  - Loading dynamic libraries
  - Node-API module registration and (per `jsi::Runtime`) initialization.
- Provides ways of transforming `require("./addon.node")` and `require("bindings")("addon")` calls into `requireNodeAddon` calls.

Note: We'll sometimes refer to this as the "host package", as it can be seen as a host of Node-API modules in React Native apps.

### `packages/react-native-node-api-cmake`

A wrapper around CMake making it easier to produce [prebuilt binaries](./docs/PREBUILDS.md) targeting iOS and Android matching the [the prebuilt binary specification](./docs/PREBUILDS.md).

Serves the same purpose as `cmake-js` does for the Node.js community and could potentially be upstreamed into `cmake-js` eventually.

### `packages/gyp-to-cmake`

A tool to transform `binding.gyp` files into `CMakeLists.txt` files, intended for `cmake-js` or `react-native-node-api-cmake` to build from.

### `packages/node-addon-examples`

A wrapper around the examples in the [nodejs/node-addon-examples](https://github.com/nodejs/node-addon-examples) repo, using `gyp-to-cmake` and `react-native-node-api-cmake` to prepare prebuilds and scaffolding for loading the addons.

The main purpose is to use these as tests to verify the implementation. We choose to use this as our first signal for compliance, over the [js-native-api tests in the Node.js project](https://github.com/nodejs/node/tree/main/test/js-native-api), because the examples depends much less on Node.js built-in runtime APIs.

### `apps/test-app`

A test app using `react-native-test-app` to exercise the implementation of
