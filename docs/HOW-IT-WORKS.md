# How it works

This document will outline what happens throughout the various parts of the system, when the app calls the `add` method on the library introduced in the ["usage" document](./USAGE.md).

<!-- TODO: Add Clone this repo: ... -->
<!-- TODO: Add C++ code snippet -->
<!-- TODO: Add JS code snippet on requiring and calling it -->

## `my-app` makes an `import`

Everything starts from the consuming app importing the `calculator-lib`.
Metro handles the resolution and the `calculator-lib`'s entrypoint is added to the JavaScript-bundle when bundling.

## `calculator-lib` does `require("./prebuild.node")` which is transformed into a call into the host TurboModule

The library has a require call to a `.node` file, which would normally not have any special meaning:

```javascript
module.exports = require("./prebuild.node");
```

Since the app developer has added the `react-native-node-api/babel-plugin` to their Babel configuration, the require statement gets transformed when the app is being bundled by Metro, into a `requireNodeAddon` call on our TurboModule.

The generated code looks something like this:

```javascript
module.exports = require("react-native-node-api").requireNodeAddon(
  "calculator-lib--prebuild",
);
```

> [!NOTE]
> In the time of writing, this code only supports iOS as passes the path to the library with its .framework.
> We plan on generalizing this soon 🤞

### A note on the need for path-hashing

Notice that the `requireNodeAddon` call doesn't reference the library by it's original name (`prebuild.node`) but instead a name containing a hash.

In Node.js dynamic libraries sharing names can be disambiguated based off their path on disk. Dynamic libraries added to an iOS application are essentially hoisted and occupy a shared global namespace. This leads to collisions and makes it impossible to disambiguate multiple libraries sharing the same name. We need a way to map a require call, referencing the library by its path relative to the JS file, into a unique name of the library once it's added into the application.

To work around this issue, we scan for and copy any library (including its entire xcframework structure with nested framework directories) from the dependency package into our host package when the app builds and reference these from its podspec (as vendored_frameworks). We use a special file in the xcframeworks containing Node-API modules. To avoid collisions we rename xcframework, framework and library files to a unique name, containing a hash. The hash is computed based off the package-name of the containing package and the relative path from the package root to the library file (with any platform specific file extensions replaced with the neutral ".node" extension).

## Transformed code calls into `react-native-node-api`, loading the platform specific dynamic library

The native implementation of `requireNodeAddon` is responsible for loading the dynamic library and allow the Node-API module to register its initialization function, either by exporting a `napi_register_module_v1` function or by calling the (deprecated) `napi_module_register` function.

In any case the native code stores the initialization function in a data-structure.

## `react-native-node-api` creates a `node_env` and initialize the Node-API module

The initialization function of a Node-API module expects a `node_env`, which we create by calling `createNodeApiEnv` on the `jsi::Runtime`.

## The library's C++ code initialize the `exports` object

An `exports` object is created for the Node-API module and both the `napi_env` and `exports` object is passed to the Node-API module's initialization function and the third party code is able to call the Node-API free functions:

- The engine-specific functions (see [js_native_api.h](https://github.com/nodejs/node/blob/main/src/js_native_api.h)) are implemented by the `jsi::Runtime` (currently only Hermes supports this).
- The runtime-specific functions (see [node_api.h](https://github.com/nodejs/node/blob/main/src/node_api.h)) are implemented by `react-native-node-api`.

## `my-app` regain control and call `add`

When the `exports` object is populated by `calculator-lib`'s Node-API module, control is returned to `react-native-node-api` which returns the `exports` object to JavaScript, with the `add` function defined on it.

```javascript
import { add } from "calculator-lib";
console.log("1 + 2 =", add(1, 2));
```

## The library's C++ code execute the native function

Now that the app's JavaScript call the `add` function, the JavaScript engine will know to call the associated native function, which was setup during the initialization of the Node-API module and the native `Add` function is executed and control returned to JavaScript again.
