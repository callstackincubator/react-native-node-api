import fs from "node:fs";
import path from "node:path";
import cp from "node:child_process";

import { TESTS_DIR } from "./utils.mjs";

const NODE_REPO_URL = "https://github.com/nodejs/node.git";
const NODE_REPO_DIR = path.resolve(import.meta.dirname, "../node");

const ALLOW_LIST = [
  "js-native-api/common.h",
  "js-native-api/common-inl.h",
  "js-native-api/entry_point.h",
  "js-native-api/2_function_arguments",
  // "node-api/test_async",
  // "node-api/test_buffer",
];

console.log("Copying files to", TESTS_DIR);

// Clean up the destination directory before copying
// fs.rmSync(EXAMPLES_DIR, { recursive: true, force: true });

if (!fs.existsSync(NODE_REPO_DIR)) {
  console.log(
    "Sparse and shallow cloning Node.js repository to",
    NODE_REPO_DIR,
  );

  // Init a new git repository
  cp.execFileSync("git", ["init", NODE_REPO_DIR], {
    stdio: "inherit",
  });
  // Set the remote origin to the Node.js repository
  cp.execFileSync("git", ["remote", "add", "origin", NODE_REPO_URL], {
    stdio: "inherit",
    cwd: NODE_REPO_DIR,
  });
  // Enable sparse checkout
  cp.execFileSync(
    "git",
    ["sparse-checkout", "set", "test/js-native-api", "test/node-api"],
    {
      stdio: "inherit",
      cwd: NODE_REPO_DIR,
    },
  );
  // Pull the latest changes from the master branch
  console.log("Pulling latest changes from Node.js repository...");
  cp.execFileSync("git", ["pull", "--depth=1", "origin", "main"], {
    stdio: "inherit",
    cwd: NODE_REPO_DIR,
  });
}
const SRC_DIR = path.join(NODE_REPO_DIR, "test");
console.log("Copying files from", SRC_DIR);

for (const src of ALLOW_LIST) {
  const srcPath = path.join(SRC_DIR, src);
  const destPath = path.join(TESTS_DIR, src);

  if (fs.existsSync(destPath)) {
    console.warn(
      `Destination path ${destPath} already exists - skipping copy of ${src}.`,
    );
    continue;
  }

  console.log("Copying from", srcPath, "to", destPath);
  fs.cpSync(srcPath, destPath, { recursive: true });
}
