# Building Hermes from source

Because we're using a version of Hermes patched with Node-API support, we need to build React Native from source.

```
export REACT_NATIVE_OVERRIDE_HERMES_DIR=`npx react-native-node-api-modules vendor-hermes --silent`
```

## Cleaning your React Native build folders

```
rm -rf node_modules/react-native/ReactAndroid/build
```
