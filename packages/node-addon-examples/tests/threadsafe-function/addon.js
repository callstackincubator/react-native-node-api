// Ported from Node.js' test/node-api/test_threadsafe_function/test.js. The
// upstream child-process teardown tests (testUnref) do not port to React
// Native; ref/unref are instead exercised in-process by testRefUnref, and
// testCallIntoModule supplements the suite by asserting that delivery is
// never synchronous, even when calling from the JS thread itself.
const assert = require("assert");
const binding = require("bindings")("addon.node");
const expectedArray = (function (arrayLength) {
  const result = [];
  for (let index = 0; index < arrayLength; index++) {
    result.push(arrayLength - 1 - index);
  }
  return result;
})(binding.ARRAY_LENGTH);

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
    if (threadStarter === "StartThreadNonblocking") {
      // Let's make this thread really busy for a short while to ensure that
      // the queue fills and the thread receives a napi_queue_full.
      const start = Date.now();
      while (Date.now() - start < 200);
    }
  });
}

function testWithoutJSMarshaller() {
  return new Promise((resolve) => {
    let callCount = 0;
    binding.StartThreadNoNative(
      function testCallback() {
        callCount++;

        // The default call-into-JS implementation passes no arguments.
        assert.strictEqual(arguments.length, 0);
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
  });
}

// With no libuv loop to act on in React Native (ref_loop/unref_loop are left
// null in the hermes_napi_host), napi_ref/unref_threadsafe_function must
// still succeed and leave delivery unaffected.
function testRefUnref() {
  return new Promise((resolve) => {
    const array = [];
    let refCycled = false;
    binding.StartThread(
      function testCallback(value) {
        array.push(value);
        if (!refCycled) {
          refCycled = true;
          binding.Unref();
          binding.Ref();
          binding.Unref();
        }
        if (array.length === binding.ARRAY_LENGTH) {
          setImmediate(() => {
            binding.StopThread(() => {
              resolve(array);
            }, false);
          });
        }
      },
      false /* abort */,
      false /* launchSecondary */,
      binding.MAX_QUEUE_SIZE,
    );
  }).then((result) => assert.deepStrictEqual(result, expectedArray));
}

// Create a threadsafe function and call it from the JS thread itself: the
// delivery and the finalize callback must both still happen asynchronously.
function testCallIntoModule() {
  return new Promise((resolve, reject) => {
    let delivered = false;
    let finalized = false;
    binding.CallIntoModule(
      () => {
        delivered = true;
      },
      {},
      "test_tsfn_resource",
      () => {
        finalized = true;
        try {
          assert.strictEqual(delivered, true);
          resolve();
        } catch (e) {
          reject(e);
        }
      },
    );
    assert.strictEqual(delivered, false);
    assert.strictEqual(finalized, false);
  });
}

module.exports = () =>
  testWithoutJSMarshaller()
    // Start the thread in blocking mode, and assert that all values are
    // passed. Quit after it's done.
    .then(() =>
      testWithJSMarshaller({
        threadStarter: "StartThread",
        maxQueueSize: binding.MAX_QUEUE_SIZE,
        quitAfter: binding.ARRAY_LENGTH,
      }),
    )
    .then((result) => assert.deepStrictEqual(result, expectedArray))

    // Start the thread in blocking mode, and assert that all values are
    // passed. Quit after it's done.
    // Doesn't pass the callback js function to napi_create_threadsafe_function.
    // Instead, use an alternative reference to get js function called.
    .then(() =>
      testWithJSMarshaller({
        threadStarter: "StartThreadNoJsFunc",
        maxQueueSize: binding.MAX_QUEUE_SIZE,
        quitAfter: binding.ARRAY_LENGTH,
      }),
    )
    .then((result) => assert.deepStrictEqual(result, expectedArray))

    // Start the thread in blocking mode with an infinite queue, and assert
    // that all values are passed. Quit after it's done.
    .then(() =>
      testWithJSMarshaller({
        threadStarter: "StartThread",
        maxQueueSize: 0,
        quitAfter: binding.ARRAY_LENGTH,
      }),
    )
    .then((result) => assert.deepStrictEqual(result, expectedArray))

    // Start the thread in non-blocking mode, and assert that all values are
    // passed. Quit after it's done.
    .then(() =>
      testWithJSMarshaller({
        threadStarter: "StartThreadNonblocking",
        maxQueueSize: binding.MAX_QUEUE_SIZE,
        quitAfter: binding.ARRAY_LENGTH,
      }),
    )
    .then((result) => assert.deepStrictEqual(result, expectedArray))

    // Start the thread in blocking mode, and assert that all values are
    // passed. Quit early, but let the thread finish.
    .then(() =>
      testWithJSMarshaller({
        threadStarter: "StartThread",
        maxQueueSize: binding.MAX_QUEUE_SIZE,
        quitAfter: 1,
      }),
    )
    .then((result) => assert.deepStrictEqual(result, expectedArray))

    // Start the thread in blocking mode with an infinite queue, and assert
    // that all values are passed. Quit early, but let the thread finish.
    .then(() =>
      testWithJSMarshaller({
        threadStarter: "StartThread",
        maxQueueSize: 0,
        quitAfter: 1,
      }),
    )
    .then((result) => assert.deepStrictEqual(result, expectedArray))

    // Start the thread in non-blocking mode, and assert that all values are
    // passed. Quit early, but let the thread finish.
    .then(() =>
      testWithJSMarshaller({
        threadStarter: "StartThreadNonblocking",
        maxQueueSize: binding.MAX_QUEUE_SIZE,
        quitAfter: 1,
      }),
    )
    .then((result) => assert.deepStrictEqual(result, expectedArray))

    // Start the thread in blocking mode, and assert that all values are
    // passed. Quit early, but let the thread finish. Launch a secondary thread
    // to test the reference counter incrementing functionality.
    .then(() =>
      testWithJSMarshaller({
        threadStarter: "StartThread",
        quitAfter: 1,
        maxQueueSize: binding.MAX_QUEUE_SIZE,
        launchSecondary: true,
      }),
    )
    .then((result) => assert.deepStrictEqual(result, expectedArray))

    // Start the thread in non-blocking mode, and assert that all values are
    // passed. Quit early, but let the thread finish. Launch a secondary thread
    // to test the reference counter incrementing functionality.
    .then(() =>
      testWithJSMarshaller({
        threadStarter: "StartThreadNonblocking",
        quitAfter: 1,
        maxQueueSize: binding.MAX_QUEUE_SIZE,
        launchSecondary: true,
      }),
    )
    .then((result) => assert.deepStrictEqual(result, expectedArray))

    // Start the thread in blocking mode, and assert that it could not finish.
    // Quit early by aborting.
    .then(() =>
      testWithJSMarshaller({
        threadStarter: "StartThread",
        quitAfter: 1,
        maxQueueSize: binding.MAX_QUEUE_SIZE,
        abort: true,
      }),
    )
    .then((result) => assert.strictEqual(result.indexOf(0), -1))

    // Start the thread in blocking mode with an infinite queue, and assert
    // that it could not finish. Quit early by aborting.
    .then(() =>
      testWithJSMarshaller({
        threadStarter: "StartThread",
        quitAfter: 1,
        maxQueueSize: 0,
        abort: true,
      }),
    )
    .then((result) => assert.strictEqual(result.indexOf(0), -1))

    // Start the thread in non-blocking mode, and assert that it could not
    // finish. Quit early and aborting.
    .then(() =>
      testWithJSMarshaller({
        threadStarter: "StartThreadNonblocking",
        quitAfter: 1,
        maxQueueSize: binding.MAX_QUEUE_SIZE,
        abort: true,
      }),
    )
    .then((result) => assert.strictEqual(result.indexOf(0), -1))

    // Make sure that the threadsafe function isn't stalled when the queue
    // outgrows what a single dispatch may drain (kMaxDispatchCount in
    // Hermes' API/napi/hermes_napi_tsfn.cpp).
    .then(() =>
      testWithJSMarshaller({
        threadStarter: "StartThreadNonblocking",
        maxQueueSize: binding.ARRAY_LENGTH >>> 1,
        quitAfter: binding.ARRAY_LENGTH,
      }),
    )
    .then((result) => assert.deepStrictEqual(result, expectedArray))

    .then(() => testRefUnref())
    .then(() => testCallIntoModule());
