# How it works

This document will outline what happens throughout the various parts of the system, when the app calls the `add` method on the library introduced in the ["usage" document](./USAGE.md).

If you want to follow along with the source code referenced throughout this document (such as `packages/host/cpp/HermesNapiHost.cpp`), clone this repo:

```bash
git clone https://github.com/callstackincubator/react-native-node-api.git
```

`calculator-lib`'s native code is a small Node-API addon written in C (see the ["usage" document](./USAGE.md#implement-native-code) for the full walkthrough of writing and building it):

```cpp
// addon.c

#include <assert.h>
#include <node_api.h>

static napi_value Add(napi_env env, napi_callback_info info) {
  napi_status status;

  size_t argc = 2;
  napi_value args[2];
  status = napi_get_cb_info(env, info, &argc, args, NULL, NULL);
  assert(status == napi_ok);

  double value0, value1;
  status = napi_get_value_double(env, args[0], &value0);
  assert(status == napi_ok);
  status = napi_get_value_double(env, args[1], &value1);
  assert(status == napi_ok);

  napi_value sum;
  status = napi_create_double(env, value0 + value1, &sum);
  assert(status == napi_ok);

  return sum;
}

#define DECLARE_NAPI_METHOD(name, func)                                       \
  { name, 0, func, 0, 0, 0, napi_default, 0 }

NAPI_MODULE_INIT(/* napi_env env, napi_value exports */) {
  napi_status status;

  napi_property_descriptor addDescriptor = DECLARE_NAPI_METHOD("add", Add);
  status = napi_define_properties(env, exports, 1, &addDescriptor);
  assert(status == napi_ok);

  return exports;
}
```

`calculator-lib`'s JavaScript entrypoint requires the prebuilt binary produced from that C code:

```javascript
module.exports = require("./prebuild.node");
```

And `my-app` imports and calls it:

```javascript
import { add } from "calculator-lib";
console.log("1 + 2 =", add(1, 2));
```

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

## Transformed code calls into `react-native-node-api`, loading the platform specific dynamic library

The native implementation of `requireNodeAddon` is responsible for loading the dynamic library and allow the Node-API module to register its initialization function, either by exporting a `napi_register_module_v1` function or by calling the (deprecated) `napi_module_register` function.

In any case the native code stores the initialization function in a data-structure.

## `react-native-node-api` creates a `napi_env` and initialize the Node-API module

The initialization function of a Node-API module expects a `napi_env`, which we create by calling `hermes_napi_create_env` with the low-level Hermes VM runtime behind the `jsi::Runtime`. As in Node.js, each addon gets its own environment.

## The library's C++ code initialize the `exports` object

An `exports` object is created for the Node-API module and both the `napi_env` and `exports` object is passed to the Node-API module's initialization function and the third party code is able to call the Node-API free functions.

Hermes implements both halves of Node-API: the engine-specific functions (see [js_native_api.h](https://github.com/nodejs/node/blob/main/src/js_native_api.h)) and the runtime-specific ones (see [node_api.h](https://github.com/nodejs/node/blob/main/src/node_api.h)). Node.js implements the latter on top of libuv, which React Native doesn't have — so Hermes leaves the host to supply the primitives they need, as a `hermes_napi_host` struct passed when the environment is created:

- `post_work` / `cancel_work` — run a unit of work on a worker thread and report back on the JavaScript thread. This is what backs `napi_create_async_work` and friends.
- `post_task` — schedule a callback on the JavaScript thread, used by thread-safe functions to dispatch queued calls.
- `ref_loop` / `unref_loop` — keep the event loop alive while a thread-safe function is referenced, modelling libuv's "ref" semantics.
- `fatal_exception` and, for embedders that have one, a libuv loop pointer for `napi_get_uv_event_loop`.

`react-native-node-api` provides that struct (see `packages/host/cpp/HermesNapiHost.cpp`), backed by React Native's `CallInvoker` for anything that has to land on the JavaScript thread and a process-global worker pool (four threads, like libuv's default) for the rest. `ref_loop` / `unref_loop` and the libuv loop pointer are deliberately left null: React Native's JavaScript thread has no ref-counted event-loop lifetime to model, so thread-safe function ref/unref are tracked but inert, and `napi_get_uv_event_loop` returns `napi_generic_failure` as upstream documents for hosts without libuv.

## `my-app` regain control and call `add`

When the `exports` object is populated by `calculator-lib`'s Node-API module, control is returned to `react-native-node-api` which returns the `exports` object to JavaScript, with the `add` function defined on it.

```javascript
import { add } from "calculator-lib";
console.log("1 + 2 =", add(1, 2));
```

## The library's C++ code execute the native function

Now that the app's JavaScript call the `add` function, the JavaScript engine will know to call the associated native function, which was setup during the initialization of the Node-API module and the native `Add` function is executed and control returned to JavaScript again.
