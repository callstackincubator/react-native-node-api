import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs";

import { Option, oraPromise, chalk } from "@react-native-node-api/cli-utils";
import {
  AppleTriplet as Triplet,
  createAppleFramework,
  createXCframework,
} from "react-native-node-api";

import type { Platform } from "./types.js";
import * as cmakeFileApi from "cmake-file-api";

type XcodeSDKName =
  | "iphoneos"
  | "iphonesimulator"
  | "catalyst"
  | "xros"
  | "xrsimulator"
  | "appletvos"
  | "appletvsimulator"
  | "macosx";

const XCODE_SDK_NAMES = {
  "x86_64-apple-darwin": "macosx",
  "arm64-apple-darwin": "macosx",
  "arm64;x86_64-apple-darwin": "macosx",
  "arm64-apple-ios": "iphoneos",
  "arm64-apple-ios-sim": "iphonesimulator",
  "arm64-apple-tvos": "appletvos",
  // "x86_64-apple-tvos": "appletvos",
  "arm64-apple-tvos-sim": "appletvsimulator",
  "arm64-apple-visionos": "xros",
  "arm64-apple-visionos-sim": "xrsimulator",
} satisfies Record<Triplet, XcodeSDKName>;

type CMakeSystemName = "Darwin" | "iOS" | "tvOS" | "watchOS" | "visionOS";

const CMAKE_SYSTEM_NAMES = {
  "x86_64-apple-darwin": "Darwin",
  "arm64-apple-darwin": "Darwin",
  "arm64;x86_64-apple-darwin": "Darwin",
  "arm64-apple-ios": "iOS",
  "arm64-apple-ios-sim": "iOS",
  "arm64-apple-tvos": "tvOS",
  // "x86_64-apple-tvos": "appletvos",
  "arm64-apple-tvos-sim": "tvOS",
  "arm64-apple-visionos": "visionOS",
  "arm64-apple-visionos-sim": "visionOS",
} satisfies Record<Triplet, CMakeSystemName>;

type AppleArchitecture = "arm64" | "x86_64" | "arm64;x86_64";

export const APPLE_ARCHITECTURES = {
  "x86_64-apple-darwin": "x86_64",
  "arm64-apple-darwin": "arm64",
  "arm64;x86_64-apple-darwin": "arm64;x86_64",
  "arm64-apple-ios": "arm64",
  "arm64-apple-ios-sim": "arm64",
  "arm64-apple-tvos": "arm64",
  // "x86_64-apple-tvos": "x86_64",
  "arm64-apple-tvos-sim": "arm64",
  "arm64-apple-visionos": "arm64",
  "arm64-apple-visionos-sim": "arm64",
} satisfies Record<Triplet, AppleArchitecture>;

export function createPlistContent(values: Record<string, string>) {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
    '<plist version="1.0">',
    "<dict>",
    ...Object.entries(values).flatMap(([key, value]) => [
      `<key>${key}</key>`,
      `<string>${value}</string>`,
    ]),
    "</dict>",
    "</plist>",
  ].join("\n");
}

export function getAppleBuildArgs() {
  // We expect the final application to sign these binaries
  return ["CODE_SIGNING_ALLOWED=NO"];
}

const xcframeworkExtensionOption = new Option(
  "--xcframework-extension",
  "Don't rename the xcframework to .apple.node",
).default(false);

type AppleOpts = {
  xcframeworkExtension: boolean;
};

export const platform: Platform<Triplet[], AppleOpts> = {
  id: "apple",
  name: "Apple",
  triplets: [
    "arm64;x86_64-apple-darwin",
    "arm64-apple-ios",
    "arm64-apple-ios-sim",
    "arm64-apple-tvos",
    "arm64-apple-tvos-sim",
    "arm64-apple-visionos",
    "arm64-apple-visionos-sim",
  ],
  defaultTriplets() {
    return process.arch === "arm64" ? ["arm64-apple-ios-sim"] : [];
  },
  amendCommand(command) {
    return command.addOption(xcframeworkExtensionOption);
  },
  configureArgs({ triplet }) {
    return [
      "-G",
      "Xcode",
      "-D",
      `CMAKE_SYSTEM_NAME=${CMAKE_SYSTEM_NAMES[triplet]}`,
      "-D",
      `CMAKE_OSX_SYSROOT=${XCODE_SDK_NAMES[triplet]}`,
      "-D",
      `CMAKE_OSX_ARCHITECTURES=${APPLE_ARCHITECTURES[triplet]}`,
    ];
  },
  buildArgs() {
    // We expect the final application to sign these binaries
    return ["CODE_SIGNING_ALLOWED=NO"];
  },
  isSupportedByHost: function (): boolean | Promise<boolean> {
    return process.platform === "darwin";
  },
  async postBuild(
    { outputPath, triplets },
    { configuration, autoLink, xcframeworkExtension },
  ) {
    const prebuilds: Record<string, string[]> = {};
    for (const { buildPath } of triplets) {
      assert(fs.existsSync(buildPath), `Expected a directory at ${buildPath}`);
      const targets = await cmakeFileApi.readCurrentTargetsDeep(
        buildPath,
        configuration,
        "2.0",
      );
      const sharedLibraries = targets.filter(
        (target) => target.type === "SHARED_LIBRARY",
      );
      assert.equal(
        sharedLibraries.length,
        1,
        "Expected exactly one shared library",
      );
      const [sharedLibrary] = sharedLibraries;
      const { artifacts } = sharedLibrary;
      assert(artifacts && artifacts.length, "Expected exactly one artifact");
      const [artifact] = artifacts;
      // Add prebuild entry, creating a new entry if needed
      if (!(sharedLibrary.name in prebuilds)) {
        prebuilds[sharedLibrary.name] = [];
      }
      prebuilds[sharedLibrary.name].push(path.join(buildPath, artifact.path));
    }

    const extension = xcframeworkExtension ? ".xcframework" : ".apple.node";

    for (const [libraryName, libraryPaths] of Object.entries(prebuilds)) {
      const frameworkPaths = await Promise.all(
        libraryPaths.map(createAppleFramework),
      );
      // Create the xcframework
      const xcframeworkOutputPath = path.resolve(
        outputPath,
        `${libraryName}${extension}`,
      );

      await oraPromise(
        createXCframework({
          outputPath: xcframeworkOutputPath,
          frameworkPaths,
          autoLink,
        }),
        {
          text: `Assembling XCFramework (${libraryName})`,
          successText: `XCFramework (${libraryName}) assembled into ${chalk.dim(
            path.relative(process.cwd(), xcframeworkOutputPath),
          )}`,
          failText: ({ message }) =>
            `Failed to assemble XCFramework (${libraryName}): ${message}`,
        },
      );
    }
  },
};
