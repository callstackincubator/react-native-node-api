import fs from "node:fs";
import assert from "node:assert/strict";
import path from "node:path";

import plistModule from "@expo/plist";
import { escapeBundleIdentifier } from "react-native-node-api";
import { z } from "zod";

import { EXAMPLES_DIR } from "./cmake-projects.mjs";

// @expo/plist is CJS with an `export default`; under this genuine ESM
// (.mts) module's interop, the default import binds to the whole
// `module.exports`, nesting the real API one `.default` deeper.
const plist = plistModule.default;

const FrameworkInfoPlistSchema = z.object({
  CFBundleExecutable: z.string(),
  CFBundleIdentifier: z.string(),
});

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

async function verifyFrameworkInfoPlist(
  infoPlistPath: string,
  libraryName: string,
) {
  const contents = await fs.promises.readFile(infoPlistPath, "utf8");
  const parsed = FrameworkInfoPlistSchema.parse(plist.parse(contents));
  assert.equal(
    parsed.CFBundleExecutable,
    libraryName,
    `Unexpected CFBundleExecutable in ${infoPlistPath}`,
  );
  assert.equal(
    parsed.CFBundleIdentifier,
    // Mirrors the default writeFrameworkInfoPlist derives in
    // packages/host/src/node/prebuilds/apple.ts, since none of the
    // examples pass --apple-bundle-identifier.
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
            const libraryName = path.basename(frameworkDir, ".framework");
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

for await (const dirent of fs.promises.glob("**/*.*.node", {
  cwd: EXAMPLES_DIR,
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
}
