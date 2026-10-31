import assert from "node:assert/strict";
import cp from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { readPackage } from "read-pkg";

/**
 * Regenerate an example package by deleting everything an init command writes,
 * running it, and reapplying the mono-repo fields of the package.json.
 */
export async function regenerateExample({
  examplePath,
  binPath,
  args = [],
  generatedPaths,
}: {
  examplePath: string;
  /** The CLI providing the init command. */
  binPath: string;
  /** Extra arguments passed to the init command. */
  args?: string[];
  /** Paths relative to the example, which the init command writes. */
  generatedPaths: string[];
}) {
  const packageJsonPath = path.join(examplePath, "package.json");
  const {
    name,
    version,
    private: isPrivate,
    homepage,
    repository,
    scripts,
  } = await readPackage({ cwd: examplePath, normalize: false });
  assert(scripts?.bootstrap, "Expected the example to have a bootstrap script");

  for (const generatedPath of generatedPaths) {
    fs.rmSync(path.join(examplePath, generatedPath));
  }

  const { status } = cp.spawnSync(
    process.execPath,
    [binPath, "init", examplePath, ...args],
    { stdio: "inherit" },
  );
  assert.equal(status, 0, `Failed to execute '${binPath} init'`);

  const generated = await readPackage({ cwd: examplePath, normalize: false });
  const preserved = { name, version, private: isPrivate, homepage, repository };
  const generatedFields = Object.fromEntries(
    Object.entries(generated).filter(([key]) => !(key in preserved)),
  );

  fs.writeFileSync(
    packageJsonPath,
    JSON.stringify(
      {
        ...preserved,
        ...generatedFields,
        scripts: { ...generated.scripts, bootstrap: scripts.bootstrap },
      },
      null,
      2,
    ) + "\n",
  );
}
