import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { applePrebuildPath } from "./weak-node-api.js";

async function restoreSymlink(target: string, path: string) {
  if (!fs.existsSync(path)) {
    await fs.promises.symlink(target, path);
  }
}

async function guessCurrentFrameworkVersion(frameworkPath: string) {
  const versionsPath = path.join(frameworkPath, "Versions");
  assert(fs.existsSync(versionsPath));

  const versionDirectoryEntries = await fs.promises.readdir(versionsPath, {
    withFileTypes: true,
  });
  const versions = versionDirectoryEntries
    .filter((dirent) => dirent.isDirectory())
    .map((dirent) => dirent.name);
  assert.equal(
    versions.length,
    1,
    `Expected exactly one directory in ${versionsPath}, found ${JSON.stringify(versions)}`,
  );
  const [version] = versions;
  return version;
}

async function restoreVersionedFrameworkSymlinks(frameworkPath: string) {
  const currentVersionName = await guessCurrentFrameworkVersion(frameworkPath);
  await restoreSymlink(
    currentVersionName,
    path.join(frameworkPath, "Versions", "Current"),
  );
  await restoreSymlink(
    "Versions/Current/weak-node-api",
    path.join(frameworkPath, "weak-node-api"),
  );
  await restoreSymlink(
    "Versions/Current/Resources",
    path.join(frameworkPath, "Resources"),
  );
}

if (process.platform === "darwin") {
  assert(
    fs.existsSync(applePrebuildPath),
    `Expected an Xcframework at ${applePrebuildPath}`,
  );

  const macosFrameworkPath = path.join(
    applePrebuildPath,
    "macos-arm64_x86_64",
    "weak-node-api.framework",
  );

  if (fs.existsSync(macosFrameworkPath)) {
    await restoreVersionedFrameworkSymlinks(macosFrameworkPath);
  }
}
