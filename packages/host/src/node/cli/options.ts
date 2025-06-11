import assert from "node:assert/strict";

import { Option } from "@commander-js/extra-typings";

const { NODE_API_MODULES_STRIP_PATH_SUFFIX } = process.env;
assert(
  typeof NODE_API_MODULES_STRIP_PATH_SUFFIX === "undefined" ||
    NODE_API_MODULES_STRIP_PATH_SUFFIX === "true" ||
    NODE_API_MODULES_STRIP_PATH_SUFFIX === "false",
  "Expected NODE_API_MODULES_STRIP_PATH_SUFFIX to be either 'true' or 'false'"
);

export const stripPathSuffixOption = new Option(
  "--strip-path-suffix",
  "Don't append escaped relative path to the library names (entails one Node-API module per package)"
).default(NODE_API_MODULES_STRIP_PATH_SUFFIX === "true");
