import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { readPackageSync } from "read-pkg";

import { EXAMPLES_DIR } from "./cmake-projects.mjs";

const ALLOW_LIST = [
  "1-getting-started/1_hello_world/napi/",
  "1-getting-started/1_hello_world/node-addon-api/",
  "1-getting-started/1_hello_world/node-addon-api-addon-class/",
  "1-getting-started/2_function_arguments/napi/",
  "1-getting-started/2_function_arguments/node-addon-api/",
  "1-getting-started/3_callbacks/napi/",
  "1-getting-started/3_callbacks/node-addon-api/",
  "1-getting-started/4_object_factory/napi/",
  "1-getting-started/4_object_factory/node-addon-api/",
  "1-getting-started/5_function_factory/napi/",
  // "1-getting-started/5_function_factory/node-addon-api/",
  // "1-getting-started/6_object_wrap/napi/", // TODO: Fix C++ support to allow lambda functions
  // "1-getting-started/6_object_wrap/node-addon-api/",
  // "1-getting-started/7_factory_wrap/napi/", // TODO: Fix C++ support to allow lambda functions
  // "1-getting-started/7_factory_wrap/node-addon-api/",
  // "2-js-to-native-conversion/8_passing_wrapped/napi/", // TODO: Fix C++ support to allow lambda functions
  // "2-js-to-native-conversion/8_passing_wrapped/node-addon-api/",
  // "2-js-to-native-conversion/array_buffer_to_native/node-addon-api/",
  // "2-js-to-native-conversion/object-template-demo/napi/", // TODO: Fix C++ support to allow noexcept
  // "2-js-to-native-conversion/object-wrap-demo/node-addon-api/",
  // "2-js-to-native-conversion/typed_array_to_native/node-addon-api/",
  // "3-context-awareness/napi", // Disabled, as it's using worker_threads
  // "4-references-and-handle-scope/function-reference-demo/node-addon-api/"
  // "5-async-work/async_pi_estimate/node-addon-api/" // Disabled, as it's using process.argv
  // "5-async-work/async_work_promise/napi/" // Disabled, as it's using process.argv
  // "5-async-work/async_work_promise/node-addon-api/" // Disabled, as it's using process.argv
  "5-async-work/async_work_thread_safe_function/napi/",
  // "5-async-work/async-iterator/node-addon-api/" // Brings its own CMake project 👀
  // "5-async-work/call-js-from-async-worker-execute/node-addon-api/" // Disabled, as it's using "node:events"
  // TODO: Perhaps we should make sure gyp-to-cmake produce projects which match the output directory of gyp, to fix 👇
  // "5-async-work/napi-asyncworker-example/node-addon-api/" // Disabled, as it's a require statement to an unexpected path
  // "6-threadsafe-function/promise-callback-demo/node-addon-api/" // Disabled, as it's a require statement to an unexpected path
  // "6-threadsafe-function/thread_safe_function_counting/node-addon-api/"
  // "6-threadsafe-function/thread_safe_function_round_trip/napi/", // Disabled, as it's using #include <uv.h>
  // "6-threadsafe-function/thread_safe_function_with_object_wrap/node-addon-api/"
  // "6-threadsafe-function/threadsafe-async-iterator/node-addon-api/" // Brings its own CMake project 👀
  // "6-threadsafe-function/typed_threadsafe_function/node-addon-api/"
  // "7-events/emit_event_from_cpp/node-addon-api/", // Disabled, as it's using "node:events"
  // "7-events/inherits_from_event_emitter/node-addon-api/", // Disabled, as it's using "node:events"
  // "8-tooling/build_with_cmake/napi/" // Brings its own CMake project 👀
  // "8-tooling/build_with_cmake/node-addon-api/" // Brings its own CMake project 👀
  // "8-tooling/typescript_with_addon/node-addon-api",
];

console.log("Copying files to", EXAMPLES_DIR);

// Clean up the destination directory before copying
// fs.rmSync(EXAMPLES_DIR, { recursive: true, force: true });

const require = createRequire(import.meta.url);

const EXAMPLES_PACKAGE_PATH = require.resolve(
  "node-addon-examples/package.json",
);
const SRC_DIR = path.join(path.dirname(EXAMPLES_PACKAGE_PATH), "src");
console.log("Copying files from", SRC_DIR);

let counter = 0;

for (const src of ALLOW_LIST) {
  const srcPath = path.join(SRC_DIR, src);
  const destPath = path.join(EXAMPLES_DIR, src);

  const uniquePackageName = `example-${counter++}`;

  if (fs.existsSync(destPath)) {
    console.warn(
      `Destination path ${destPath} already exists - skipping copy of ${src}.`,
    );
    continue;
  }

  console.log("Copying from", srcPath, "to", destPath);
  fs.cpSync(srcPath, destPath, { recursive: true });
  // Update package names in package.json files recursively,
  // as they have duplicate names, causing collisions when vendored into the host package.
  for (const entry of fs.readdirSync(destPath, {
    withFileTypes: true,
    recursive: true,
  })) {
    if (entry.name === "package.json") {
      const packageJson = readPackageSync({ cwd: entry.parentPath });
      // Ensure example package names are unique
      packageJson.name = uniquePackageName;
      fs.writeFileSync(
        path.join(entry.parentPath, entry.name),
        JSON.stringify(packageJson, null, 2),
        "utf-8",
      );
    }
  }
}
