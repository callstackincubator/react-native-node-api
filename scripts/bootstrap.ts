import path from "node:path";
import assert from "node:assert/strict";
import cp from "node:child_process";
import fs from "node:fs";

// Bootstrap every workspace sequentially, failing fast on the first error.
//
// We deliberately don't use "npm run bootstrap --workspaces --if-present" here:
// npm keeps iterating the remaining workspaces even after one of them fails and
// only surfaces a non-zero exit code once they've all run. Because later
// workspaces depend on artifacts produced by earlier ones (e.g. the
// weak-node-api xcframework consumed by node-addon-examples, node-tests and
// ferric-example), a failure in an early workspace produces a cascade of
// confusing secondary errors, hiding the actual root cause. Iterating ourselves
// lets us stop at the first failing workspace.

const rootDir = path.resolve(import.meta.dirname, "..");

function readPackageJson(packageDir: string): Record<string, unknown> {
  const contents = fs.readFileSync(
    path.join(packageDir, "package.json"),
    "utf8",
  );
  const parsed = JSON.parse(contents) as unknown;
  assert(
    typeof parsed === "object" && parsed !== null,
    `Expected an object in ${packageDir}/package.json`,
  );
  return parsed as Record<string, unknown>;
}

const rootPackage = readPackageJson(rootDir);
assert(
  Array.isArray(rootPackage.workspaces),
  "Expected a 'workspaces' array in the root package.json",
);

for (const workspace of rootPackage.workspaces) {
  assert(typeof workspace === "string");
  // The workspaces are declared as concrete directories – reject globs rather
  // than silently skipping workspaces they were meant to expand to.
  assert(
    !workspace.includes("*"),
    `Glob workspace patterns are not supported ('${workspace}')`,
  );

  const workspaceDir = path.resolve(rootDir, workspace);
  const { name, scripts } = readPackageJson(workspaceDir);
  assert(typeof name === "string");

  const hasBootstrap =
    typeof scripts === "object" && scripts !== null && "bootstrap" in scripts;
  if (!hasBootstrap) {
    continue;
  }

  console.log(`Bootstrapping '${name}'`);
  const { status } = cp.spawnSync(
    "npm",
    ["run", "bootstrap", "--workspace", name],
    { stdio: "inherit" },
  );
  assert.equal(
    status,
    0,
    `Bootstrapping '${name}' failed (status = ${status})`,
  );
}
