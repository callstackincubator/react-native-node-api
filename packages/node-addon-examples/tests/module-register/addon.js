const assert = require("assert");
const addon = require("bindings")("addon.node");

module.exports = () => {
  assert.strictEqual(addon.registration(), "napi_module_register");
};
