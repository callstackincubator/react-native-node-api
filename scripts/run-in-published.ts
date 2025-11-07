import assert from "node:assert/strict";
import cp from "node:child_process";

console.log("Run command in all non-private packages of the monorepo");

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

const publishedPackagePaths = getWorkspaces()
  .filter((w) => !w.private)
  .map((p) => {
    assert(typeof p.path === "string");
    return p.path;
  });

const [, , command, ...argv] = process.argv;

for (const packagePath of publishedPackagePaths) {
  const { status } = cp.spawnSync(command, argv, {
    cwd: packagePath,
    stdio: "inherit",
  });
  assert.equal(status, 0, `Command failed (status = ${status})`);
}
