const assert = require("assert");
// cmake-rn emits to {targetSourceDir}/build/{configuration}, and this package's
// build script pins the configuration.
const addon = require("./build/RelWithDebInfo/addon.node");

module.exports = () => {
  assert.strictEqual(addon.registration(), "napi_module_register");
};
