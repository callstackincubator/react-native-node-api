import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

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
  const xcframeworkPath = path.join(
    import.meta.dirname,
    "..",
    "build",
    "Release",
    "weak-node-api.xcframework",
  );

  assert(
    fs.existsSync(xcframeworkPath),
    `Expected an Xcframework at ${xcframeworkPath}`,
  );

  const macosFrameworkPath = path.join(
    xcframeworkPath,
    "macos-arm64_x86_64",
    "weak-node-api.framework",
  );

  if (fs.existsSync(macosFrameworkPath)) {
    await restoreVersionedFrameworkSymlinks(macosFrameworkPath);
  }
}
