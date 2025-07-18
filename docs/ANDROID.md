# Android support

## Building Hermes from source

### Step 1: `settings.gradle`

Gradle needs specific configuration to build React Native from source: dependency substitutions for React Native & Hermes modules, and modifications to default logic in RN build scripts, which is done by setting an environment variable, as described in this section.

In your app's `settings.gradle` please include the below:

```groovy
// customize the path to match your node_modules location
apply(from: "../../../node_modules/react-native-node-api/android/app-settings.gradle")
applyNodeAPISettings(settings)
```

### Step 2: script for adjusting environment variables

> [!IMPORTANT]
> Each time you run Android Studio or build the Android app from a terminal, make sure the below is in place.

Because we're using a version of Hermes patched with Node-API support, we need to build React Native from source. A special environment variable (`REACT_NATIVE_OVERRIDE_HERMES_DIR`) must be set to the path of a Hermes engine with Node-API support. Since Gradle does not support loading `.env` files directly, this must be automated by the consumer. We provide the `react-native-node-api vendor-hermes --silent` command, which will download Hermes and output the path to Hermes directory path as its only output.

You can configure the environment variable using the following command:

```
export REACT_NATIVE_OVERRIDE_HERMES_DIR="$(npx react-native-node-api vendor-hermes --silent)"
```

This either needs to be done each time before Gradle / Android Studio invocation, or permanently in a shell init script such as `~/.zshrc` on Zsh (MacOS) or `~/.bashrc` on Bash (Linux).

## Cleaning your React Native build folders

If you've accidentally built your app without Hermes patched, you can clean things up by deleting the `ReactAndroid` build folder.

```
rm -rf node_modules/react-native/ReactAndroid/build
```
