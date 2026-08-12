<p align="center">
  <img src="./logo.svg" width="20%" />
</p>

<h1 align="center">
  Node-API Modules<br/>for React Native
</h1>

<p align="center">
  <strong>Write once, run anywhere:</strong><br/>
  Build native modules for <a href="https://reactnative.dev/">React Native</a> with <a href="https://nodejs.org/api/n-api.html">Node-API</a>.
</p>

Install this package in your app to use libraries shipping native addons written against [Node-API](https://nodejs.org/api/n-api.html) — the same C API used by native addons in Node.js. It takes care of finding the prebuilt binaries in your dependencies, linking them into your iOS and Android builds and loading them at runtime.

> [!WARNING]
> This library is still under active development. Feel free to hack around, but use at your own risk.

> [!IMPORTANT]
> This library currently depends on a custom version of Hermes and therefore supports only a limited range of React Native versions (see `peerDependencies`). It works on iOS and Android — other platforms aren't supported yet.

## Getting started

### 1. Install the package

Install `react-native-node-api` alongside the library you want to use, here a fictitious `calculator-lib`:

```
npm install calculator-lib react-native-node-api
```

You need this package as a direct dependency of your app (even though it's really the library that needs it), because the React Native Community CLI doesn't consider transitive dependencies when auto-linking.

### 2. Add the Babel plugin

Add the plugin to your app's `babel.config.js`:

```javascript
module.exports = {
  presets: ["module:@react-native/babel-preset"],
  plugins: ["module:react-native-node-api/babel-plugin"], // 👈 Add this
};
```

The plugin rewrites the `require("./addon.node")` (and `require("bindings")("addon")`) calls inside your dependencies into calls loading the native addon through this package.

### 3. Build your app

- **iOS:** run `pod install` as usual — addons found in your dependencies are linked as part of it. Re-run it whenever you add or remove a dependency shipping an addon.
- **Android:** requires a few extra steps, since React Native has to be built from source against the vendored Hermes. See [the Android documentation](https://github.com/callstackincubator/react-native-node-api/blob/main/docs/ANDROID.md).

## Usage

Once installed, addons are just regular JavaScript imports — there's no API from this package to call in your app code:

```tsx
import { Button, Text, View } from "react-native";
import { add } from "calculator-lib"; // 👈 Backed by a native Node-API addon

export function Calculator() {
  return (
    <View>
      <Text>1 + 2 = {add(1, 2)}</Text>
    </View>
  );
}
```

## Troubleshooting

If an addon fails to load, you can inspect and re-run the linking that `pod install` and Gradle perform for you:

```bash
npx react-native-node-api link --android --apple
```

This prints every Node-API module it finds in your dependencies and the name it gets linked as. Finding no modules is usually a sign that the library isn't shipping prebuilt binaries for the platform you're building.

## Documentation

- [Auto-linking](https://github.com/callstackincubator/react-native-node-api/blob/main/docs/AUTO-LINKING.md) — how prebuilt binaries are discovered, copied and renamed.
- [Android support](https://github.com/callstackincubator/react-native-node-api/blob/main/docs/ANDROID.md) — building React Native from source with the vendored Hermes.
- [Usage](https://github.com/callstackincubator/react-native-node-api/blob/main/docs/USAGE.md) — for library authors wanting to ship a Node-API module.
- [How it works](https://github.com/callstackincubator/react-native-node-api/blob/main/docs/HOW-IT-WORKS.md) — the path from `import` to native code.
