# Prebuilds

This document codifies the naming and directory structure of prebuilt binaries, expected by the auto-linking mechanism.

At the time of writing, our auto-linking host package (`react-native-node-api`) support two kinds of prebuilds:

## `{name}.android.node` (for Android)

A jniLibs-like directory structure of CPU-architecture specific directories containing a single shared object / dynamic library file.

The name of all the library files:

- must be the same across all CPU-architectures
- can have a "lib" prefix, but doesn't have to
- must have an `.so` or `.node` file extension

> [!NOTE]
> The `SONAME` doesn't have to match and is not updated as the .so is copied into the host package.
> This might cause trouble if you're trying to link with the library from other native code.
> We're tracking [#14](https://github.com/callstackincubator/react-native-node-api/issues/14) to fix this 🤞

The directory must have a `react-native-node-api-module` file (the content doesn't matter), to signal that the directory is intended for auto-linking by the `react-native-node-api-module` package.

## `{name}.apple.node` (for Apple)

An XCFramework of dynamic libraries wrapped in `.framework` bundles, renamed from `.xcframework` to `.apple.node` to ease discoverability.

The Apple Developer documentation on ["Creating a multiplatform binary framework bundle"](https://developer.apple.com/documentation/xcode/creating-a-multi-platform-binary-framework-bundle#Avoid-issues-when-using-alternate-build-systems) mentions:

> An XCFramework can include dynamic library files, but only macOS supports these libraries for dynamic linking. Dynamic linking on iOS, watchOS, and tvOS requires the XCFramework to contain .framework bundles.

The directory must have a `react-native-node-api-module` file (the content doesn't matter), to signal that the directory is intended for auto-linking by the `react-native-node-api-module` package.

## `{name}.nodejs.node` (for Node.js)

A directory of OS + CPU architecture -specific directories (named `{process.platform}-{process.arch}`) containing a single shared object / dynamic library file.

The name of all the library files:

- must be the same across all CPU-architectures
- can have a "lib" prefix, but doesn't have to
- must have a `.node` file extension

## Why did we choose this naming scheme?

To align with prior art and established patterns around the distribution of Node-API modules for Node.js, we've chosen to use the ".node" filename extension for prebuilds of Node-API modules, targeting React Native.

To enable distribution of packages with multiple co-existing platform-specific prebuilts, we've chosen to lean into the pattern of platform-specific filename extensions, used by the Metro bundler.
