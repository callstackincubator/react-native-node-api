const assert = require("assert");
const test_async = require("bindings")("addon.node");

const test = () =>
  new Promise((resolve, reject) => {
    test_async.Test(5, {}, (err, val) => {
      if (err) {
        reject(err);
        return;
      }
      try {
        assert.strictEqual(err, null);
        assert.strictEqual(val, 10);
      } catch (e) {
        reject(e);
      }
      resolve();
    });
  });

const testCancel = () =>
  new Promise((resolve) => {
    test_async.TestCancel(() => resolve());
  });

const doRepeatedWork = (count = 0) =>
  new Promise((resolve, reject) => {
    const iterations = 100;
    const workDone = (status) => {
      try {
        assert.strictEqual(status, 0);
      } catch (e) {
        reject(e);
      }
      if (++count < iterations) {
        test_async.DoRepeatedWork(workDone);
      } else {
        resolve();
      }
    };
    test_async.DoRepeatedWork(workDone);
  });

const testExecuteThread = () =>
  new Promise((resolve, reject) => {
    test_async.TestExecuteThread((executeOffJsThread, completeOnJsThread) => {
      try {
        assert.strictEqual(
          executeOffJsThread,
          true,
          "expected execute to run off the JS thread",
        );
        assert.strictEqual(
          completeOnJsThread,
          true,
          "expected complete to run on the JS thread",
        );
        resolve();
      } catch (e) {
        reject(e);
      }
    });
  });

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const waitForExecuteStart = async () => {
  while (!test_async.HasStarted()) {
    await delay(1);
  }
};

const testBlockingExecute = async () => {
  let completed = false;
  const completion = new Promise((resolve, reject) => {
    test_async.TestBlockingExecute((status) => {
      completed = true;
      try {
        assert.strictEqual(status, 0 /* napi_ok */);
        resolve();
      } catch (e) {
        reject(e);
      }
    });
  });
  await waitForExecuteStart();
  assert.strictEqual(completed, false);
  test_async.ReleaseGate();
  await completion;
};

const testCancelRunning = async () => {
  const completion = new Promise((resolve, reject) => {
    test_async.TestBlockingExecute((status) => {
      try {
        assert.strictEqual(status, 0 /* napi_ok */);
        resolve();
      } catch (e) {
        reject(e);
      }
    });
  });
  await waitForExecuteStart();
  // The work is executing, so cancellation must fail (unlike TestCancel,
  // which cancels work that is still queued).
  const status = test_async.CancelGated();
  assert.strictEqual(status, 9 /* napi_generic_failure */);
  test_async.ReleaseGate();
  await completion;
};

module.exports = async () => {
  await Promise.all([test(), testCancel(), doRepeatedWork()]);
  // The gated tests share state in the addon, so they run sequentially.
  await testExecuteThread();
  await testBlockingExecute();
  await testCancelRunning();
};
