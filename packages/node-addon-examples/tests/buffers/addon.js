/* eslint-disable @typescript-eslint/no-require-imports */
/* eslint-disable no-undef */
const addon = require("bindings")("addon.node");
// const assert = require("assert");

const toLocaleString = (text) => {
  return text
    .toString()
    .split(",")
    .map((code) => String.fromCharCode(parseInt(code, 10)))
    .join("");
};

// module.exports = async () => {
console.log(toLocaleString(addon.newBuffer()), addon.theText);
console.log(toLocaleString(addon.newExternalBuffer()), addon.theText);
console.log(toLocaleString(addon.copyBuffer()), addon.theText);
let buffer = addon.staticBuffer();
console.log(addon.bufferHasInstance(buffer), true);
console.log(addon.bufferInfo(buffer), true);
addon.invalidObjectAsBuffer({});

// TODO: Add gc tests
// @see
// https://github.com/callstackincubator/react-native-node-api/issues/182
// };
