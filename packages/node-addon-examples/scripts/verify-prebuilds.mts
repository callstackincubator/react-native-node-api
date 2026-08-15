import fs from "node:fs";
import assert from "node:assert/strict";
import path from "node:path";

import plistPackage from "@expo/plist";
import { escapeBundleIdentifier } from "react-native-node-api";

import { DIRS } from "./cmake-projects.mjs";

// `@expo/plist` is CommonJS; under Node's ESM interop the default import lands
// one level deeper than TS's `esModuleInterop` cjs-compiled callers see it.
const plist = plistPackage.default;

const EXPECTED_ANDROID_ARCHS = ["armeabi-v7a", "arm64-v8a", "x86_64", "x86"];

const EXPECTED_XCFRAMEWORK_PLATFORMS = [
  "ios-arm64",
  "ios-arm64-simulator",
  "macos-arm64_x86_64",
  "tvos-arm64",
  "tvos-arm64-simulator",
  "xros-arm64",
  "xros-arm64-simulator",
];

async function verifyAndroidPrebuild(dirent: fs.Dirent) {
  console.log(
    "Verifying Android prebuild",
    dirent.name,
    "in",
    dirent.parentPath,
  );
  for (const arch of EXPECTED_ANDROID_ARCHS) {
    const archDir = path.join(dirent.parentPath, dirent.name, arch);
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

/**
 * Asserts an Info.plist matches what `writeFrameworkInfoPlist` (in
 * `packages/host/src/node/prebuilds/apple.ts`) writes for a framework named
 * `libraryName`, built without a custom `--apple-bundle-identifier`.
 */
async function verifyFrameworkInfoPlist(
  infoPlistPath: string,
  libraryName: string,
) {
  const contents = await fs.promises.readFile(infoPlistPath, "utf8");
  const infoPlist = plist.parse(contents) as Record<string, unknown>;
  assert.equal(
    infoPlist.CFBundleExecutable,
    libraryName,
    `Unexpected CFBundleExecutable in ${infoPlistPath}`,
  );
  assert.equal(
    infoPlist.CFBundleIdentifier,
    escapeBundleIdentifier(`com.callstackincubator.node-api.${libraryName}`),
    `Unexpected CFBundleIdentifier in ${infoPlistPath}`,
  );
}

async function verifyApplePrebuild(dirent: fs.Dirent) {
  console.log("Verifying Apple prebuild", dirent.name, "in", dirent.parentPath);
  for (const arch of EXPECTED_XCFRAMEWORK_PLATFORMS) {
    const archDir = path.join(dirent.parentPath, dirent.name, arch);
    for (const file of await fs.promises.readdir(archDir, {
      withFileTypes: true,
    })) {
      assert(
        file.isDirectory(),
        "Expected only directories in xcframework arch directory",
      );
      assert(file.name.endsWith(".framework"), "Expected framework directory");
      const frameworkDir = path.join(file.parentPath, file.name);
      const libraryName = path.basename(file.name, ".framework");
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
            await verifyFrameworkInfoPlist(
              path.join(frameworkDir, file.name),
              libraryName,
            );
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
