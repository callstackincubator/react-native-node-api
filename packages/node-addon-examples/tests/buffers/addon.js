/* eslint-disable @typescript-eslint/no-require-imports */
/* eslint-disable no-undef */
const addon = require("bindings")("addon.node");

const toLocaleString = (text) => {
  return text
    .toLocaleString()
    .split(",")
    .map((code) => String.fromCharCode(parseInt(code, 10)))
    .join("");
};

console.log(addon.newBuffer().toLocaleString(), addon.theText);
console.log(toLocaleString(addon.newExternalBuffer()), addon.theText);
console.log(addon.copyBuffer(), addon.theText);
let buffer = addon.staticBuffer();
console.log(addon.bufferHasInstance(buffer), true);
console.log(addon.bufferInfo(buffer), true);
addon.invalidObjectAsBuffer({});
