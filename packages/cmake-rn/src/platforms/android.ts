import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  Option,
  oraPromise,
  prettyPath,
} from "@react-native-node-api/cli-utils";
import {
  createAndroidLibsDirectory,
  AndroidTriplet as Triplet,
} from "react-native-node-api";
import * as cmakeFileApi from "cmake-file-api";

import type { BaseOpts, Platform } from "./types.js";
import { toDefineArguments } from "../helpers.js";
import {
  getCmakeJSVariables,
  getWeakNodeApiVariables,
} from "../weak-node-api.js";

// This should match https://github.com/react-native-community/template/blob/main/template/android/build.gradle#L7
const DEFAULT_NDK_VERSION = "27.1.12297006";
const DEFAULT_ANDROID_SDK_VERSION = "24";

type AndroidArchitecture = "armeabi-v7a" | "arm64-v8a" | "x86" | "x86_64";

export const ANDROID_ARCHITECTURES = {
  "armv7a-linux-androideabi": "armeabi-v7a",
  "aarch64-linux-android": "arm64-v8a",
  "i686-linux-android": "x86",
  "x86_64-linux-android": "x86_64",
} satisfies Record<Triplet, AndroidArchitecture>;

const ndkVersionOption = new Option(
  "--ndk-version <version>",
  "The NDK version to use for Android builds",
).default(DEFAULT_NDK_VERSION);

const androidSdkVersionOption = new Option(
  "--android-sdk-version <version>",
  "The Android SDK version to use for Android builds",
).default(DEFAULT_ANDROID_SDK_VERSION);

type AndroidOpts = { ndkVersion: string; androidSdkVersion: string };

function getBuildPath(
  baseBuildPath: string,
  triplet: Triplet,
  configuration: BaseOpts["configuration"],
) {
  return path.join(baseBuildPath, triplet + "-" + configuration);
}

function getNdkPath(ndkVersion: string) {
  const { ANDROID_HOME } = process.env;
  assert(typeof ANDROID_HOME === "string", "Missing env variable ANDROID_HOME");
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
  return ndkPath;
}

function getNdkToolchainPath(ndkPath: string) {
  const toolchainPath = path.join(
    ndkPath,
    "build/cmake/android.toolchain.cmake",
  );
  assert(
    fs.existsSync(toolchainPath),
    `No CMake toolchain found in ${toolchainPath}`,
  );
  return toolchainPath;
}

function getNdkLlvmBinPath(ndkPath: string) {
  const prebuiltPath = path.join(ndkPath, "toolchains/llvm/prebuilt");
  const platforms = fs.readdirSync(prebuiltPath);
  assert(
    platforms.length === 1,
    `Expected a single llvm prebuilt toolchain in ${prebuiltPath}`,
  );
  return path.join(prebuiltPath, platforms[0], "bin");
}

export const platform: Platform<Triplet[], AndroidOpts> = {
  id: "android",
  name: "Android",
  triplets: [
    "aarch64-linux-android",
    "armv7a-linux-androideabi",
    "i686-linux-android",
    "x86_64-linux-android",
  ],
  defaultTriplets() {
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
  async configure(
    triplets,
    {
      configuration,
      ndkVersion,
      androidSdkVersion,
      source,
      define,
      build,
      weakNodeApiLinkage,
      cmakeJs,
    },
  ) {
    const ndkPath = getNdkPath(ndkVersion);
    const toolchainPath = getNdkToolchainPath(ndkPath);

    const commonDefinitions = [
      ...define,
      {
        CMAKE_BUILD_TYPE: configuration,
        CMAKE_SYSTEM_NAME: "Android",
        // "CMAKE_INSTALL_PREFIX": installPath,
        CMAKE_MAKE_PROGRAM: "ninja",
        // "-D",
        // "CMAKE_C_COMPILER_LAUNCHER=ccache",
        // "-D",
        // "CMAKE_CXX_COMPILER_LAUNCHER=ccache",
        ANDROID_NDK: ndkPath,
        ANDROID_TOOLCHAIN: "clang",
        ANDROID_PLATFORM: androidSdkVersion,
        // TODO: Make this configurable
        ANDROID_STL: "c++_shared",
      },
    ];

    await Promise.all(
      triplets.map(async ({ triplet, spawn }) => {
        const buildPath = getBuildPath(build, triplet, configuration);
        const outputPath = path.join(buildPath, "out");
        // We want to use the CMake File API to query information later
        await cmakeFileApi.createSharedStatelessQuery(
          buildPath,
          "codemodel",
          "2",
        );

        await spawn("cmake", [
          "-S",
          source,
          "-B",
          buildPath,
          // Ideally, we would use the "Ninja Multi-Config" generator here,
          // but it doesn't support the "RelWithDebInfo" configuration on Android.
          "-G",
          "Ninja",
          "--toolchain",
          toolchainPath,
          ...toDefineArguments([
            ...(weakNodeApiLinkage ? [getWeakNodeApiVariables(triplet)] : []),
            ...(cmakeJs ? [getCmakeJSVariables(triplet)] : []),
            ...commonDefinitions,
            {
              // "CPACK_SYSTEM_NAME": `Android-${architecture}`,
              CMAKE_LIBRARY_OUTPUT_DIRECTORY: outputPath,
              ANDROID_ABI: ANDROID_ARCHITECTURES[triplet],
            },
          ]),
        ]);
      }),
    );
  },
  async build({ triplet, spawn }, { target, build, configuration }) {
    const buildPath = getBuildPath(build, triplet, configuration);
    await spawn("cmake", [
      "--build",
      buildPath,
      ...(target.length > 0 ? ["--target", ...target] : []),
    ]);
  },
  isSupportedByHost() {
    const { ANDROID_HOME } = process.env;
    return typeof ANDROID_HOME === "string" && fs.existsSync(ANDROID_HOME);
  },
  async postBuild(
    outputPath,
    triplets,
    { autoLink, configuration, target, build, strip, ndkVersion },
  ) {
    const prebuilds: Record<
      string,
      { triplet: Triplet; libraryPath: string }[]
    > = {};

    for (const { triplet, spawn } of triplets) {
      const buildPath = getBuildPath(build, triplet, configuration);
      assert(fs.existsSync(buildPath), `Expected a directory at ${buildPath}`);
      const targets = await cmakeFileApi.readCurrentTargetsDeep(
        buildPath,
        configuration,
        "2.0",
      );
      const sharedLibraries = targets.filter(
        ({ type, name }) =>
          type === "SHARED_LIBRARY" &&
          (target.length === 0 || target.includes(name)),
      );
      assert.equal(
        sharedLibraries.length,
        1,
        "Expected exactly one shared library",
      );
      const [sharedLibrary] = sharedLibraries;
      const { artifacts } = sharedLibrary;
      assert(
        artifacts && artifacts.length === 1,
        "Expected exactly one artifact",
      );
      const [artifact] = artifacts;
      // Add prebuild entry, creating a new entry if needed
      if (!(sharedLibrary.name in prebuilds)) {
        prebuilds[sharedLibrary.name] = [];
      }
      const libraryPath = path.join(buildPath, artifact.path);
      assert(
        fs.existsSync(libraryPath),
        `Expected built library at ${libraryPath}`,
      );

      if (strip) {
        const llvmBinPath = getNdkLlvmBinPath(getNdkPath(ndkVersion));
        const stripToolPath = path.join(llvmBinPath, `llvm-strip`);
        assert(
          fs.existsSync(stripToolPath),
          `Expected llvm-strip to exist at ${stripToolPath}`,
        );
        await spawn(stripToolPath, [libraryPath]);
      }
      prebuilds[sharedLibrary.name].push({
        triplet,
        libraryPath,
      });
    }

    for (const [libraryName, libraries] of Object.entries(prebuilds)) {
      const prebuildOutputPath = path.resolve(
        outputPath,
        `${libraryName}.android.node`,
      );
      await oraPromise(
        createAndroidLibsDirectory({
          outputPath: prebuildOutputPath,
          libraries,
          autoLink,
        }),
        {
          text: `Assembling Android libs directory (${libraryName})`,
          successText: `Android libs directory (${libraryName}) assembled into ${prettyPath(prebuildOutputPath)}`,
          failText: ({ message }) =>
            `Failed to assemble Android libs directory (${libraryName}): ${message}`,
        },
      );
    }
  },
};
