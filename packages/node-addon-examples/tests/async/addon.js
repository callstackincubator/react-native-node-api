/* eslint-disable @typescript-eslint/no-require-imports */
/* eslint-disable no-undef */
const test_async = require("bindings")("addon.node");
const assert = require("assert");

module.exports = async () => {
  return new Promise((resolve, reject) => {
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

    Promise.all([test(), testCancel(), doRepeatedWork()])
      .then(() => resolve())
      .catch(reject);
  });
};
