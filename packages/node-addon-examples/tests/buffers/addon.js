const addon = require('bindings')('addon')
const assert = require('assert');

const toLocaleString = (text) => {
  return text.toLocaleString().split(',') 
  .map(code => String.fromCharCode(parseInt(code, 10))) 
  .join('');}


console.log(toLocaleString(addon.newExternalBuffer()), addon.theText);
// console.log(addon.newBuffer().toLocaleString(), addon.theText);
  console.log('gc1');
  console.log(addon.getDeleterCallCount(), 0);

  global.gc();

  console.log(addon.getDeleterCallCount(), 1);
  
//   console.log(addon.getDeleterCallCount(), 1);
  // assert.strictEqual(addon.copyBuffer(), addon.theText);

//   let buffer = addon.staticBuffer();
//   assert.strictEqual(addon.bufferHasInstance(buffer), true);
//   assert.strictEqual(addon.bufferInfo(buffer), true);
//   buffer = null;
//   global.gc();
//   console.log(addon.getDeleterCallCount(), 1);
// //   await tick(10);
//   console.log('gc2');
//   console.log(addon.getDeleterCallCount(), 2);

// //   // To test this doesn't crash
//   addon.invalidObjectAsBuffer({});

// //   const testBuffer = addon.bufferFromArrayBuffer();
// //   assert(testBuffer instanceof Buffer, 'Expected a Buffer');
// // })().then(()=>{});