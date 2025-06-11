import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs";
import { EventEmitter } from "node:events";

import { Command, Option } from "@commander-js/extra-typings";
import { spawn, SpawnFailure } from "bufout";
import { oraPromise } from "ora";
import chalk from "chalk";

import {
  DEFAULT_APPLE_TRIPLETS,
  getAppleBuildArgs,
  getAppleConfigureCmakeArgs,
} from "./apple.js";
import {
  DEFAULT_ANDROID_TRIPLETS,
  getAndroidConfigureCmakeArgs,
} from "./android.js";
import { getWeakNodeApiVariables } from "./weak-node-api.js";

import {
  SUPPORTED_TRIPLETS,
  SupportedTriplet,
  AndroidTriplet,
  isAndroidTriplet,
  isAppleTriplet,
  determineAndroidLibsFilename,
  createAndroidLibsDirectory,
  createAppleFramework,
  createXCframework,
  determineXCFrameworkFilename,
} from "react-native-node-api";

// We're attaching a lot of listeners when spawning in parallel
EventEmitter.defaultMaxListeners = 100;

// This should match https://github.com/react-native-community/template/blob/main/template/android/build.gradle#L7
const DEFAULT_NDK_VERSION = "27.1.12297006";

// TODO: Add automatic ccache support

const sourcePathOption = new Option(
  "--source <path>",
  "Specify the source directory containing a CMakeLists.txt file"
).default(process.cwd());

// TODO: Add "MinSizeRel" and "RelWithDebInfo"
const configurationOption = new Option("--configuration <configuration>")
  .choices(["Release", "Debug"] as const)
  .default("Release");

// TODO: Derive default triplets
// This is especially important when driving the build from within a React Native app package.

const tripletOption = new Option(
  "--triplet <triplet...>",
  "Triplets to build for"
).choices(SUPPORTED_TRIPLETS);

const androidOption = new Option("--android", "Enable all Android triplets");
const appleOption = new Option("--apple", "Enable all Apple triplets");

const buildPathOption = new Option(
  "--build <path>",
  "Specify the build directory to store the configured CMake project"
);

const cleanOption = new Option(
  "--clean",
  "Delete the build directory before configuring the project"
);

const outPathOption = new Option(
  "--out <path>",
  "Specify the output directory to store the final build artifacts"
);

const ndkVersionOption = new Option(
  "--ndk-version <version>",
  "The NDK version to use for Android builds"
).default(DEFAULT_NDK_VERSION);

const noAutoLinkOption = new Option(
  "--no-auto-link",
  "Don't mark the output as auto-linkable by react-native-node-api"
);

const noWeakNodeApiLinkageOption = new Option(
  "--no-weak-node-api-linkage",
  "Don't pass the path of the weak-node-api library from react-native-node-api"
);

const xcframeworkExtensionOption = new Option(
  "--xcframework-extension",
  "Don't rename the xcframework to .apple.node"
).default(false);

export const program = new Command("cmake-rn")
  .description("Build React Native Node API modules with CMake")
  .addOption(sourcePathOption)
  .addOption(configurationOption)
  .addOption(tripletOption)
  .addOption(androidOption)
  .addOption(appleOption)
  .addOption(buildPathOption)
  .addOption(outPathOption)
  .addOption(cleanOption)
  .addOption(ndkVersionOption)
  .addOption(noAutoLinkOption)
  .addOption(noWeakNodeApiLinkageOption)
  .addOption(xcframeworkExtensionOption)
  .action(async ({ triplet: tripletValues, ...globalContext }) => {
    try {
      const buildPath = getBuildPath(globalContext);
      if (globalContext.clean) {
        await fs.promises.rm(buildPath, { recursive: true, force: true });
      }
      const triplets = new Set<SupportedTriplet>(tripletValues);
      if (globalContext.apple) {
        for (const triplet of DEFAULT_APPLE_TRIPLETS) {
          triplets.add(triplet);
        }
      }
      if (globalContext.android) {
        for (const triplet of DEFAULT_ANDROID_TRIPLETS) {
          triplets.add(triplet);
        }
      }

      if (triplets.size === 0) {
        console.error(
          "Nothing to build 🤷",
          "Please specify at least one triplet with",
          chalk.dim("--triplet"),
          `(or use the ${chalk.dim("--android")} or ${chalk.dim(
            "--apple"
          )} shorthands)`
        );
        for (const triplet of SUPPORTED_TRIPLETS) {
          console.error(`${chalk.dim("--triplet")} ${triplet}`);
        }
        process.exitCode = 1;
        return;
      }

      const tripletContext = [...triplets].map((triplet) => {
        const tripletBuildPath = getTripletBuildPath(buildPath, triplet);
        return {
          ...globalContext,
          triplet,
          tripletBuildPath,
          tripletOutputPath: path.join(tripletBuildPath, "out"),
        };
      });

      // Configure every triplet project
      await oraPromise(Promise.all(tripletContext.map(configureProject)), {
        text: "Configuring projects",
        successText: "Configured projects",
        failText: ({ message }) => `Failed to configure projects: ${message}`,
      });

      // Build every triplet project
      await oraPromise(
        Promise.all(
          tripletContext.map(async (context) => {
            // Delete any stale build artifacts before building
            // This is important, since we might rename the output files
            await fs.promises.rm(context.tripletOutputPath, {
              recursive: true,
              force: true,
            });
            await buildProject(context);
          })
        ),
        {
          text: "Building projects",
          successText: "Built projects",
          failText: ({ message }) => `Failed to build projects: ${message}`,
        }
      );

      // Collect triplets in vendor specific containers
      const appleTriplets = tripletContext.filter(({ triplet }) =>
        isAppleTriplet(triplet)
      );
      if (appleTriplets.length > 0) {
        const libraryPaths = await Promise.all(
          appleTriplets.map(async ({ tripletOutputPath }) => {
            const configSpecificPath = path.join(
              tripletOutputPath,
              globalContext.configuration
            );
            assert(
              fs.existsSync(configSpecificPath),
              `Expected a directory at ${configSpecificPath}`
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
                  `Expected a .node or .dylib file, but found ${file}`
                );
              }
            });
            assert.equal(result.length, 1, "Expected exactly one library file");
            return await result[0];
          })
        );
        const frameworkPaths = libraryPaths.map(createAppleFramework);
        const xcframeworkFilename = determineXCFrameworkFilename(
          frameworkPaths,
          globalContext.xcframeworkExtension ? ".xcframework" : ".apple.node"
        );

        // Create the xcframework
        const xcframeworkOutputPath = path.resolve(
          globalContext.out || globalContext.source,
          xcframeworkFilename
        );

        await oraPromise(
          createXCframework({
            outputPath: xcframeworkOutputPath,
            frameworkPaths,
            autoLink: globalContext.autoLink,
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

      const androidTriplets = tripletContext.filter(({ triplet }) =>
        isAndroidTriplet(triplet)
      );
      if (androidTriplets.length > 0) {
        const libraryPathByTriplet = Object.fromEntries(
          await Promise.all(
            androidTriplets.map(async ({ tripletOutputPath, triplet }) => {
              assert(
                fs.existsSync(tripletOutputPath),
                `Expected a directory at ${tripletOutputPath}`
              );
              // Expect binary file(s), either .node or .so
              const dirents = await fs.promises.readdir(tripletOutputPath, {
                withFileTypes: true,
              });
              const result = dirents
                .filter(
                  (dirent) =>
                    dirent.isFile() &&
                    (dirent.name.endsWith(".so") ||
                      dirent.name.endsWith(".node"))
                )
                .map((dirent) => path.join(dirent.parentPath, dirent.name));
              assert.equal(
                result.length,
                1,
                "Expected exactly one library file"
              );
              return [triplet, result[0]] as const;
            })
          )
        ) as Record<AndroidTriplet, string>;
        const androidLibsFilename = determineAndroidLibsFilename(
          Object.values(libraryPathByTriplet)
        );
        const androidLibsOutputPath = path.resolve(
          globalContext.out || globalContext.source,
          androidLibsFilename
        );

        await oraPromise(
          createAndroidLibsDirectory({
            outputPath: androidLibsOutputPath,
            libraryPathByTriplet,
            autoLink: globalContext.autoLink,
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
    } catch (error) {
      if (error instanceof SpawnFailure) {
        error.flushOutput("both");
      }
      throw error;
    }
  });

type GlobalContext = ReturnType<typeof program.optsWithGlobals>;
type TripletScopedContext = Omit<GlobalContext, "triplet"> & {
  triplet: SupportedTriplet;
  tripletBuildPath: string;
  tripletOutputPath: string;
};

function getBuildPath(context: GlobalContext) {
  // TODO: Add configuration (debug vs release)
  return path.resolve(
    process.cwd(),
    context.build || path.join(context.source, "build")
  );
}

/**
 * Namespaces the output path with the triplet
 */
function getTripletBuildPath(buildPath: string, triplet: SupportedTriplet) {
  return path.join(buildPath, triplet.replace(/;/g, "_"));
}

function getTripletConfigureCmakeArgs(
  triplet: SupportedTriplet,
  { ndkVersion }: Pick<GlobalContext, "ndkVersion" | "weakNodeApiLinkage">
) {
  if (isAndroidTriplet(triplet)) {
    return getAndroidConfigureCmakeArgs({
      triplet,
      ndkVersion,
    });
  } else if (isAppleTriplet(triplet)) {
    return getAppleConfigureCmakeArgs({ triplet });
  } else {
    throw new Error(`Support for '${triplet}' is not implemented yet`);
  }
}

function getBuildArgs(triplet: SupportedTriplet) {
  if (isAndroidTriplet(triplet)) {
    return [];
  } else if (isAppleTriplet(triplet)) {
    return getAppleBuildArgs();
  } else {
    throw new Error(`Support for '${triplet}' is not implemented yet`);
  }
}

async function configureProject(context: TripletScopedContext) {
  const { triplet, tripletBuildPath, source, ndkVersion, weakNodeApiLinkage } =
    context;
  await spawn(
    "cmake",
    [
      "-S",
      source,
      "-B",
      tripletBuildPath,
      ...getVariablesArgs(getVariables(context)),
      ...getTripletConfigureCmakeArgs(triplet, {
        ndkVersion,
        weakNodeApiLinkage,
      }),
    ],
    {
      outputMode: "buffered",
    }
  );
}

async function buildProject(context: TripletScopedContext) {
  const { triplet, tripletBuildPath, configuration } = context;
  await spawn(
    "cmake",
    [
      "--build",
      tripletBuildPath,
      "--config",
      configuration,
      "--",
      ...getBuildArgs(triplet),
    ],
    {
      outputMode: "buffered",
    }
  );
}

function getVariables(context: TripletScopedContext): Record<string, string> {
  return {
    ...(context.weakNodeApiLinkage && getWeakNodeApiVariables(context.triplet)),
    CMAKE_LIBRARY_OUTPUT_DIRECTORY: context.tripletOutputPath,
  };
}

function getVariablesArgs(variables: Record<string, string>) {
  return Object.entries(variables).flatMap(([key, value]) => [
    "-D",
    `${key}=${value}`,
  ]);
}
