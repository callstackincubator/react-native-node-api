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
  dereferenceDirectory,
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
  "x86_64-apple-ios-sim": "iphonesimulator",
  "arm64;x86_64-apple-ios-sim": "iphonesimulator",

  // "x86_64-apple-tvos": "appletvos",
  "arm64-apple-tvos": "appletvos",
  "x86_64-apple-tvos-sim": "appletvsimulator",
  "arm64-apple-tvos-sim": "appletvsimulator",
  "arm64;x86_64-apple-tvos-sim": "appletvsimulator",

  "arm64-apple-visionos": "xros",
  "arm64-apple-visionos-sim": "xrsimulator",
  "x86_64-apple-visionos-sim": "xrsimulator",
  "arm64;x86_64-apple-visionos-sim": "xrsimulator",
} satisfies Record<Triplet, XcodeSDKName>;

type CMakeSystemName = "Darwin" | "iOS" | "tvOS" | "watchOS" | "visionOS";

const CMAKE_SYSTEM_NAMES = {
  "x86_64-apple-darwin": "Darwin",
  "arm64-apple-darwin": "Darwin",
  "arm64;x86_64-apple-darwin": "Darwin",

  "arm64-apple-ios": "iOS",
  "arm64-apple-ios-sim": "iOS",
  "x86_64-apple-ios-sim": "iOS",
  "arm64;x86_64-apple-ios-sim": "iOS",

  // "x86_64-apple-tvos": "appletvos",
  "arm64-apple-tvos": "tvOS",
  "arm64-apple-tvos-sim": "tvOS",
  "x86_64-apple-tvos-sim": "tvOS",
  "arm64;x86_64-apple-tvos-sim": "tvOS",

  "arm64-apple-visionos": "visionOS",
  "x86_64-apple-visionos-sim": "visionOS",
  "arm64-apple-visionos-sim": "visionOS",
  "arm64;x86_64-apple-visionos-sim": "visionOS",
} satisfies Record<Triplet, CMakeSystemName>;

const DESTINATION_BY_TRIPLET = {
  "x86_64-apple-darwin": "generic/platform=macOS",
  "arm64-apple-darwin": "generic/platform=macOS",
  "arm64;x86_64-apple-darwin": "generic/platform=macOS",

  "arm64-apple-ios": "generic/platform=iOS",
  "arm64-apple-ios-sim": "generic/platform=iOS Simulator",
  "x86_64-apple-ios-sim": "generic/platform=iOS Simulator",
  "arm64;x86_64-apple-ios-sim": "generic/platform=iOS Simulator",

  "arm64-apple-tvos": "generic/platform=tvOS",
  // "x86_64-apple-tvos": "generic/platform=tvOS",
  "x86_64-apple-tvos-sim": "generic/platform=tvOS Simulator",
  "arm64-apple-tvos-sim": "generic/platform=tvOS Simulator",
  "arm64;x86_64-apple-tvos-sim": "generic/platform=tvOS Simulator",

  "arm64-apple-visionos": "generic/platform=visionOS",
  "arm64-apple-visionos-sim": "generic/platform=visionOS Simulator",
  "x86_64-apple-visionos-sim": "generic/platform=visionOS Simulator",
  "arm64;x86_64-apple-visionos-sim": "generic/platform=visionOS Simulator",
} satisfies Record<Triplet, string>;

type AppleArchitecture = "arm64" | "x86_64" | "arm64;x86_64";

export const APPLE_ARCHITECTURES = {
  "x86_64-apple-darwin": "x86_64",
  "arm64-apple-darwin": "arm64",
  "arm64;x86_64-apple-darwin": "arm64;x86_64",

  "arm64-apple-ios": "arm64",
  "arm64-apple-ios-sim": "arm64",
  "x86_64-apple-ios-sim": "x86_64",
  "arm64;x86_64-apple-ios-sim": "arm64;x86_64",

  // "x86_64-apple-tvos": "x86_64",
  "arm64-apple-tvos": "arm64",
  "arm64-apple-tvos-sim": "arm64",
  "x86_64-apple-tvos-sim": "x86_64",
  "arm64;x86_64-apple-tvos-sim": "arm64;x86_64",

  "arm64-apple-visionos": "arm64",
  "x86_64-apple-visionos-sim": "x86_64",
  "arm64-apple-visionos-sim": "arm64",
  "arm64;x86_64-apple-visionos-sim": "arm64;x86_64",
} satisfies Record<Triplet, AppleArchitecture>;

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

async function readCmakeSharedLibraryTarget(
  buildPath: string,
  configuration: string,
  target: string[],
) {
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
  return sharedLibrary;
}

export const platform: Platform<Triplet[], AppleOpts> = {
  id: "apple",
  name: "Apple",
  triplets: [
    "arm64-apple-darwin",
    "x86_64-apple-darwin",
    "arm64;x86_64-apple-darwin",

    "arm64-apple-ios",
    "arm64-apple-ios-sim",
    "x86_64-apple-ios-sim",
    "arm64;x86_64-apple-ios-sim",

    "arm64-apple-tvos",
    "x86_64-apple-tvos-sim",
    "arm64-apple-tvos-sim",
    "arm64;x86_64-apple-tvos-sim",

    "arm64-apple-visionos",
    "x86_64-apple-visionos-sim",
    "arm64-apple-visionos-sim",
    "arm64;x86_64-apple-visionos-sim",
  ],
  defaultTriplets(mode) {
    if (mode === "all") {
      return [
        "arm64;x86_64-apple-darwin",

        "arm64-apple-ios",
        "arm64;x86_64-apple-ios-sim",

        "arm64-apple-tvos",
        "arm64;x86_64-apple-tvos-sim",

        "arm64-apple-visionos",
        "arm64;x86_64-apple-visionos-sim",
      ];
    } else if (mode === "current-development") {
      // We're applying a heuristic to determine the current simulators
      // TODO: Run a command to probe the currently running simulators instead
      return ["arm64;x86_64-apple-ios-sim"];
    } else {
      throw new Error(`Unexpected mode: ${mode as string}`);
    }
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
    // We expect the final application to sign these binaries
    if (target.length > 1) {
      throw new Error("Building for multiple targets is not supported yet");
    }

    const buildPath = getBuildPath(build, triplet);

    const sharedLibrary = await readCmakeSharedLibraryTarget(
      buildPath,
      configuration,
      target,
    );

    const isFramework = sharedLibrary.nameOnDisk?.includes(".framework/");

    if (isFramework) {
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

      await spawn(
        "xcodebuild",
        [
          "archive",
          "-scheme",
          scheme,
          "-configuration",
          configuration,
          "-destination",
          DESTINATION_BY_TRIPLET[triplet],
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
          "-destination",
          DESTINATION_BY_TRIPLET[triplet],
        ],
        buildPath,
      );
    } else {
      await spawn("cmake", [
        "--build",
        buildPath,
        "--config",
        configuration,
        ...(target.length > 0 ? ["--target", ...target] : []),
        "--",

        // Skip code-signing (needed when building free dynamic libraries)
        // TODO: Make this configurable
        "CODE_SIGNING_ALLOWED=NO",
      ]);
      // Create a framework
      const { artifacts } = sharedLibrary;
      assert(
        artifacts && artifacts.length === 1,
        "Expected exactly one artifact",
      );
      const [artifact] = artifacts;
      await createAppleFramework(
        path.join(buildPath, artifact.path),
        triplet.endsWith("-darwin"),
      );
    }
  },
  isSupportedByHost: function (): boolean | Promise<boolean> {
    return process.platform === "darwin";
  },
  async postBuild(
    outputPath,
    triplets,
    { configuration, autoLink, xcframeworkExtension, target, build, strip },
  ) {
    const libraryNames = new Set<string>();
    const frameworkPaths: string[] = [];
    for (const { spawn, triplet } of triplets) {
      const buildPath = getBuildPath(build, triplet);
      assert(fs.existsSync(buildPath), `Expected a directory at ${buildPath}`);
      const sharedLibrary = await readCmakeSharedLibraryTarget(
        buildPath,
        configuration,
        target,
      );
      const { artifacts } = sharedLibrary;
      assert(
        artifacts && artifacts.length === 1,
        "Expected exactly one artifact",
      );
      const [artifact] = artifacts;

      const artifactPath = path.join(buildPath, artifact.path);

      if (strip) {
        // -r: All relocation entries.
        // -S: All symbol table entries.
        // -T: All text relocation entries.
        // -x: All local symbols.
        await spawn("strip", ["-rSTx", artifactPath]);
      }

      libraryNames.add(sharedLibrary.name);
      // Locate the path of the framework, if a free dynamic library was built
      if (artifact.path.includes(".framework/")) {
        frameworkPaths.push(path.dirname(artifactPath));
      } else {
        const libraryName = path.basename(
          artifact.path,
          path.extname(artifact.path),
        );
        const frameworkPath = path.join(
          buildPath,
          path.dirname(artifact.path),
          `${libraryName}.framework`,
        );
        assert(
          fs.existsSync(frameworkPath),
          `Expected to find a framework at: ${frameworkPath}`,
        );
        frameworkPaths.push(frameworkPath);
      }
    }

    // Make sure none of the frameworks are symlinks
    // We do this before creating an xcframework to avoid symlink paths being invalidated
    // as the xcframework might be moved to a different location
    await Promise.all(
      frameworkPaths.map(async (frameworkPath) => {
        const stat = await fs.promises.lstat(frameworkPath);
        if (stat.isSymbolicLink()) {
          await dereferenceDirectory(frameworkPath);
        }
      }),
    );

    const extension = xcframeworkExtension ? ".xcframework" : ".apple.node";

    assert(
      libraryNames.size === 1,
      "Expected all libraries to have the same name",
    );
    const [libraryName] = libraryNames;

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
  },
};
