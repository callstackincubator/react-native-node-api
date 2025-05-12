# Auto-linking

The `react-native-node-api-modules` package (sometimes referred to as "the host package") has mechanisms to automatically find and link prebuilt binaries with Node-API modules.

When auto-linking, prebuilt binaries are copied (sometimes referred to as vendored) from dependencies of the app into the host package. As they're copied, they get renamed to avoid conflicts in naming as the library files across multiple dependency packages will be sharing a namespace when building the app.

## Naming scheme of libraries when linked into the host

The name of the library when linked / copied into the host is based on two things:

- The package name of the encapsulating package: The directory tree is walked from the original library path to the nearest `package.json` (this is the Node-API module's package root).
- The relative path of the library to the package root:
  - Normalized (any "lib" prefix or file extension is stripped from the filename).
  - Escaped (any non-alphanumeric character is replaced with "-").

## How do I link Node-API module libraries into my app?

Linking will run when you `pod install` and as part of building your app with Gradle as long as your app has a dependency on the `react-native-node-api-modules` package.

You can also manually link by running the following in your app directory:

```bash
npx react-native-node-api-modules link --android --apple
```

> [!NOTE]
> Because vendored frameworks must be present when running `pod install`, you have to run `pod install` if you add or remove a dependency with a Node-API module (or after creation if you're doing active development on it).
