import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs";
import cp from "node:child_process";

import {
  assertFixable,
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

const appleBundleIdentifierOption = new Option(
  "--apple-bundle-identifier <id>",
  "Unique CFBundleIdentifier used for Apple framework artifacts",
).default(undefined, "com.callstackincubator.node-api.{libraryName}");

type AppleOpts = {
  xcframeworkExtension: boolean;
  appleBundleIdentifier?: string;
};

function getBuildPath(baseBuildPath: string, triplet: Triplet) {
  return path.join(baseBuildPath, triplet.replace(/;/g, "_"));
}

async function readCmakeSharedLibraryTargets(
  buildPath: string,
  configuration: string,
  target: string[],
) {
  const targets = await cmakeFileApi.readCurrentTargetsDeep(
    buildPath,
    configuration,
    "2.0",
  );
  return targets.filter(
    ({ type, name }) =>
      type === "SHARED_LIBRARY" &&
      (target.length === 0 || target.includes(name)),
  );
}

const SIMULATOR_TRIPLET_SUFFIXES = [
  "apple-ios-sim",
  "apple-tvos-sim",
  "apple-visionos-sim",
] as const;

async function getCompilerPath(
  name: "clang" | "clang++",
  { buildBinPath, ccachePath }: { buildBinPath: string; ccachePath: string },
) {
  const result = path.join(buildBinPath, name);
  if (!fs.existsSync(result)) {
    await fs.promises.symlink(ccachePath, result);
  }
  return result;
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
    return command
      .addOption(xcframeworkExtensionOption)
      .addOption(appleBundleIdentifierOption);
  },
  assertValidTriplets(triplets) {
    for (const suffix of SIMULATOR_TRIPLET_SUFFIXES) {
      const suggestion = `use the universal 'arm64;x86_64-${suffix}' triplet instead`;
      assertFixable(
        !triplets.includes(`x86_64-${suffix}`) ||
          !triplets.includes(`arm64-${suffix}`),
        `Conflicting triplet variants for ${suffix}`,
        {
          instructions: `Remove either the arm64 or x86_64 variant of the ${suffix} triplet or ${suggestion}`,
        },
      );
      assertFixable(
        !triplets.includes(`x86_64-${suffix}`) ||
          !triplets.includes(`arm64;x86_64-${suffix}`),
        `Conflicting triplet variants for ${suffix}`,
        {
          instructions: `Remove the x86_64 variant of the ${suffix} triplet and ${suggestion}`,
        },
      );
      assertFixable(
        !triplets.includes(`arm64-${suffix}`) ||
          !triplets.includes(`arm64;x86_64-${suffix}`),
        `Conflicting triplet variants for ${suffix}`,
        {
          instructions: `Remove the arm64 variant of the ${suffix} triplet and ${suggestion}`,
        },
      );
    }
  },
  async configure(
    triplets,
    { source, build, define, weakNodeApiLinkage, cmakeJs, ccachePath },
  ) {
    // When using ccache, we're creating symlinks for the clang and clang++ binaries to the ccache binary
    // This is needed for ccache to understand it's being invoked as clang and clang++ respectively.
    const buildBinPath = path.join(build, "bin");
    await fs.promises.mkdir(buildBinPath, { recursive: true });
    const compilerDefinitions = ccachePath
      ? {
          CMAKE_XCODE_ATTRIBUTE_CC: await getCompilerPath("clang", {
            buildBinPath,
            ccachePath,
          }),
          CMAKE_XCODE_ATTRIBUTE_CXX: await getCompilerPath("clang++", {
            buildBinPath,
            ccachePath,
          }),
          CMAKE_XCODE_ATTRIBUTE_LD: await getCompilerPath("clang", {
            buildBinPath,
            ccachePath,
          }),
          CMAKE_XCODE_ATTRIBUTE_LDPLUSPLUS: await getCompilerPath("clang++", {
            buildBinPath,
            ccachePath,
          }),
        }
      : {};

    // Ideally, we would generate a single Xcode project supporting all architectures / platforms
    // However, CMake's Xcode generator does not support that well, so we generate one project per triplet
    // Specifically, the linking of weak-node-api breaks, since the sdk / arch specific framework
    // from the xcframework is picked at configure time, not at build time.
    // See https://gitlab.kitware.com/cmake/cmake/-/issues/21752#note_1717047 for more information.
    await Promise.all(
      triplets.map(async ({ triplet, spawn }) => {
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
            weakNodeApiLinkage ? getWeakNodeApiVariables("apple") : {},
            cmakeJs ? getCmakeJSVariables("apple") : {},
            compilerDefinitions,
            {
              CMAKE_SYSTEM_NAME: CMAKE_SYSTEM_NAMES[triplet],
              CMAKE_OSX_SYSROOT: XCODE_SDK_NAMES[triplet],
              CMAKE_OSX_ARCHITECTURES: APPLE_ARCHITECTURES[triplet],
              // Passing a linker flag to increase the header pad size to allow renaming the install name when linking it into the app.
              CMAKE_SHARED_LINKER_FLAGS: "-Wl,-headerpad_max_install_names",
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
  async build(
    { spawn, triplet },
    { build, target, configuration, appleBundleIdentifier },
  ) {
    // We expect the final application to sign these binaries
    if (target.length > 1) {
      throw new Error("Building for multiple targets is not supported yet");
    }

    const buildPath = getBuildPath(build, triplet);

    const sharedLibraries = await readCmakeSharedLibraryTargets(
      buildPath,
      configuration,
      target,
    );

    await Promise.all(
      sharedLibraries.map(async (sharedLibrary) => {
        const { name, nameOnDisk, artifacts } = sharedLibrary;
        const isFramework = nameOnDisk?.includes(".framework/");

        if (isFramework) {
          const { project } = listXcodeProject(buildPath);

          const schemes = project.schemes.filter(
            (scheme) => scheme !== "ALL_BUILD" && scheme !== "ZERO_CHECK",
          );

          assert(
            schemes.some((scheme) => scheme === name),
            `Expected to find a scheme for ${name}, got ${schemes.join(", ")}`,
          );

          await spawn(
            "xcodebuild",
            [
              "archive",
              "-scheme",
              name,
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
              name,
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
          assert(
            artifacts && artifacts.length === 1,
            "Expected exactly one artifact",
          );
          const [artifact] = artifacts;
          await createAppleFramework({
            libraryPath: path.join(buildPath, artifact.path),
            kind: triplet.endsWith("-darwin") ? "versioned" : "flat",
            bundleIdentifier: appleBundleIdentifier,
          });
        }
      }),
    );
  },
  isSupportedByHost: function (): boolean | Promise<boolean> {
    return process.platform === "darwin";
  },
  async postBuild(
    outputPath,
    triplets,
    { configuration, autoLink, xcframeworkExtension, target, build, strip },
  ) {
    const frameworkPathsByName: Record<string, string[]> = {};
    // TODO: Run this in parallel
    for (const { spawn, triplet } of triplets) {
      const buildPath = getBuildPath(build, triplet);
      assert(fs.existsSync(buildPath), `Expected a directory at ${buildPath}`);
      const sharedLibraries = await readCmakeSharedLibraryTargets(
        buildPath,
        configuration,
        target,
      );

      await Promise.all(
        sharedLibraries.map(async (sharedLibrary) => {
          const { name: libraryName, artifacts } = sharedLibrary;
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

          // Locate the path of the framework, if a free dynamic library was built
          if (artifact.path.includes(".framework/")) {
            if (libraryName in frameworkPathsByName) {
              frameworkPathsByName[libraryName].push(
                path.dirname(artifactPath),
              );
            } else {
              frameworkPathsByName[libraryName] = [path.dirname(artifactPath)];
            }
          } else {
            const frameworkPath = path.join(
              buildPath,
              path.dirname(artifact.path),
              `${libraryName}.framework`,
            );
            assert(
              fs.existsSync(frameworkPath),
              `Expected to find a framework at: ${frameworkPath}`,
            );
            if (libraryName in frameworkPathsByName) {
              frameworkPathsByName[libraryName].push(frameworkPath);
            } else {
              frameworkPathsByName[libraryName] = [frameworkPath];
            }
          }
        }),
      );
    }

    for (const [libraryName, frameworkPaths] of Object.entries(
      frameworkPathsByName,
    )) {
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
