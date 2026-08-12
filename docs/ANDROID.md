# Android support

Android needs two things that iOS gets automatically during `pod install`:
React Native has to be built from source, and the build has to be pointed at the
Hermes we vendor. Both are described below.

## Building React Native from source

Because we build Hermes from source (a pinned commit carrying its Node-API
implementation), we need to build React Native from source too.

Follow [the React Native documentation on how to build from source](https://reactnative.dev/contributing/how-to-build-from-source#update-your-project-to-build-from-source).

In particular, you will have to edit the `android/settings.gradle` file as follows:

> ```diff
> // ...
> include ':app'
> includeBuild('../node_modules/@react-native/gradle-plugin')
>
> + includeBuild('../node_modules/react-native') {
> +     dependencySubstitution {
> +         substitute(module("com.facebook.react:react-android")).using(project(":packages:react-native:ReactAndroid"))
> +         substitute(module("com.facebook.react:react-native")).using(project(":packages:react-native:ReactAndroid"))
> +         substitute(module("com.facebook.react:hermes-android")).using(project(":packages:react-native:ReactAndroid:hermes-engine"))
> +         substitute(module("com.facebook.react:hermes-engine")).using(project(":packages:react-native:ReactAndroid:hermes-engine"))
> +     }
> + }
> ```

If your app is based on [`react-native-test-app`](https://github.com/microsoft/react-native-test-app),
you don't need to edit `settings.gradle` yourself: it applies the same
substitutions when `react.buildFromSource=true` is set in
`android/gradle.properties`. That is how the test app in this repository builds —
see [`apps/test-app/android/gradle.properties`](../apps/test-app/android/gradle.properties).

## Vendoring Hermes

To fetch the pinned Hermes, you need to run from your app package:

```
npx react-native-node-api vendor-hermes
```

This will print a path which needs to be stored in `REACT_NATIVE_OVERRIDE_HERMES_DIR` to instruct the React Native Gradle scripts to use it.

This can be combined into a single line:

```
export REACT_NATIVE_OVERRIDE_HERMES_DIR=$(npx react-native-node-api vendor-hermes --silent)
```

React Native reads this as an environment variable, and Gradle cannot set one
for its own build, so it has to be exported in whatever ends up invoking Gradle:

- the terminal you run `./gradlew` or `npx react-native run-android` from, for
  every new shell,
- or the environment Android Studio is launched from — starting it from a shell
  that has the variable set is the simplest way to get it there.

Re-running the command is cheap: it re-uses the existing clone and just prints
its path. If the variable is missing, the build fails early with a message
repeating the command to run.

Without the override, React Native downloads and builds its own Hermes, which
does not carry the Node-API implementation this package links against — the
build then fails to find `hermes_napi_create_env`.

> [!NOTE]
> On Apple platforms this is automated: the podspec vendors Hermes during
> `pod install` when the variable isn't already set, so there is no manual step
> there.

## Cleaning your React Native build folders

If you've accidentally built your app without the vendored Hermes, you can clean things up by deleting the `ReactAndroid` build folder.

```
rm -rf node_modules/react-native/ReactAndroid/build
```
