import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";

import { type SupportedTriplet } from "./triplets.js";

/**
 * https://developer.android.com/ndk/guides/other_build_systems
 */
export const ANDROID_TRIPLETS = [
  "aarch64-linux-android",
  "armv7a-linux-androideabi",
  "i686-linux-android",
  "x86_64-linux-android",
] as const;

export type AndroidTriplet = (typeof ANDROID_TRIPLETS)[number];

export const DEFAULT_ANDROID_TRIPLETS = [
  "aarch64-linux-android",
  "armv7a-linux-androideabi",
  "i686-linux-android",
  "x86_64-linux-android",
] as const satisfies AndroidTriplet[];

export function isAndroidTriplet(
  triplet: SupportedTriplet
): triplet is AndroidTriplet {
  return ANDROID_TRIPLETS.includes(triplet as AndroidTriplet);
}

type AndroidArchitecture = "armeabi-v7a" | "arm64-v8a" | "x86" | "x86_64";

export const ARCHITECTURES = {
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
  const architecture = ARCHITECTURES[triplet];
  return [
    // Use the XCode as generator for Apple platforms
    "-G",
    "Ninja",
    "--toolchain",
    toolchainPath,
    "-D",
    "CMAKE_SYSTEM_NAME=Android",
    "-D",
    `CPACK_SYSTEM_NAME=Android-${architecture}`,
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
    // TODO: Link against a fake libhermes to avoid this (or whatever other lib which will be providing the symbols)
    "-D",
    `CMAKE_SHARED_LINKER_FLAGS="-Wl,--allow-shlib-undefined"`,
  ];
}
