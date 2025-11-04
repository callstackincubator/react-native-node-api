const assert = require("assert");
const binding = require("bindings")("addon.node");
const makeCallback = binding.makeCallback;

/**
 * Resource should be able to be arbitrary objects without special internal
 * slots. Testing with plain object here.
 */

function myMultiArgFunc(arg1, arg2, arg3) {
  assert.strictEqual(arg1, 1);
  assert.strictEqual(arg2, 2);
  assert.strictEqual(arg3, 3);
  return 42;
}

module.exports = () => {
  const resource = {};
  const process = (module.exports = {});

  assert.strictEqual(
    makeCallback(resource, process, function () {
      assert.strictEqual(arguments.length, 0);
      assert.strictEqual(this, process);
      return 42;
    }),
    42,
  );

  assert.strictEqual(
    makeCallback(
      resource,
      process,
      function (x) {
        assert.strictEqual(arguments.length, 1);
        assert.strictEqual(this, process);
        assert.strictEqual(x, 1337);
        return 42;
      },
      1337,
    ),
    42,
  );

  assert.strictEqual(
    makeCallback(resource, process, myMultiArgFunc, 1, 2, 3),
    42,
  );
};
