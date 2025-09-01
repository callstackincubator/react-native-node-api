# Android support

## Building Hermes from source

Because we're using a version of Hermes patched with Node-API support, we need to build React Native from source.

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

To download our custom version of Hermes, you need to run from your app package:

```
npx react-native-node-api vendor-hermes
```

This will print a path which needs to be stored in `REACT_NATIVE_OVERRIDE_HERMES_DIR` to instruct the React Native Gradle scripts to use it.

This can be combined into a single line:

```
export REACT_NATIVE_OVERRIDE_HERMES_DIR=`npx react-native-node-api vendor-hermes --silent`
```

## Cleaning your React Native build folders

If you've accidentally built your app without Hermes patched, you can clean things up by deleting the `ReactAndroid` build folder.

```
rm -rf node_modules/react-native/ReactAndroid/build
```
