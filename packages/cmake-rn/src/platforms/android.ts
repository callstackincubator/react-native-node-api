import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { Option } from "@commander-js/extra-typings";
import {
  createAndroidLibsDirectory,
  determineAndroidLibsFilename,
  AndroidTriplet as Target,
} from "react-native-node-api";

import type { Platform } from "./types.js";
import { oraPromise } from "ora";
import chalk from "chalk";

// This should match https://github.com/react-native-community/template/blob/main/template/android/build.gradle#L7
const DEFAULT_NDK_VERSION = "27.1.12297006";
const DEFAULT_ANDROID_SDK_VERSION = "24";

type AndroidArchitecture = "armeabi-v7a" | "arm64-v8a" | "x86" | "x86_64";

export const ANDROID_ARCHITECTURES = {
  "armv7a-linux-androideabi": "armeabi-v7a",
  "aarch64-linux-android": "arm64-v8a",
  "i686-linux-android": "x86",
  "x86_64-linux-android": "x86_64",
} satisfies Record<Target, AndroidArchitecture>;

const ndkVersionOption = new Option(
  "--ndk-version <version>",
  "The NDK version to use for Android builds",
).default(DEFAULT_NDK_VERSION);

const androidSdkVersionOption = new Option(
  "--android-sdk-version <version>",
  "The Android SDK version to use for Android builds",
).default(DEFAULT_ANDROID_SDK_VERSION);

type AndroidOpts = { ndkVersion: string; androidSdkVersion: string };

export const platform: Platform<Target[], AndroidOpts> = {
  id: "android",
  name: "Android",
  targets: [
    "aarch64-linux-android",
    "armv7a-linux-androideabi",
    "i686-linux-android",
    "x86_64-linux-android",
  ],
  defaultTargets() {
    if (process.arch === "arm64") {
      return ["aarch64-linux-android"];
    } else if (process.arch === "x64") {
      return ["x86_64-linux-android"];
    } else {
      return [];
    }
  },
  amendCommand(command) {
    return command
      .addOption(ndkVersionOption)
      .addOption(androidSdkVersionOption);
  },
  configureArgs({ target }, { ndkVersion, androidSdkVersion }) {
    const { ANDROID_HOME } = process.env;
    assert(
      typeof ANDROID_HOME === "string",
      "Missing env variable ANDROID_HOME",
    );
    assert(
      fs.existsSync(ANDROID_HOME),
      `Expected the Android SDK at ${ANDROID_HOME}`,
    );
    const installNdkCommand = `sdkmanager --install "ndk;${ndkVersion}"`;
    const ndkPath = path.resolve(ANDROID_HOME, "ndk", ndkVersion);
    assert(
      fs.existsSync(ndkPath),
      `Missing Android NDK v${ndkVersion} (at ${ndkPath}) - run: ${installNdkCommand}`,
    );

    const toolchainPath = path.join(
      ndkPath,
      "build/cmake/android.toolchain.cmake",
    );
    const architecture = ANDROID_ARCHITECTURES[target];

    return [
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
      "-D",
      `ANDROID_PLATFORM=${androidSdkVersion}`,
      "-D",
      // TODO: Make this configurable
      "ANDROID_STL=c++_shared",
    ];
  },
  buildArgs() {
    return [];
  },
  isSupportedByHost() {
    const { ANDROID_HOME } = process.env;
    return typeof ANDROID_HOME === "string" && fs.existsSync(ANDROID_HOME);
  },
  async postBuild({ outputPath, targets }, { autoLink }) {
    // TODO: Include `configuration` in the output path
    const libraryPathByTriplet = Object.fromEntries(
      await Promise.all(
        targets.map(async ({ target, outputPath }) => {
          assert(
            fs.existsSync(outputPath),
            `Expected a directory at ${outputPath}`,
          );
          // Expect binary file(s), either .node or .so
          const dirents = await fs.promises.readdir(outputPath, {
            withFileTypes: true,
          });
          const result = dirents
            .filter(
              (dirent) =>
                dirent.isFile() &&
                (dirent.name.endsWith(".so") || dirent.name.endsWith(".node")),
            )
            .map((dirent) => path.join(dirent.parentPath, dirent.name));
          assert.equal(result.length, 1, "Expected exactly one library file");
          return [target, result[0]] as const;
        }),
      ),
    ) as Record<Target, string>;
    const androidLibsFilename = determineAndroidLibsFilename(
      Object.values(libraryPathByTriplet),
    );
    const androidLibsOutputPath = path.resolve(outputPath, androidLibsFilename);

    await oraPromise(
      createAndroidLibsDirectory({
        outputPath: androidLibsOutputPath,
        libraryPathByTriplet,
        autoLink,
      }),
      {
        text: "Assembling Android libs directory",
        successText: `Android libs directory assembled into ${chalk.dim(
          path.relative(process.cwd(), androidLibsOutputPath),
        )}`,
        failText: ({ message }) =>
          `Failed to assemble Android libs directory: ${message}`,
      },
    );
  },
};
