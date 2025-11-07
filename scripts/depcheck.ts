import path from "node:path";
import assert from "node:assert/strict";
import cp from "node:child_process";
import fs from "node:fs";

import depcheck from "depcheck";

function getWorkspaces() {
  const workspaces = JSON.parse(
    cp.execFileSync("npm", ["query", ".workspace"], { encoding: "utf8" }),
  ) as unknown;
  assert(Array.isArray(workspaces));
  for (const workspace of workspaces) {
    assert(typeof workspace === "object" && workspace !== null);
  }
  return workspaces as Record<string, unknown>[];
}

const rootDir = path.resolve(import.meta.dirname, "..");
const root = await depcheck(rootDir, {});

const rootPackage = JSON.parse(
  await fs.promises.readFile(path.join(rootDir, "package.json"), {
    encoding: "utf8",
  }),
) as unknown;

assert(
  typeof rootPackage === "object" &&
    rootPackage !== null &&
    "devDependencies" in rootPackage &&
    typeof rootPackage.devDependencies === "object" &&
    rootPackage.devDependencies !== null,
);

const rootDevDependencies = new Set(Object.keys(rootPackage.devDependencies));
for (const packageName of [...rootDevDependencies.values()]) {
  rootDevDependencies.add(`@types/${packageName}`);
}

for (const {
  name: workspaceName,
  path: workspacePath,
  private: workspacePrivate,
} of getWorkspaces()) {
  assert(typeof workspaceName === "string");
  assert(typeof workspacePath === "string");
  assert(
    typeof workspacePrivate === "boolean" ||
      typeof workspacePrivate === "undefined",
  );
  if (workspacePrivate) {
    console.warn(`Skipping private package '${workspaceName}'`);
    continue;
  }
  const result = await depcheck(workspacePath, {
    ignoreMatches: [...rootDevDependencies],
  });
  for (const [name, filePaths] of Object.entries(result.missing)) {
    if (!rootDevDependencies.has(name)) {
      console.error(`Missing '${name}' in '${workspaceName}':`);
      for (const filePath of filePaths) {
        console.error("↳", path.relative(workspacePath, filePath));
      }
      console.error();
      process.exitCode = 1;
    }
  }
  for (const name of result.dependencies) {
    console.error(`Unused dependency '${name}' in '${workspaceName}'`);
    console.error();
    process.exitCode = 1;
  }
  for (const name of result.devDependencies) {
    console.error(`Unused dev-dependency '${name}' in '${workspaceName}'`);
    console.error();
    process.exitCode = 1;
  }
}

assert.deepEqual(root.dependencies, [], "Found unused dependencies");
