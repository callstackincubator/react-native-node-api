import path from "node:path";

import { Command, Option } from "@commander-js/extra-typings";
import chalk from "chalk";
import { SpawnFailure } from "bufout";
import { oraPromise } from "ora";

import {
  determineAndroidLibsFilename,
  createAndroidLibsDirectory,
  AndroidTriplet,
  createAppleFramework,
  determineXCFrameworkFilename,
  createXCframework,
  createUniversalAppleLibrary,
} from "react-native-node-api-modules";

import { UsageError } from "./errors.js";
import { ensureCargo, build } from "./cargo.js";
import {
  ALL_TARGETS,
  ANDROID_TARGETS,
  AndroidTargetName,
  APPLE_TARGETS,
  AppleTargetName,
  ensureInstalledTargets,
  filterTargetsByPlatform,
} from "./targets.js";
import { error } from "node:console";

const ANDROID_TRIPLET_PER_TARGET: Record<AndroidTargetName, AndroidTriplet> = {
  "aarch64-linux-android": "aarch64-linux-android",
  "armv7-linux-androideabi": "armv7a-linux-androideabi",
  "i686-linux-android": "i686-linux-android",
  "x86_64-linux-android": "x86_64-linux-android",
};

// This should match https://github.com/react-native-community/template/blob/main/template/android/build.gradle#L7
const DEFAULT_NDK_VERSION = "27.1.12297006";
const ANDROID_API_LEVEL = 24;

const targetOption = new Option("--target <target...>", "Target triple")
  .choices(ALL_TARGETS)
  .default([]);
const appleTarget = new Option("--apple", "Use all Apple targets");
const androidTarget = new Option("--android", "Use all Android targets");
const ndkVersionOption = new Option(
  "--ndk-version <version>",
  "The NDK version to use for Android builds"
).default(DEFAULT_NDK_VERSION);
const outputPathOption = new Option(
  "--output <path>",
  "Writing outputs to this directory"
).default(process.cwd());
const configurationOption = new Option(
  "--configuration <configuration>",
  "Build configuration"
)
  .choices(["debug", "release"])
  .default("debug");

export const buildCommand = new Command("build")
  .description("Build Rust Node-API module")
  .addOption(targetOption)
  .addOption(appleTarget)
  .addOption(androidTarget)
  .addOption(ndkVersionOption)
  .addOption(outputPathOption)
  .addOption(configurationOption)
  .action(
    async ({
      target: targetArg,
      apple,
      android,
      ndkVersion,
      output: outputPath,
      configuration,
    }) => {
      try {
        const targets = new Set([...targetArg]);
        if (apple) {
          for (const target of APPLE_TARGETS) {
            targets.add(target);
          }
        }
        if (android) {
          for (const target of ANDROID_TARGETS) {
            targets.add(target);
          }
        }
        ensureCargo();
        ensureInstalledTargets(targets);
        // TODO: Ensure the iOS and Android targets are installed
        const appleTargets = filterTargetsByPlatform(targets, "apple");
        const androidTargets = filterTargetsByPlatform(targets, "android");

        const targetsDescription =
          targets.size === 1
            ? `${targets.size} target`
            : `${targets.size} targets`;
        const [appleLibraries, androidLibraries] = await oraPromise(
          Promise.all([
            Promise.all(
              appleTargets.map(
                async (target) =>
                  [target, await build({ configuration, target })] as const
              )
            ),
            Promise.all(
              androidTargets.map(
                async (target) =>
                  [
                    target,
                    await build({
                      configuration,
                      target,
                      ndkVersion,
                      androidApiLevel: ANDROID_API_LEVEL,
                    }),
                  ] as const
              )
            ),
          ]),
          {
            text: `Building ${targetsDescription}`,
            successText: `Built ${targetsDescription}`,
            failText: (error: Error) => `Failed to build: ${error.message}`,
          }
        );

        // TODO: Call napi.rs to generate the .d.ts
        // TODO: Generate an entrypoint

        if (androidLibraries.length > 0) {
          const libraryPathByTriplet = Object.fromEntries(
            androidLibraries.map(([target, outputPath]) => [
              ANDROID_TRIPLET_PER_TARGET[target],
              outputPath,
            ])
          ) as Record<AndroidTriplet, string>;

          const androidLibsFilename = determineAndroidLibsFilename(
            Object.values(libraryPathByTriplet)
          );
          const androidLibsOutputPath = path.resolve(
            outputPath,
            androidLibsFilename
          );

          await oraPromise(
            createAndroidLibsDirectory({
              outputPath: androidLibsOutputPath,
              libraryPathByTriplet,
              autoLink: true,
            }),
            {
              text: "Assembling Android libs directory",
              successText: `Android libs directory assembled into ${chalk.dim(
                path.relative(process.cwd(), androidLibsOutputPath)
              )}`,
              failText: ({ message }) =>
                `Failed to assemble Android libs directory: ${message}`,
            }
          );
        }

        if (appleLibraries.length > 0) {
          const libraryPaths = await combineLibraries(appleLibraries);
          const frameworkPaths = libraryPaths.map(createAppleFramework);
          const xcframeworkFilename =
            determineXCFrameworkFilename(frameworkPaths);

          // Create the xcframework
          const xcframeworkOutputPath = path.resolve(
            outputPath,
            xcframeworkFilename
          );

          await oraPromise(
            createXCframework({
              outputPath: xcframeworkOutputPath,
              frameworkPaths,
              autoLink: true,
            }),
            {
              text: "Assembling XCFramework",
              successText: `XCFramework assembled into ${chalk.dim(
                path.relative(process.cwd(), xcframeworkOutputPath)
              )}`,
              failText: ({ message }) =>
                `Failed to assemble XCFramework: ${message}`,
            }
          );
        }

        // TODO: Handle Apple and constructing an XCFramework
      } catch (error) {
        if (error instanceof SpawnFailure) {
          error.flushOutput("both");
        }
        if (error instanceof UsageError || error instanceof SpawnFailure) {
          console.error(chalk.red("ERROR"), error.message);
          if (error.cause instanceof Error) {
            console.error(chalk.red("CAUSE"), error.cause.message);
          }
          if (error instanceof UsageError && error.fix) {
            console.error(
              chalk.green("FIX"),
              error.fix.command
                ? chalk.dim("Run: ") + error.fix.command
                : error.fix.instructions
            );
          }
        } else {
          throw error;
        }
      }
    }
  );

async function combineLibraries(
  libraries: Readonly<[AppleTargetName, string]>[]
): Promise<string[]> {
  const result = [];
  const darwinLibraries = [];
  for (const [target, libraryPath] of libraries) {
    if (target.endsWith("-darwin")) {
      darwinLibraries.push(libraryPath);
    } else {
      result.push(libraryPath);
    }
  }
  if (darwinLibraries.length === 0) {
    return result;
  } else if (darwinLibraries.length === 1) {
    return [...result, darwinLibraries[0]];
  } else {
    const universalPath = await oraPromise(
      createUniversalAppleLibrary(darwinLibraries),
      {
        text: "Combining Darwin libraries into a universal library",
        successText: "Combined Darwin libraries into a universal library",
        failText: (error) =>
          `Failed to combine Darwin libraries: ${error.message}`,
      }
    );
    return [...result, universalPath];
  }
}
