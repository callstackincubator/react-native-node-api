import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { regenerateExample } from "./regenerate-example.ts";

const ROOT_PATH = path.join(import.meta.dirname, "..");
const EXAMPLE_PATH = path.join(ROOT_PATH, "packages", "ferric-example");

const manifest = fs.readFileSync(path.join(EXAMPLE_PATH, "Cargo.toml"), "utf8");
const nodeApiVersion = manifest.match(/^features = \["napi(\d+)"\]$/m)?.[1];
assert(nodeApiVersion, "Expected the example to enable a napiN feature");

await regenerateExample({
  examplePath: EXAMPLE_PATH,
  binPath: path.join(ROOT_PATH, "packages", "ferric", "bin", "ferric.js"),
  args: ["--node-api-version", nodeApiVersion],
  generatedPaths: [
    ".gitignore",
    "Cargo.toml",
    "build.rs",
    "package.json",
    "src/lib.rs",
  ],
});
