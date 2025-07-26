import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs";

import { Option } from "@commander-js/extra-typings";
import { oraPromise } from "ora";
import {
  AppleTriplet as Target,
  createAppleFramework,
  createXCframework,
  determineXCFrameworkFilename,
} from "react-native-node-api";

import type { Platform } from "./types.js";
import chalk from "chalk";

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
} satisfies Record<Target, XcodeSDKName>;

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
} satisfies Record<Target, CMakeSystemName>;

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
} satisfies Record<Target, AppleArchitecture>;

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

export const platform: Platform<Target[], AppleOpts> = {
  id: "apple",
  name: "Apple",
  targets: [
    "arm64;x86_64-apple-darwin",
    "arm64-apple-ios",
    "arm64-apple-ios-sim",
    "arm64-apple-tvos",
    "arm64-apple-tvos-sim",
    "arm64-apple-visionos",
    "arm64-apple-visionos-sim",
  ],
  defaultTargets() {
    return process.arch === "arm64" ? ["arm64-apple-ios-sim"] : [];
  },
  amendCommand(command) {
    return command.addOption(xcframeworkExtensionOption);
  },
  configureArgs({ target }) {
    return [
      "-G",
      "Xcode",
      "-D",
      `CMAKE_SYSTEM_NAME=${CMAKE_SYSTEM_NAMES[target]}`,
      "-D",
      `CMAKE_OSX_SYSROOT=${XCODE_SDK_NAMES[target]}`,
      "-D",
      `CMAKE_OSX_ARCHITECTURES=${APPLE_ARCHITECTURES[target]}`,
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
    { outputPath, targets },
    { configuration, autoLink, xcframeworkExtension },
  ) {
    const libraryPaths = await Promise.all(
      targets.map(async ({ outputPath }) => {
        const configSpecificPath = path.join(outputPath, configuration);
        assert(
          fs.existsSync(configSpecificPath),
          `Expected a directory at ${configSpecificPath}`,
        );
        // Expect binary file(s), either .node or .dylib
        const files = await fs.promises.readdir(configSpecificPath);
        const result = files.map(async (file) => {
          const filePath = path.join(configSpecificPath, file);
          if (filePath.endsWith(".dylib")) {
            return filePath;
          } else if (file.endsWith(".node")) {
            // Rename the file to .dylib for xcodebuild to accept it
            const newFilePath = filePath.replace(/\.node$/, ".dylib");
            await fs.promises.rename(filePath, newFilePath);
            return newFilePath;
          } else {
            throw new Error(
              `Expected a .node or .dylib file, but found ${file}`,
            );
          }
        });
        assert.equal(result.length, 1, "Expected exactly one library file");
        return await result[0];
      }),
    );
    const frameworkPaths = libraryPaths.map(createAppleFramework);
    const xcframeworkFilename = determineXCFrameworkFilename(
      frameworkPaths,
      xcframeworkExtension ? ".xcframework" : ".apple.node",
    );

    // Create the xcframework
    const xcframeworkOutputPath = path.resolve(outputPath, xcframeworkFilename);

    await oraPromise(
      createXCframework({
        outputPath: xcframeworkOutputPath,
        frameworkPaths,
        autoLink,
      }),
      {
        text: "Assembling XCFramework",
        successText: `XCFramework assembled into ${chalk.dim(
          path.relative(process.cwd(), xcframeworkOutputPath),
        )}`,
        failText: ({ message }) => `Failed to assemble XCFramework: ${message}`,
      },
    );
  },
};
