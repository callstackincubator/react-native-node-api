/* eslint-disable @typescript-eslint/no-require-imports */

function assertLogs(cb: () => void, expectedMessages: string[]) {
  const errors: Error[] = [];
  // Spying on the console.log function, as the examples don't assert anything themselves
  const originalLog = console.log;
  console.log = (message: string, ...args: unknown[]) => {
    const nextMessage = expectedMessages.shift();
    const combinedMessage = [message, ...args].map(String).join(" ");
    if (nextMessage !== combinedMessage) {
      errors.push(new Error(`Unexpected log message '${combinedMessage}'`));
    }
  };
  try {
    cb();
    if (expectedMessages.length > 0) {
      errors.push(
        new Error(
          `Missing expected message(s): ${expectedMessages.join(", ")}`,
        ),
      );
    }
  } finally {
    console.log = originalLog;
  }
  // Throw and first error
  const [firstError] = errors;
  if (firstError) {
    throw firstError;
  }
}

export const suites: Record<
  string,
  Record<string, () => void | (() => void)>
> = {
  "1-getting-started": {
    "1_hello_world/napi": () =>
      assertLogs(
        () =>
          require("../examples/1-getting-started/1_hello_world/napi/hello.js"),
        ["world"],
      ),
    "1_hello_world/node-addon-api": () =>
      assertLogs(
        () =>
          require("../examples/1-getting-started/1_hello_world/node-addon-api/hello.js"),
        ["world"],
      ),
    "1_hello_world/node-addon-api-addon-class": () =>
      assertLogs(
        () =>
          require("../examples/1-getting-started/1_hello_world/node-addon-api-addon-class/hello.js"),
        ["world"],
      ),
    "2_function_arguments/napi": () =>
      assertLogs(
        () =>
          require("../examples/1-getting-started/2_function_arguments/napi/addon.js"),
        ["This should be eight: 8"],
      ),
    "2_function_arguments/node-addon-api": () =>
      assertLogs(
        () =>
          require("../examples/1-getting-started/2_function_arguments/node-addon-api/addon.js"),
        ["This should be eight: 8"],
      ),
    "3_callbacks/napi": () =>
      assertLogs(
        () =>
          require("../examples/1-getting-started/3_callbacks/napi/addon.js"),
        ["hello world"],
      ),
    "3_callbacks/node-addon-api": () =>
      assertLogs(
        () =>
          require("../examples/1-getting-started/3_callbacks/node-addon-api/addon.js"),
        ["hello world"],
      ),
    "4_object_factory/napi": () =>
      assertLogs(
        () =>
          require("../examples/1-getting-started/4_object_factory/napi/addon.js"),
        ["hello world"],
      ),
    "4_object_factory/node-addon-api": () =>
      assertLogs(
        () =>
          require("../examples/1-getting-started/4_object_factory/node-addon-api/addon.js"),
        ["hello world"],
      ),
    "5_function_factory": () =>
      assertLogs(
        () =>
          require("../examples/1-getting-started/5_function_factory/napi/addon.js"),
        ["hello world"],
      ),
  },
  "5-async-work": {
    // TODO: This crashes (SIGABRT)
    // "async_work_thread_safe_function": () => require("../examples/5-async-work/async_work_thread_safe_function/napi/index.js"),
  },
  tests: {
    buffers: () => require("../tests/buffers/addon.js"),
    async: () => require("../tests/async/addon.js"),
  },
};
