/* eslint-disable @typescript-eslint/no-require-imports */
/* eslint-disable no-undef */
const assert = require("assert");
const binding = require("bindings")("addon.node");
const expectedArray = (function (arrayLength) {
  const result = [];
  for (let index = 0; index < arrayLength; index++) {
    result.push(arrayLength - 1 - index);
  }
  return result;
})(binding.ARRAY_LENGTH);

let cnt = 0;
function testWithJSMarshaller({
  threadStarter,
  quitAfter,
  abort,
  maxQueueSize,
  launchSecondary,
}) {
  return new Promise((resolve) => {
    const array = [];
    binding[threadStarter](
      function testCallback(value) {
        array.push(value);
        if (array.length === quitAfter) {
          setImmediate(() => {
            binding.StopThread(() => {
              resolve(array);
            }, !!abort);
          });
        }
      },
      !!abort,
      !!launchSecondary,
      maxQueueSize,
    );
  });
}

module.exports = () => {
  return (
    new Promise(function testWithoutJSMarshaller(resolve) {
      let callCount = 0;
      binding.StartThreadNoNative(
        function testCallback() {
          callCount++;
          if (callCount === binding.ARRAY_LENGTH) {
            setImmediate(() => {
              binding.StopThread(() => {
                resolve();
              }, false);
            });
          }
        },
        false /* abort */,
        false /* launchSecondary */,
        binding.MAX_QUEUE_SIZE,
      );
    })
      .then(() =>
        testWithJSMarshaller({
          threadStarter: "StartThread",
          maxQueueSize: binding.MAX_QUEUE_SIZE,
          quitAfter: binding.ARRAY_LENGTH,
        }),
      )
      .then(() =>
        testWithJSMarshaller({
          threadStarter: "StartThreadNoJsFunc",
          maxQueueSize: binding.MAX_QUEUE_SIZE,
          quitAfter: binding.ARRAY_LENGTH,
        }),
      )
      .then((result) => assert.deepStrictEqual(result, expectedArray))

      // Start the thread in blocking mode with an infinite queue, and assert that all
      // values are passed. Quit after it's done.
      .then(() =>
        testWithJSMarshaller({
          threadStarter: "StartThread",
          maxQueueSize: 0,
          quitAfter: binding.ARRAY_LENGTH,
        }),
      )
      .then((result) => assert.deepStrictEqual(result, expectedArray))

      // Start the thread in non-blocking mode, and assert that all values are passed.
      // Quit after it's done.
      .then(() =>
        testWithJSMarshaller({
          threadStarter: "StartThreadNonblocking",
          maxQueueSize: binding.MAX_QUEUE_SIZE,
          quitAfter: binding.ARRAY_LENGTH,
        }),
      )
      .then((result) => assert.deepStrictEqual(result, expectedArray))

      // // Start the thread in blocking mode, and assert that all values are passed.
      // // Quit early, but let the thread finish.
      .then(() =>
        testWithJSMarshaller({
          threadStarter: "StartThread",
          maxQueueSize: binding.MAX_QUEUE_SIZE,
          quitAfter: 1,
        }),
      )
      .then((result) => assert.deepStrictEqual(result, expectedArray))

      // // Start the thread in blocking mode with an infinite queue, and assert that all
      // // values are passed. Quit early, but let the thread finish.
      .then(() =>
        testWithJSMarshaller({
          threadStarter: "StartThread",
          maxQueueSize: 0,
          quitAfter: 1,
        }),
      )
      .then((result) => assert.deepStrictEqual(result, expectedArray))

      // // Start the thread in non-blocking mode, and assert that all values are passed.
      // // Quit early, but let the thread finish.
      .then(() =>
        testWithJSMarshaller({
          threadStarter: "StartThreadNonblocking",
          maxQueueSize: binding.MAX_QUEUE_SIZE,
          quitAfter: 1,
        }),
      )
      .then((result) => assert.deepStrictEqual(result, expectedArray))

      // // Start the thread in blocking mode, and assert that all values are passed.
      // // Quit early, but let the thread finish. Launch a secondary thread to test the
      // // reference counter incrementing functionality.
      .then(() =>
        testWithJSMarshaller({
          threadStarter: "StartThread",
          quitAfter: 1,
          maxQueueSize: binding.MAX_QUEUE_SIZE,
          launchSecondary: true,
        }),
      )
      .then((result) => assert.deepStrictEqual(result, expectedArray))

      // // Start the thread in non-blocking mode, and assert that all values are passed.
      // // Quit early, but let the thread finish. Launch a secondary thread to test the
      // // reference counter incrementing functionality.
      .then(() =>
        testWithJSMarshaller({
          threadStarter: "StartThreadNonblocking",
          quitAfter: 1,
          maxQueueSize: binding.MAX_QUEUE_SIZE,
          launchSecondary: true,
        }),
      )
      .then((result) => assert.deepStrictEqual(result, expectedArray))

      // // Start the thread in blocking mode, and assert that it could not finish.
      // // Quit early by aborting.
      .then(() =>
        testWithJSMarshaller({
          threadStarter: "StartThread",
          quitAfter: 1,
          maxQueueSize: binding.MAX_QUEUE_SIZE,
          abort: true,
        }),
      )
      .then((result) => assert.strictEqual(result.indexOf(0), -1))

      // Start the thread in blocking mode with an infinite queue, and assert that it
      // could not finish. Quit early by aborting.
      .then(() =>
        testWithJSMarshaller({
          threadStarter: "StartThread",
          quitAfter: 1,
          maxQueueSize: 0,
          abort: true,
        }),
      )
      .then((result) => assert.strictEqual(result.indexOf(0), -1))

      // // Start the thread in non-blocking mode, and assert that it could not finish.
      // // Quit early and aborting.
      .then(() =>
        testWithJSMarshaller({
          threadStarter: "StartThreadNonblocking",
          quitAfter: 1,
          maxQueueSize: binding.MAX_QUEUE_SIZE,
          abort: true,
        }),
      )
      .then((result) => assert.strictEqual(result.indexOf(0), -1))

      // // Make sure that threadsafe function isn't stalled when we hit
      // // `kMaxIterationCount` in `src/node_api.cc`
      .then(() =>
        testWithJSMarshaller({
          threadStarter: "StartThreadNonblocking",
          maxQueueSize: binding.ARRAY_LENGTH >>> 1,
          quitAfter: binding.ARRAY_LENGTH,
        }),
      )
      .then((result) => assert.deepStrictEqual(result, expectedArray))
  );
};
