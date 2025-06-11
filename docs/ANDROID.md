# Android support

## Building Hermes from source

Because we're using a version of Hermes patched with Node-API support, we need to build React Native from source.

```
export REACT_NATIVE_OVERRIDE_HERMES_DIR=`npx react-native-node-api vendor-hermes --silent`
```

## Cleaning your React Native build folders

If you've accidentally built your app without Hermes patched, you can clean things up by deleting the `ReactAndroid` build folder.

```
rm -rf node_modules/react-native/ReactAndroid/build
```
