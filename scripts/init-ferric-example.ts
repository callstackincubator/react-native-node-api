import assert from "node:assert/strict";
import cp from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { readPackage } from "read-pkg";

const ROOT_PATH = path.join(import.meta.dirname, "..");
const EXAMPLE_PATH = path.join(ROOT_PATH, "packages", "ferric-example");
const FERRIC_PATH = path.join(
  ROOT_PATH,
  "packages",
  "ferric",
  "bin",
  "ferric.js",
);

const GENERATED_PATHS = [
  ".gitignore",
  "Cargo.toml",
  "build.rs",
  "package.json",
  "src/lib.rs",
];

const packageJsonPath = path.join(EXAMPLE_PATH, "package.json");
const {
  name,
  version,
  private: isPrivate,
  homepage,
  repository,
  scripts,
} = await readPackage({ cwd: EXAMPLE_PATH, normalize: false });
assert(scripts?.bootstrap, "Expected the example to have a bootstrap script");

const manifest = fs.readFileSync(path.join(EXAMPLE_PATH, "Cargo.toml"), "utf8");
const nodeApiVersion = manifest.match(/^features = \["napi(\d+)"\]$/m)?.[1];
assert(nodeApiVersion, "Expected the example to enable a napiN feature");

for (const generatedPath of GENERATED_PATHS) {
  fs.rmSync(path.join(EXAMPLE_PATH, generatedPath));
}

const { status } = cp.spawnSync(
  process.execPath,
  [FERRIC_PATH, "init", EXAMPLE_PATH, "--node-api-version", nodeApiVersion],
  { stdio: "inherit" },
);
assert.equal(status, 0, "Failed to execute 'ferric init'");

const generated = await readPackage({ cwd: EXAMPLE_PATH, normalize: false });
const preserved = { name, version, private: isPrivate, homepage, repository };

fs.writeFileSync(
  packageJsonPath,
  JSON.stringify(
    {
      ...preserved,
      ...generated,
      ...preserved,
      scripts: { ...generated.scripts, bootstrap: scripts.bootstrap },
    },
    null,
    2,
  ) + "\n",
);
