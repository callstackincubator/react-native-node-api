import fs from "node:fs";
import assert from "node:assert/strict";
import path from "node:path";

import { readAndParsePlist } from "react-native-node-api";
import { z } from "zod";

import { DIRS } from "./cmake-projects.mjs";

const FrameworkInfoPlistSchema = z.object({
  CFBundleExecutable: z.string(),
});

const KNOWN_ANDROID_ARCHS = ["armeabi-v7a", "arm64-v8a", "x86_64", "x86"];

async function readSubdirectories(dir: string) {
  const entries = await fs.promises.readdir(dir, { withFileTypes: true });
  const subdirectories = entries.filter((entry) => entry.isDirectory());
  assert(subdirectories.length > 0, `Expected at least one slice in ${dir}`);
  return subdirectories;
}

async function verifyAndroidPrebuild(dirent: fs.Dirent) {
  console.log(
    "Verifying Android prebuild",
    dirent.name,
    "in",
    dirent.parentPath,
  );
  const prebuildDir = path.join(dirent.parentPath, dirent.name);
  for (const arch of await readSubdirectories(prebuildDir)) {
    assert(
      KNOWN_ANDROID_ARCHS.includes(arch.name),
      `Unexpected Android arch: ${arch.name}`,
    );
    const archDir = path.join(prebuildDir, arch.name);
    for (const file of await fs.promises.readdir(archDir, {
      withFileTypes: true,
    })) {
      assert(file.isFile());
      assert(
        !file.name.endsWith(".node"),
        `Unexpected .node file: ${path.join(file.parentPath, file.name)}`,
      );
    }
  }
}

async function verifyFrameworkInfoPlist(frameworkDir: string) {
  const libraryName = path.basename(frameworkDir, ".framework");
  const infoPlistPath = path.join(frameworkDir, "Info.plist");
  const parsed = FrameworkInfoPlistSchema.parse(
    await readAndParsePlist(infoPlistPath),
  );
  assert.equal(
    parsed.CFBundleExecutable,
    libraryName,
    `Unexpected CFBundleExecutable in ${infoPlistPath}`,
  );
  assert(
    fs.existsSync(path.join(frameworkDir, libraryName)),
    `Missing executable ${libraryName} in ${frameworkDir}`,
  );
}

async function verifyApplePrebuild(dirent: fs.Dirent) {
  console.log("Verifying Apple prebuild", dirent.name, "in", dirent.parentPath);
  const prebuildDir = path.join(dirent.parentPath, dirent.name);
  for (const slice of await readSubdirectories(prebuildDir)) {
    const sliceDir = path.join(prebuildDir, slice.name);
    for (const file of await fs.promises.readdir(sliceDir, {
      withFileTypes: true,
    })) {
      assert(
        file.isDirectory(),
        "Expected only directories in xcframework arch directory",
      );
      if (file.name === "dSYMs") {
        continue;
      }
      assert(file.name.endsWith(".framework"), "Expected framework directory");
      const frameworkDir = path.join(file.parentPath, file.name);
      for (const file of await fs.promises.readdir(frameworkDir, {
        withFileTypes: true,
      })) {
        if (file.isDirectory()) {
          assert.equal(
            file.name,
            "Headers",
            "Unexpected directory in xcframework",
          );
        } else {
          assert(
            file.isFile(),
            "Expected only directory and files in framework",
          );
          if (file.name === "Info.plist") {
            await verifyFrameworkInfoPlist(frameworkDir);
          } else {
            assert(
              !file.name.endsWith(".node"),
              `Didn't expected a .node file in xcframework: ${path.join(
                frameworkDir,
                file.name,
              )}`,
            );
          }
        }
      }
    }
  }
}

let verified = 0;

for (const cwd of DIRS) {
  for await (const dirent of fs.promises.glob("**/*.*.node", {
    cwd,
    withFileTypes: true,
  })) {
    if (dirent.name.endsWith(".android.node")) {
      await verifyAndroidPrebuild(dirent);
    } else if (dirent.name.endsWith(".apple.node")) {
      await verifyApplePrebuild(dirent);
    } else {
      throw new Error(
        `Unexpected prebuild file: ${dirent.name} in ${dirent.parentPath}`,
      );
    }
    verified++;
  }
}

// Without this, the script passes by simply not finding any prebuilds, which is
// exactly what happens if they stop being emitted next to the sources they were
// built from.
assert(verified > 0, `Found no prebuilds in ${DIRS.join(", ")}`);
console.log(`Verified ${verified} prebuilds`);
