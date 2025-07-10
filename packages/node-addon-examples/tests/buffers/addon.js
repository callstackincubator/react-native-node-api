const addon = require("bindings")("addon.node");

const toLocaleString = (text) => {
  return text
    .toLocaleString()
    .split(",")
    .map((code) => String.fromCharCode(parseInt(code, 10)))
    .join("");
};

console.log(toLocaleString(addon.newExternalBuffer()), addon.theText);
console.log(addon.newBuffer().toLocaleString(), addon.theText);
console.log("gc1");
console.log(addon.getDeleterCallCount(), 0);
global.gc();
console.log(addon.getDeleterCallCount(), 1);
console.log(addon.getDeleterCallCount(), 1);
console.log(addon.copyBuffer(), addon.theText);

let buffer = addon.staticBuffer();
console.log(addon.bufferHasInstance(buffer), true);
console.log(addon.bufferInfo(buffer), true);
buffer = null;
global.gc();
console.log(addon.getDeleterCallCount(), 1);
console.log("gc2");
console.log(addon.getDeleterCallCount(), 2);

addon.invalidObjectAsBuffer({});
