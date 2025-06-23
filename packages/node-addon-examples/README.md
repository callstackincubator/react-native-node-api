# `react-native-node-addon-examples`

A wrapper around the examples in the [nodejs/node-addon-examples](https://github.com/nodejs/node-addon-examples) repo, using `gyp-to-cmake` and `cmake-rn` to prepare prebuilds and scaffolding for loading the addons.

The main purpose is to use these as tests to verify the implementation. We choose to use this as our first signal for compliance, over the [js-native-api tests in the Node.js project](https://github.com/nodejs/node/tree/main/test/js-native-api), because the examples depends much less on Node.js built-in runtime APIs.
