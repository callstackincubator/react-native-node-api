import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs";
import cp from "node:child_process";
import { promisify } from "node:util";

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
import { getArtifactName, toDefineArguments } from "../helpers.js";
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

const execFile = promisify(cp.execFile);

async function listXcodeProject(
  cwd: string,
): Promise<z.infer<typeof XcodeListOutput>> {
  const { stdout } = await execFile("xcodebuild", ["-list", "-json"], {
    encoding: "utf-8",
    cwd,
  });
  const parsed = JSON.parse(stdout) as unknown;
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

const codeSigningAllowedOption = new Option(
  "--code-signing-allowed",
  "Allow code signing when building free dynamic libraries (passed as CODE_SIGNING_ALLOWED to xcodebuild)",
).default(false);

type AppleOpts = {
  xcframeworkExtension: boolean;
  appleBundleIdentifier?: string;
  codeSigningAllowed: boolean;
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
      .addOption(appleBundleIdentifierOption)
      .addOption(codeSigningAllowedOption);
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
              //
              // The directory is per target: a project declaring multiple addons
              // gives every target the same OUTPUT_NAME (see gyp-to-cmake's
              // --namespaced-targets), so a shared directory would have them
              // overwrite each other's framework and every prebuild would end up
              // assembled from whichever target happened to build last.
              CMAKE_LIBRARY_OUTPUT_DIRECTORY: path.join(
                buildPath,
                "out",
                "$<TARGET_PROPERTY:NAME>",
              ),
              CMAKE_ARCHIVE_OUTPUT_DIRECTORY: path.join(
                buildPath,
                "out",
                "$<TARGET_PROPERTY:NAME>",
              ),
            },
          ]),
        ]);
      }),
    );
  },
  async build(
    { spawn, triplet },
    { build, target, configuration, appleBundleIdentifier, codeSigningAllowed },
  ) {
    const buildPath = getBuildPath(build, triplet);

    const sharedLibraries = await readCmakeSharedLibraryTargets(
      buildPath,
      configuration,
      target,
    );

    const frameworkTargets = sharedLibraries.filter(({ nameOnDisk }) =>
      nameOnDisk?.includes(".framework/"),
    );
    const libraryTargets = sharedLibraries.filter(
      ({ nameOnDisk }) => !nameOnDisk?.includes(".framework/"),
    );

    if (frameworkTargets.length > 0) {
      const { project } = await listXcodeProject(buildPath);

      const schemes = project.schemes.filter(
        (scheme) => scheme !== "ALL_BUILD" && scheme !== "ZERO_CHECK",
      );

      // Note: These run in sequence on purpose. Concurrent invocations of
      // xcodebuild against the same Xcode project (and its derived data) are
      // not reliable, and every target of a triplet shares a single project.
      for (const { name } of frameworkTargets) {
        assert(
          schemes.includes(name),
          `Expected to find a scheme for ${name}, got ${schemes.join(", ")}`,
        );

        for (const action of ["archive", "install"] as const) {
          await spawn(
            "xcodebuild",
            [
              action,
              "-scheme",
              name,
              "-configuration",
              configuration,
              "-destination",
              DESTINATION_BY_TRIPLET[triplet],
            ],
            buildPath,
          );
        }
      }
    }

    if (libraryTargets.length > 0) {
      // A single invocation builds every requested target, so this is hoisted
      // out of the per-target loop below.
      await spawn("cmake", [
        "--build",
        buildPath,
        "--config",
        configuration,
        ...(target.length > 0 ? ["--target", ...target] : []),
        "--",

        // Skip code-signing by default (needed when building free dynamic
        // libraries), but let a consumer opt into signed binaries via
        // --code-signing-allowed.
        `CODE_SIGNING_ALLOWED=${codeSigningAllowed ? "YES" : "NO"}`,
      ]);

      // We expect the final application to sign these binaries
      await Promise.all(
        libraryTargets.map(async ({ artifacts }) => {
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
        }),
      );
    }
  },
  isSupportedByHost: function (): boolean | Promise<boolean> {
    return process.platform === "darwin";
  },
  async postBuild(
    resolveOutputPath,
    triplets,
    { configuration, autoLink, xcframeworkExtension, target, build, strip },
  ) {
    // Keyed by CMake target name, which CMake guarantees to be unique within a
    // project. The artifact name is not: every addon of a multi-addon project
    // may well build an "addon.node".
    const prebuilds: Record<
      string,
      {
        artifactName: string;
        targetSourceDir: string;
        frameworkPaths: string[];
      }
    > = {};
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
          const { name, paths, artifacts } = sharedLibrary;
          assert(
            artifacts && artifacts.length === 1,
            "Expected exactly one artifact",
          );
          const [artifact] = artifacts;
          const artifactName = getArtifactName(artifact.path);

          const artifactPath = path.join(buildPath, artifact.path);

          if (strip) {
            // -r: All relocation entries.
            // -S: All symbol table entries.
            // -T: All text relocation entries.
            // -x: All local symbols.
            await spawn("strip", ["-rSTx", artifactPath]);
          }

          // Locate the path of the framework, if a free dynamic library was built
          let frameworkPath: string;
          if (artifact.path.includes(".framework/")) {
            frameworkPath = path.dirname(artifactPath);
          } else {
            // createAppleFramework names the framework after the artifact file,
            // keeping any "lib" prefix, so this is derived the same way rather
            // than from the (prefix-stripped) name of the prebuild.
            frameworkPath = path.join(
              buildPath,
              path.dirname(artifact.path),
              `${path.basename(
                artifact.path,
                path.extname(artifact.path),
              )}.framework`,
            );
            assert(
              fs.existsSync(frameworkPath),
              `Expected to find a framework at: ${frameworkPath}`,
            );
          }

          if (name in prebuilds) {
            prebuilds[name].frameworkPaths.push(frameworkPath);
          } else {
            prebuilds[name] = {
              artifactName,
              targetSourceDir: paths.source,
              frameworkPaths: [frameworkPath],
            };
          }
        }),
      );
    }

    for (const {
      artifactName,
      targetSourceDir,
      frameworkPaths,
    } of Object.values(prebuilds)) {
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
        resolveOutputPath(targetSourceDir),
        `${artifactName}${extension}`,
      );

      await oraPromise(
        createXCframework({
          outputPath: xcframeworkOutputPath,
          frameworkPaths,
          autoLink,
        }),
        {
          text: `Assembling XCFramework (${artifactName})`,
          successText: `XCFramework (${artifactName}) assembled into ${prettyPath(xcframeworkOutputPath)}`,
          failText: ({ message }) =>
            `Failed to assemble XCFramework (${artifactName}): ${message}`,
        },
      );
    }
  },
};
