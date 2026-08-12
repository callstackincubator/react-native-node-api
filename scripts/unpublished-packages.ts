import assert from "node:assert/strict";
import cp from "node:child_process";
import fs from "node:fs";

console.log("Checking the registry for unpublished package versions");

function getWorkspaces() {
  // `pnpm ls -r --depth -1 --json` lists every workspace project (including the
  // private repo root, filtered out below) with `name`, `version` and `private`
  // fields — the pnpm equivalent of the removed `npm query .workspace`.
  const workspaces = JSON.parse(
    cp.execFileSync("pnpm", ["ls", "-r", "--depth", "-1", "--json"], {
      encoding: "utf8",
    }),
  ) as unknown;
  assert(Array.isArray(workspaces));
  for (const workspace of workspaces) {
    assert(typeof workspace === "object" && workspace !== null);
  }
  return workspaces as Record<string, unknown>[];
}

/**
 * Asks the registry the same question `changeset publish` asks before it
 * uploads anything: does this exact version already exist? Querying the
 * registry directly (instead of shelling out to `pnpm info`) keeps the npm CLI
 * — and its validation of this repo's `devEngines` — out of the picture.
 */
async function isPublished(name: string, version: string) {
  // Only the scope separator needs escaping: the registry serves scoped
  // packages from "/@scope%2fname", not from a nested path.
  const response = await fetch(
    `https://registry.npmjs.org/${name.replace("/", "%2f")}/${version}`,
  );
  if (response.status === 404) {
    // Either the version or the entire package is missing from the registry.
    return false;
  }
  assert(
    response.ok,
    `Unexpected response for ${name}@${version}: ${response.status} ${response.statusText}`,
  );
  return true;
}

const publishablePackages = getWorkspaces()
  .filter((w) => !w.private)
  .map(({ name, version }) => {
    assert(typeof name === "string");
    assert(typeof version === "string");
    return { name, version };
  });

const unpublishedPackages: typeof publishablePackages = [];
for (const { name, version } of publishablePackages) {
  const published = await isPublished(name, version);
  console.log(`${published ? "✓" : "✗"} ${name}@${version}`);
  if (!published) {
    unpublishedPackages.push({ name, version });
  }
}

const unpublished = unpublishedPackages.length > 0;
console.log(
  unpublished
    ? `${unpublishedPackages.length} of ${publishablePackages.length} package versions are missing from the registry`
    : "Every package version is already on the registry",
);

const { GITHUB_OUTPUT } = process.env;
if (GITHUB_OUTPUT) {
  await fs.promises.appendFile(GITHUB_OUTPUT, `unpublished=${unpublished}\n`);
}
