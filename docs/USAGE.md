# Usage: How to write and consume a React Native Node-API Module

The purpose of this document is to explain how Node-API modules are supported all the way from an app loading a library package to the library's native code returning a JavaScript value to from a function call.

For the purpose of the explanation, we'll introduce a two fictitious packages:

- `calculator-lib`: A package publishing a Node-API module.
- `my-app`: An app depending on `calculator-lib`.

## Steps needed for the app developer

```bash
npm install --save calculator-lib react-native-node-api
```

The app developer has to install both `calculator-lib` as well as `react-native-node-api`.
The reason for the latter is a current limitation of the React Native Community CLI which doesn't consider transitive dependencies when enumerating packages for auto-linking.

> [!WARNING]
> It's important to match the exact version of the `react-native-node-api` declared as peer dependency by `calculator-lib`.

For the app to resolve the Node-API dynamic library files, the app developer must update their Metro config to use a `resolveRequest` function exported from `react-native-node-api`:

```javascript
const { getDefaultConfig, mergeConfig } = require("@react-native/metro-config");
const nodeApi = require("react-native-node-api/metro-config");
module.exports = mergeConfig(getDefaultConfig(__dirname), {
  resolver: { resolveRequest: nodeApi.resolveRequest },
});
```

At some point the app code will import (or require) the entrypoint of `calculator-lib`:

```javascript
import { add } from "calculator-lib";
console.log("1 + 2 =", add(1, 2));
```

We will be implementing this `add` function.

## Steps needed for the author of the `calculator-lib` library

### Install `react-native-node-api` as a dev-dependency and declare a peer dependency

```bash
npm install react-native-node-api --save-dev --save-exact
```

Update the package.json of your library to add a peer dependency on the package as well:

```bash
# Update the command to use the exact version you installed as dev-dependency
npm pkg set peerDependencies.react-native-node-api=1.2.3
```

### Implement native code

You can really use any language able to produce prebuilt binaries in the expected format with support for calling the Node-API FFI. See the [documentation on prebuilds](./PREBUILDS.md) for the specifics on the expected names and format of these.

For the sake of simplicity, this document use a simple native module implemented in C.

```cpp
// addon.c

#include <assert.h>
#include <node_api.h>
#include <stdio.h>

static napi_value Add(napi_env env, napi_callback_info info) {
  napi_status status;

  size_t argc = 2;
  napi_value args[2];
  status = napi_get_cb_info(env, info, &argc, args, NULL, NULL);
  assert(status == napi_ok);

  if (argc < 2) {
    napi_throw_type_error(env, NULL, "Wrong number of arguments");
    return NULL;
  }

  napi_valuetype valuetype0;
  status = napi_typeof(env, args[0], &valuetype0);
  assert(status == napi_ok);

  napi_valuetype valuetype1;
  status = napi_typeof(env, args[1], &valuetype1);
  assert(status == napi_ok);

  if (valuetype0 != napi_number || valuetype1 != napi_number) {
    napi_throw_type_error(env, NULL, "Wrong arguments");
    return NULL;
  }

  double value0;
  status = napi_get_value_double(env, args[0], &value0);
  assert(status == napi_ok);

  double value1;
  status = napi_get_value_double(env, args[1], &value1);
  assert(status == napi_ok);

  napi_value sum;
  status = napi_create_double(env, value0 + value1, &sum);
  assert(status == napi_ok);

  return sum;
}

#define DECLARE_NAPI_METHOD(name, func)                                        \
  { name, 0, func, 0, 0, 0, napi_default, 0 }

NAPI_MODULE_INIT(/* napi_env env, napi_value exports */) {
  napi_status status;

  napi_property_descriptor addDescriptor = DECLARE_NAPI_METHOD("add", Add);
  status = napi_define_properties(env, exports, 1, &addDescriptor);
  assert(status == napi_ok);

  return exports;
}
```

### Build the prebuilt binaries

```
npx react-native-node-api build ./addon.c
```

This is a shorthand command which generates a CMake project from the single source-file and prebuilds for both the Apple and Android platforms. See the [CLI documentation](./CLI.md) for more information on the options available and [documentation on prebuilds](./PREBUILDS.md) for the specifics on their format and structure.

<!-- TODO: Add a listing of the files produced when running command: Some temp (cached) CMakeList.txt, the CMake project dir, 2x platform specific prebuild directories -->

### Load and export the native module

```javascript
module.exports = require("./prebuild.node");
```
