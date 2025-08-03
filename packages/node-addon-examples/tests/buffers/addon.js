const assert = require("assert");
const addon = require("bindings")("addon.node");

const toLocale = (text) => {
  return text
    .toString()
    .split(",")
    .map((code) => String.fromCharCode(parseInt(code, 10)))
    .join("");
};

module.exports = () => {
  assert.strictEqual(toLocale(addon.newBuffer()), addon.theText);
  assert.strictEqual(toLocale(addon.newExternalBuffer()), addon.theText);
  assert.strictEqual(toLocale(addon.copyBuffer()), addon.theText);
  let buffer = addon.staticBuffer();
  assert.strictEqual(addon.bufferHasInstance(buffer), true);
  assert.strictEqual(addon.bufferInfo(buffer), true);
  addon.invalidObjectAsBuffer({});

  // TODO: Add gc tests
  // @see
  // https://github.com/callstackincubator/react-native-node-api/issues/182
};
