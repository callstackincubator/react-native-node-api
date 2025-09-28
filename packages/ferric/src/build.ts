import path from "node:path";
import fs from "node:fs";

import {
  chalk,
  Command,
  Option,
  oraPromise,
  assertFixable,
  wrapAction,
} from "@react-native-node-api/cli-utils";

import {
  determineAndroidLibsFilename,
  createAndroidLibsDirectory,
  AndroidTriplet,
  createAppleFramework,
  determineXCFrameworkFilename,
  createXCframework,
  createUniversalAppleLibrary,
  determineLibraryBasename,
  prettyPath,
} from "react-native-node-api";

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
import { generateTypeScriptDeclarations } from "./napi-rs.js";
import { getBlockComment } from "./banner.js";

type EntrypointOptions = {
  outputPath: string;
  libraryName: string;
};
async function generateEntrypoint({
  outputPath,
  libraryName,
}: EntrypointOptions) {
  await fs.promises.writeFile(
    outputPath,
    [
      "/* eslint-disable */",
      getBlockComment(),
      `module.exports = require('./${libraryName}.node');`,
    ].join("\n\n") + "\n",
    "utf8",
  );
}

const ANDROID_TRIPLET_PER_TARGET: Record<AndroidTargetName, AndroidTriplet> = {
  "aarch64-linux-android": "aarch64-linux-android",
  "armv7-linux-androideabi": "armv7a-linux-androideabi",
  "i686-linux-android": "i686-linux-android",
  "x86_64-linux-android": "x86_64-linux-android",
};

// This should match https://github.com/react-native-community/template/blob/main/template/android/build.gradle#L7
const DEFAULT_NDK_VERSION = "27.1.12297006";
const ANDROID_API_LEVEL = 24;

const { FERRIC_TARGETS } = process.env;

function getDefaultTargets() {
  const result = FERRIC_TARGETS ? FERRIC_TARGETS.split(",") : [];
  for (const target of result) {
    assertFixable(
      (ALL_TARGETS as readonly string[]).includes(target),
      `Unexpected target in FERRIC_TARGETS: ${target}`,
      {
        instructions:
          "Pass only valid targets via FERRIC_TARGETS (or remove them)",
      },
    );
  }
  return result as (typeof ALL_TARGETS)[number][];
}

const targetOption = new Option("--target <target...>", "Target triple")
  .choices(ALL_TARGETS)
  .default(getDefaultTargets());
const appleTarget = new Option("--apple", "Use all Apple targets");
const androidTarget = new Option("--android", "Use all Android targets");
const ndkVersionOption = new Option(
  "--ndk-version <version>",
  "The NDK version to use for Android builds",
).default(DEFAULT_NDK_VERSION);
const xcframeworkExtensionOption = new Option(
  "--xcframework-extension",
  "Don't rename the xcframework to .apple.node",
).default(false);

const outputPathOption = new Option(
  "--output <path>",
  "Writing outputs to this directory",
).default(process.cwd());
const configurationOption = new Option(
  "--configuration <configuration>",
  "Build configuration",
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
  .addOption(xcframeworkExtensionOption)
  .action(
    wrapAction(
      async ({
        target: targetArg,
        apple,
        android,
        ndkVersion,
        output: outputPath,
        configuration,
        xcframeworkExtension,
      }) => {
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

        if (targets.size === 0) {
          if (isAndroidSupported()) {
            if (process.arch === "arm64") {
              targets.add("aarch64-linux-android");
            } else if (process.arch === "x64") {
              targets.add("x86_64-linux-android");
            }
          }
          if (isAppleSupported()) {
            if (process.arch === "arm64") {
              targets.add("aarch64-apple-ios-sim");
            }
          }
          console.error(
            chalk.yellowBright("ℹ"),
            chalk.dim(
              `Using default targets, pass ${chalk.italic(
                "--android",
              )}, ${chalk.italic("--apple")} or individual ${chalk.italic(
                "--target",
              )} options, to avoid this.`,
            ),
          );
        }
        ensureCargo();
        ensureInstalledTargets(targets);

        const appleTargets = filterTargetsByPlatform(targets, "apple");
        const androidTargets = filterTargetsByPlatform(targets, "android");

        const targetsDescription =
          targets.size +
          (targets.size === 1 ? " target" : " targets") +
          chalk.dim(" (" + [...targets].join(", ") + ")");
        const [appleLibraries, androidLibraries] = await oraPromise(
          Promise.all([
            Promise.all(
              appleTargets.map(
                async (target) =>
                  [target, await build({ configuration, target })] as const,
              ),
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
                  ] as const,
              ),
            ),
          ]),
          {
            text: `Building ${targetsDescription}`,
            successText: `Built ${targetsDescription}`,
            failText: (error: Error) => `Failed to build: ${error.message}`,
          },
        );

        if (androidLibraries.length > 0) {
          const libraryPathByTriplet = Object.fromEntries(
            androidLibraries.map(([target, outputPath]) => [
              ANDROID_TRIPLET_PER_TARGET[target],
              outputPath,
            ]),
          ) as Record<AndroidTriplet, string>;

          const androidLibsFilename = determineAndroidLibsFilename(
            Object.values(libraryPathByTriplet),
          );
          const androidLibsOutputPath = path.resolve(
            outputPath,
            androidLibsFilename,
          );

          await oraPromise(
            createAndroidLibsDirectory({
              outputPath: androidLibsOutputPath,
              libraryPathByTriplet,
              autoLink: true,
            }),
            {
              text: "Assembling Android libs directory",
              successText: `Android libs directory assembled into ${prettyPath(
                androidLibsOutputPath,
              )}`,
              failText: ({ message }) =>
                `Failed to assemble Android libs directory: ${message}`,
            },
          );
        }

        if (appleLibraries.length > 0) {
          const libraryPaths = await combineLibraries(appleLibraries);
          const frameworkPaths = await Promise.all(
            libraryPaths.map(createAppleFramework),
          );
          const xcframeworkFilename = determineXCFrameworkFilename(
            frameworkPaths,
            xcframeworkExtension ? ".xcframework" : ".apple.node",
          );

          // Create the xcframework
          const xcframeworkOutputPath = path.resolve(
            outputPath,
            xcframeworkFilename,
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
                path.relative(process.cwd(), xcframeworkOutputPath),
              )}`,
              failText: ({ message }) =>
                `Failed to assemble XCFramework: ${message}`,
            },
          );
        }

        const libraryName = determineLibraryBasename([
          ...androidLibraries.map(([, outputPath]) => outputPath),
          ...appleLibraries.map(([, outputPath]) => outputPath),
        ]);

        const declarationsFilename = `${libraryName}.d.ts`;
        const declarationsPath = path.join(outputPath, declarationsFilename);
        await oraPromise(
          generateTypeScriptDeclarations({
            outputFilename: declarationsFilename,
            createPath: process.cwd(),
            outputPath,
          }),
          {
            text: "Generating TypeScript declarations",
            successText: `Generated TypeScript declarations ${prettyPath(
              declarationsPath,
            )}`,
            failText: (error) =>
              `Failed to generate TypeScript declarations: ${error.message}`,
          },
        );

        const entrypointPath = path.join(outputPath, `${libraryName}.js`);

        await oraPromise(
          generateEntrypoint({
            libraryName,
            outputPath: entrypointPath,
          }),
          {
            text: `Generating entrypoint`,
            successText: `Generated entrypoint into ${prettyPath(
              entrypointPath,
            )}`,
            failText: (error) =>
              `Failed to generate entrypoint: ${error.message}`,
          },
        );
      },
    ),
  );

async function combineLibraries(
  libraries: Readonly<[AppleTargetName, string]>[],
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
      },
    );
    return [...result, universalPath];
  }
}

export function isAndroidSupported() {
  const { ANDROID_HOME } = process.env;
  return typeof ANDROID_HOME === "string" && fs.existsSync(ANDROID_HOME);
}

export function isAppleSupported() {
  return process.platform === "darwin";
}
