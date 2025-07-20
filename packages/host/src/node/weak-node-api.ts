import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

export const weakNodeApiPath = path.resolve(__dirname, "../../weak-node-api");

assert(
  fs.existsSync(weakNodeApiPath),
  `Expected Weak Node API path to exist: ${weakNodeApiPath}`
);
