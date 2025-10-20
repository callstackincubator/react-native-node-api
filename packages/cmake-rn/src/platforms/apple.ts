import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs";
import cp from "node:child_process";

import {
  Option,
  oraPromise,
  prettyPath,
} from "@react-native-node-api/cli-utils";
import {
  AppleTriplet as Triplet,
  createAppleFramework,
  createXCframework,
} from "react-native-node-api";

import type { Platform } from "./types.js";
import * as cmakeFileApi from "cmake-file-api";
import { toDefineArguments } from "../helpers.js";
import {
  getCmakeJSVariables,
  getWeakNodeApiVariables,
} from "../weak-node-api.js";

import * as z from "zod";

const XcodeListOutput = z.object({
  project: z.object({
    configurations: z.array(z.string()),
    name: z.string(),
    schemes: z.array(z.string()),
    targets: z.array(z.string()),
  }),
});

function listXcodeProject(cwd: string): z.infer<typeof XcodeListOutput> {
  const result = cp.spawnSync("xcodebuild", ["-list", "-json"], {
    encoding: "utf-8",
    cwd,
  });
  assert.equal(
    result.status,
    0,
    `Failed to run xcodebuild -list: ${result.stderr}`,
  );
  const parsed = JSON.parse(result.stdout) as unknown;
  return XcodeListOutput.parse(parsed);
}

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

const DESTINATION_BY_TRIPLET = {
  "arm64-apple-ios": "generic/platform=iOS",
  "arm64-apple-ios-sim": "generic/platform=iOS Simulator",
  "arm64-apple-tvos": "generic/platform=tvOS",
  // "x86_64-apple-tvos": "generic/platform=tvOS",
  "arm64-apple-tvos-sim": "generic/platform=tvOS Simulator",
  "arm64-apple-visionos": "generic/platform=visionOS",
  "arm64-apple-visionos-sim": "generic/platform=visionOS Simulator",
  // TODO: Verify that the three following destinations are correct and actually work
  "x86_64-apple-darwin": "generic/platform=macOS,arch=x86_64",
  "arm64-apple-darwin": "generic/platform=macOS,arch=arm64",
  "arm64;x86_64-apple-darwin": "generic/platform=macOS",
} satisfies Record<Triplet, string>;

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

function getBuildPath(baseBuildPath: string, triplet: Triplet) {
  return path.join(baseBuildPath, triplet.replace(/;/g, "_"));
}

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
  async configure(
    triplets,
    { source, build, define, weakNodeApiLinkage, cmakeJs },
    spawn,
  ) {
    // Ideally, we would generate a single Xcode project supporting all architectures / platforms
    // However, CMake's Xcode generator does not support that well, so we generate one project per triplet
    // Specifically, the linking of weak-node-api breaks, since the sdk / arch specific framework
    // from the xcframework is picked at configure time, not at build time.
    // See https://gitlab.kitware.com/cmake/cmake/-/issues/21752#note_1717047 for more information.
    await Promise.all(
      triplets.map(async ({ triplet }) => {
        const buildPath = getBuildPath(build, triplet);
        // We want to use the CMake File API to query information later
        // TODO: Or do we?
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
          "-G",
          "Xcode",
          ...toDefineArguments([
            ...define,
            ...(weakNodeApiLinkage ? [getWeakNodeApiVariables("apple")] : []),
            ...(cmakeJs ? [getCmakeJSVariables("apple")] : []),
            {
              CMAKE_SYSTEM_NAME: CMAKE_SYSTEM_NAMES[triplet],
              CMAKE_OSX_SYSROOT: XCODE_SDK_NAMES[triplet],
              CMAKE_OSX_ARCHITECTURES: APPLE_ARCHITECTURES[triplet],
            },
            {
              // Setting the output directories works around an issue with Xcode generator
              // where an unexpanded variable would emitted in the artifact paths.
              // This is okay, since we're generating per triplet build directories anyway.
              // https://gitlab.kitware.com/cmake/cmake/-/issues/24161
              CMAKE_LIBRARY_OUTPUT_DIRECTORY: path.join(buildPath, "out"),
              CMAKE_ARCHIVE_OUTPUT_DIRECTORY: path.join(buildPath, "out"),
            },
          ]),
        ]);
      }),
    );
  },
  async build({ spawn, triplet }, { build, target, configuration }) {
    // const outputPath = path.join(buildPath, `${triplet.replace(/;/g, "_")}-out`)
    // We expect the final application to sign these binaries
    if (target.length > 1) {
      throw new Error("Building for multiple targets is not supported yet");
    }

    const buildPath = getBuildPath(build, triplet);
    const { project } = listXcodeProject(buildPath);

    const schemes = project.schemes.filter(
      (scheme) => scheme !== "ALL_BUILD" && scheme !== "ZERO_CHECK",
    );

    assert(
      schemes.length === 1,
      `Expected exactly one buildable scheme, got ${schemes.join(", ")}`,
    );

    const [scheme] = schemes;

    if (target.length === 1) {
      assert.equal(
        scheme,
        target[0],
        "Expected the only scheme to match the requested target",
      );
    }

    // TODO: Don't forget "CODE_SIGNING_ALLOWED=NO"
    await spawn(
      "xcodebuild",
      [
        "archive",
        "-scheme",
        scheme,
        "-configuration",
        configuration,

        // Ideally, we would just pass -destination here,
        // but I'm not able to configure / generate a single Xcode project supporting all
        "-destination",
        DESTINATION_BY_TRIPLET[triplet],

        // // TODO: Should this be outputPath?
        // "-archivePath",
        // "archives/MyFramework.xcarchive",
      ],
      buildPath,
    );
    await spawn(
      "xcodebuild",
      [
        "install",
        "-scheme",
        scheme,
        "-configuration",
        configuration,

        // Ideally, we would just pass -destination here,
        // but I'm not able to configure / generate a single Xcode project supporting all
        "-destination",
        DESTINATION_BY_TRIPLET[triplet],

        // // TODO: Should this be outputPath?
        // "-archivePath",
        // "archives/MyFramework.xcarchive",
      ],
      buildPath,
    );
  },
  isSupportedByHost: function (): boolean | Promise<boolean> {
    return process.platform === "darwin";
  },
  async postBuild(
    outputPath,
    triplets,
    { configuration, autoLink, xcframeworkExtension, target, build },
  ) {
    const prebuilds: Record<string, string[]> = {};
    for (const { triplet } of triplets) {
      const buildPath = getBuildPath(build, triplet);
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
      prebuilds[sharedLibrary.name].push(path.join(buildPath, artifact.path));
    }

    const extension = xcframeworkExtension ? ".xcframework" : ".apple.node";

    for (const [libraryName, libraryPaths] of Object.entries(prebuilds)) {
      const frameworkPaths = await Promise.all(
        libraryPaths.map(async (libraryPath) => {
          const parentDir = path.dirname(libraryPath);
          if (path.extname(parentDir) === ".framework") {
            return parentDir;
          } else {
            return createAppleFramework(libraryPath);
          }
        }),
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
          successText: `XCFramework (${libraryName}) assembled into ${prettyPath(xcframeworkOutputPath)}`,
          failText: ({ message }) =>
            `Failed to assemble XCFramework (${libraryName}): ${message}`,
        },
      );
    }
  },
};
