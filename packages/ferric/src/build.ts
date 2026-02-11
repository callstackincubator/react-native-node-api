import path from "node:path";
import fs from "node:fs";
import os from "node:os";

import {
  chalk,
  Command,
  Option,
  oraPromise,
  assertFixable,
  wrapAction,
  prettyPath,
  pLimit,
  spawn,
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
} from "react-native-node-api";

import { ensureCargo, build } from "./cargo.js";
import {
  ALL_TARGETS,
  ANDROID_TARGETS,
  AndroidTargetName,
  APPLE_TARGETS,
  AppleOperatingSystem,
  AppleTargetName,
  ensureAvailableTargets,
  filterTargetsByPlatform,
  parseAppleTargetName,
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
const cleanOption = new Option(
  "--clean",
  "Delete the target directory before building",
).default(false);
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

const appleBundleIdentifierOption = new Option(
  "--apple-bundle-identifier <id>",
  "Unique CFBundleIdentifier used for Apple framework artifacts",
).default(undefined, "com.callstackincubator.node-api.{libraryName}");

const concurrencyOption = new Option(
  "--concurrency <limit>",
  "Limit the number of concurrent tasks",
)
  .argParser((value) => parseInt(value, 10))
  .default(
    os.availableParallelism(),
    `${os.availableParallelism()} or 1 when verbose is enabled`,
  );

const verboseOption = new Option(
  "--verbose",
  "Print more output from underlying compiler & tools",
).default(process.env.CI ? true : false, `false in general and true on CI`);

function logNotice(message: string, ...params: string[]) {
  console.log(`${chalk.yellow("ℹ︎")} ${message}`, ...params);
}

export const buildCommand = new Command("build")
  .description("Build Rust Node-API module")
  .addOption(targetOption)
  .addOption(cleanOption)
  .addOption(appleTarget)
  .addOption(androidTarget)
  .addOption(ndkVersionOption)
  .addOption(outputPathOption)
  .addOption(configurationOption)
  .addOption(xcframeworkExtensionOption)
  .addOption(appleBundleIdentifierOption)
  .addOption(concurrencyOption)
  .addOption(verboseOption)
  .action(
    wrapAction(
      async ({
        target: targetArg,
        clean,
        apple,
        android,
        ndkVersion,
        output: outputPath,
        configuration,
        xcframeworkExtension,
        appleBundleIdentifier,
        concurrency,
        verbose,
      }) => {
        if (clean) {
          await oraPromise(
            () => spawn("cargo", ["clean"], { outputMode: "buffered" }),
            {
              text: "Cleaning target directory",
              successText: "Cleaned target directory",
              failText: (error) => `Failed to clean target directory: ${error}`,
            },
          );
        }
        if (verbose && concurrency > 1) {
          logNotice(
            `Consider passing ${chalk.blue("--concurrency")} 1 when running in verbose mode`,
          );
        }
        const limit = pLimit(concurrency);
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
          logNotice(
            `Using default targets, pass ${chalk.blue(
              "--android",
            )}, ${chalk.blue("--apple")} or individual ${chalk.blue(
              "--target",
            )} options, choose exactly what to target`,
          );
        }
        ensureCargo();
        ensureAvailableTargets(targets);

        const appleTargets = filterTargetsByPlatform(targets, "apple");
        const androidTargets = filterTargetsByPlatform(targets, "android");

        const targetsDescription =
          targets.size +
          (targets.size === 1 ? " target" : " targets") +
          chalk.dim(" (" + [...targets].join(", ") + ")");

        const [appleLibraries, androidLibraries] = await oraPromise(
          Promise.all([
            Promise.all(
              appleTargets.map((target) =>
                limit(
                  async () =>
                    [
                      target,
                      await build({ configuration, target, verbose }),
                    ] as const,
                ),
              ),
            ),
            Promise.all(
              androidTargets.map((target) =>
                limit(
                  async () =>
                    [
                      target,
                      await build({
                        configuration,
                        target,
                        verbose,
                        ndkVersion,
                        androidApiLevel: ANDROID_API_LEVEL,
                      }),
                    ] as const,
                ),
              ),
            ),
          ]),
          {
            isSilent: verbose,
            text: `Building ${targetsDescription}`,
            successText: `Built ${targetsDescription}`,
            failText: (error: Error) => `Failed to build: ${error.message}`,
          },
        );

        if (androidLibraries.length > 0) {
          const libraries = androidLibraries.map(([target, outputPath]) => ({
            triplet: ANDROID_TRIPLET_PER_TARGET[target],
            libraryPath: outputPath,
          }));

          const androidLibsFilename = determineAndroidLibsFilename(
            libraries.map(({ libraryPath }) => libraryPath),
          );
          const androidLibsOutputPath = path.resolve(
            outputPath,
            androidLibsFilename,
          );

          await oraPromise(
            limit(() =>
              createAndroidLibsDirectory({
                outputPath: androidLibsOutputPath,
                libraries,
                autoLink: true,
              }),
            ),
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
          const libraries = await combineAppleLibraries(appleLibraries);

          const frameworkPaths = await oraPromise(
            Promise.all(
              libraries.map((library) =>
                limit(() =>
                  createAppleFramework({
                    libraryPath: library.path,
                    kind: library.os === "darwin" ? "versioned" : "flat",
                    bundleIdentifier: appleBundleIdentifier,
                  }),
                ),
              ),
            ),
            {
              text: "Creating Apple frameworks",
              successText: `Created Apple frameworks`,
              failText: ({ message }) =>
                `Failed to create Apple frameworks: ${message}`,
            },
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
              successText: `XCFramework assembled into ${prettyPath(xcframeworkOutputPath)}`,
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

async function createUniversalAppleLibraries(
  groups: { os: AppleOperatingSystem; paths: string[] }[],
): Promise<{ os: AppleOperatingSystem; path: string }[]> {
  const result = await oraPromise(
    Promise.all(
      groups.map(async ({ os, paths }) => {
        if (paths.length === 0) {
          return [];
        } else if (paths.length === 1) {
          return [{ os, path: paths[0] }];
        } else {
          return [
            {
              os,
              path: await createUniversalAppleLibrary(paths),
            },
          ];
        }
      }),
    ),
    {
      text: "Combining arch-specific libraries into universal libraries",
      successText: "Combined arch-specific libraries into universal libraries",
      failText: (error) =>
        `Failed to combine arch-specific libraries: ${error.message}`,
    },
  );
  return result.flat();
}

type CombinedAppleLibrary = {
  path: string;
  os: AppleOperatingSystem;
};

async function combineAppleLibraries(
  libraries: Readonly<[AppleTargetName, string]>[],
): Promise<CombinedAppleLibrary[]> {
  const result = [];
  const darwinLibraries = [];
  const iosSimulatorLibraries = [];
  const tvosSimulatorLibraries = [];
  for (const [target, libraryPath] of libraries) {
    const { os } = parseAppleTargetName(target);
    if (os === "darwin") {
      darwinLibraries.push(libraryPath);
    } else if (
      target === "aarch64-apple-ios-sim" ||
      target === "x86_64-apple-ios" // Simulator despite name missing -sim suffix
    ) {
      iosSimulatorLibraries.push(libraryPath);
    } else if (
      target === "aarch64-apple-tvos-sim" ||
      target === "x86_64-apple-tvos" // Simulator despite name missing -sim suffix
    ) {
      tvosSimulatorLibraries.push(libraryPath);
    } else {
      result.push({ os, path: libraryPath });
    }
  }

  const combinedLibraryPaths = await createUniversalAppleLibraries([
    { os: "darwin", paths: darwinLibraries },
    { os: "ios", paths: iosSimulatorLibraries },
    { os: "tvos", paths: tvosSimulatorLibraries },
  ]);

  return [...result, ...combinedLibraryPaths];
}

export function isAndroidSupported() {
  const { ANDROID_HOME } = process.env;
  return typeof ANDROID_HOME === "string" && fs.existsSync(ANDROID_HOME);
}

export function isAppleSupported() {
  return process.platform === "darwin";
}
