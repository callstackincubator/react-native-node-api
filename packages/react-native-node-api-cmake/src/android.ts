import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { AndroidTriplet } from "./triplets.js";

export const DEFAULT_ANDROID_TRIPLETS = [
  "aarch64-linux-android",
  "armv7a-linux-androideabi",
  "i686-linux-android",
  "x86_64-linux-android",
] as const satisfies AndroidTriplet[];

type AndroidArchitecture = "armeabi-v7a" | "arm64-v8a" | "x86" | "x86_64";

export const ANDROID_ARCHITECTURES = {
  "armv7a-linux-androideabi": "armeabi-v7a",
  "aarch64-linux-android": "arm64-v8a",
  "i686-linux-android": "x86",
  "x86_64-linux-android": "x86_64",
} satisfies Record<AndroidTriplet, AndroidArchitecture>;

type AndroidConfigureOptions = {
  triplet: AndroidTriplet;
  ndkVersion: string;
};

export function getAndroidConfigureCmakeArgs({
  triplet,
  ndkVersion,
}: AndroidConfigureOptions) {
  const { ANDROID_HOME } = process.env;
  assert(typeof ANDROID_HOME === "string", "Missing env variable ANDROID_HOME");
  assert(
    fs.existsSync(ANDROID_HOME),
    `Expected the Android SDK at ${ANDROID_HOME}`
  );
  const installNdkCommand = `sdkmanager --install "ndk;${ndkVersion}"`;
  const ndkPath = path.resolve(ANDROID_HOME, "ndk", ndkVersion);
  assert(
    fs.existsSync(ndkPath),
    `Missing Android NDK v${ndkVersion} (at ${ndkPath}) - run: ${installNdkCommand}`
  );

  const toolchainPath = path.join(
    ndkPath,
    "build/cmake/android.toolchain.cmake"
  );
  const architecture = ANDROID_ARCHITECTURES[triplet];

  const linkerFlags: string[] = [
    // `--no-version-undefined`,
    // `--whole-archive`,
    // `--no-whole-archive`,
  ];

  return [
    // Use the XCode as generator for Apple platforms
    "-G",
    "Ninja",
    "--toolchain",
    toolchainPath,
    "-D",
    "CMAKE_SYSTEM_NAME=Android",
    // "-D",
    // `CPACK_SYSTEM_NAME=Android-${architecture}`,
    // "-D",
    // `CMAKE_INSTALL_PREFIX=${installPath}`,
    // "-D",
    // `CMAKE_BUILD_TYPE=${configuration}`,
    "-D",
    "CMAKE_MAKE_PROGRAM=ninja",
    // "-D",
    // "CMAKE_C_COMPILER_LAUNCHER=ccache",
    // "-D",
    // "CMAKE_CXX_COMPILER_LAUNCHER=ccache",
    "-D",
    `ANDROID_NDK=${ndkPath}`,
    "-D",
    `ANDROID_ABI=${architecture}`,
    "-D",
    "ANDROID_TOOLCHAIN=clang",
    // "-D",
    // `ANDROID_NATIVE_API_LEVEL=${ANDROID_API_LEVEL}`,
    "-D",
    "ANDROID_STL=c++_shared",
    // Pass linker flags to avoid errors from undefined symbols
    // TODO: Link against a weak-node-api to avoid this (or whatever other lib which will be providing the symbols)
    // "-D",
    // `CMAKE_SHARED_LINKER_FLAGS="-Wl,--allow-shlib-undefined"`,
    "-D",
    `CMAKE_SHARED_LINKER_FLAGS=${linkerFlags
      .map((flag) => `-Wl,${flag}`)
      .join(" ")}`,
  ];
}

/**
 * Determine the filename of the Android libs directory based on the framework paths.
 * Ensuring that all framework paths have the same base name.
 */
export function determineAndroidLibsFilename(frameworkPaths: string[]) {
  const frameworkNames = frameworkPaths.map((p) =>
    path.basename(p, path.extname(p))
  );
  const candidates = new Set<string>(frameworkNames);
  assert(
    candidates.size === 1,
    "Expected all frameworks to have the same name"
  );
  const [name] = candidates;
  return `${name}.android.node`;
}

type AndroidLibsDirectoryOptions = {
  outputPath: string;
  libraryPathByTriplet: Record<AndroidTriplet, string>;
  autoLink: boolean;
};

export async function createAndroidLibsDirectory({
  outputPath,
  libraryPathByTriplet,
  autoLink,
}: AndroidLibsDirectoryOptions) {
  // Delete and recreate any existing output directory
  await fs.promises.rm(outputPath, { recursive: true, force: true });
  await fs.promises.mkdir(outputPath, { recursive: true });
  for (const [triplet] of Object.entries(libraryPathByTriplet)) {
    const libraryPath = libraryPathByTriplet[triplet as AndroidTriplet];
    assert(
      fs.existsSync(libraryPath),
      `Library not found: ${libraryPath} for triplet ${triplet}`
    );
    const arch = ANDROID_ARCHITECTURES[triplet as AndroidTriplet];
    const archOutputPath = path.join(outputPath, arch);
    await fs.promises.mkdir(archOutputPath, { recursive: true });
    const libraryName = path.basename(libraryPath, path.extname(libraryPath));
    const libraryOutputPath = path.join(archOutputPath, libraryName);
    await fs.promises.copyFile(libraryPath, libraryOutputPath);
  }
  if (autoLink) {
    // Write a file to mark the Android libs directory is a Node-API module
    await fs.promises.writeFile(
      path.join(outputPath, "react-native-node-api-module"),
      "",
      "utf8"
    );
  }
}
