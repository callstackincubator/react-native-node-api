import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { applePrebuildPath } from "./weak-node-api.js";

async function restoreVersionedFrameworkSymlinks(frameworkPath: string) {
  const currentLinkPath = path.join(frameworkPath, "Versions", "Current");

  if (!fs.existsSync(currentLinkPath)) {
    await fs.promises.symlink("A", currentLinkPath);
  }

  const binaryLinkPath = path.join(frameworkPath, "weak-node-api");

  if (!fs.existsSync(binaryLinkPath)) {
    await fs.promises.symlink("Versions/Current/weak-node-api", binaryLinkPath);
  }

  const resourcesLinkPath = path.join(frameworkPath, "Resources");

  if (!fs.existsSync(resourcesLinkPath)) {
    await fs.promises.symlink("Versions/Current/Resources", resourcesLinkPath);
  }
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
