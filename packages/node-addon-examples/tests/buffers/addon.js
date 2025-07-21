/* eslint-disable @typescript-eslint/no-require-imports */
/* eslint-disable no-undef */
const assert = require("assert");

const toLocaleString = (text) => {
  return text
    .toString()
    .split(",")
    .map((code) => String.fromCharCode(parseInt(code, 10)))
    .join("");
};

module.exports = async () => {
  const addon = require("bindings")("addon.node");
  assert.strictEqual(toLocaleString(addon.newBuffer()), addon.theText);
  assert.strictEqual(toLocaleString(addon.newExternalBuffer()), addon.theText);
  assert.strictEqual(toLocaleString(addon.copyBuffer()), addon.theText);
  let buffer = addon.staticBuffer();
  assert.strictEqual(addon.bufferHasInstance(buffer), true);
  assert.strictEqual(addon.bufferInfo(buffer), true);
  addon.invalidObjectAsBuffer({});

  // TODO: Add gc tests
  // @see
  // https://github.com/callstackincubator/react-native-node-api/issues/182
};
