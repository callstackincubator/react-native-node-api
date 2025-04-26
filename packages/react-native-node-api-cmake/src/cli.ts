import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs";

import { Command, Option } from "@commander-js/extra-typings";
import { spawn, SpawnFailure } from "bufout";
import ora from "ora";

import { SUPPORTED_TRIPLETS, SupportedTriplet } from "./triplets.js";
import { getNodeApiHeadersPath, getNodeAddonHeadersPath } from "./headers.js";
import {
  createFramework,
  createXCframework,
  DEFAULT_APPLE_TRIPLETS,
  determineXCFrameworkFilename,
  getAppleBuildArgs,
  getAppleConfigureCmakeArgs,
  isAppleTriplet,
} from "./apple.js";
import chalk from "chalk";

// We're attaching a lot of listeners when spawning in parallel
process.stdout.setMaxListeners(100);
process.stderr.setMaxListeners(100);

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

const appleOption = new Option("--apple", "Enable all apple triplets");

export const program = new Command("react-native-node-api-cmake")
  .description("Build React Native Node API modules with CMake")
  .addOption(sourcePathOption)
  .addOption(configurationOption)
  .addOption(tripletOption)
  .addOption(appleOption)
  .addOption(buildPathOption)
  .addOption(outPathOption)
  .addOption(cleanOption)
  .action(async ({ triplet: tripletValues, ...globalContext }) => {
    try {
      const spinner = ora();
      const buildPath = getBuildPath(globalContext);
      if (globalContext.clean) {
        fs.rmSync(buildPath, { recursive: true, force: true });
      }
      const triplets = new Set<SupportedTriplet>(tripletValues);
      if (globalContext.apple) {
        for (const triplet of DEFAULT_APPLE_TRIPLETS) {
          triplets.add(triplet);
        }
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
      try {
        spinner.start("Configuring projects");
        await Promise.all(
          tripletContext.map((context) => configureProject(context))
        );
      } finally {
        spinner.stop();
      }

      // Build every triplet project
      try {
        spinner.start("Building projects");
        await Promise.all(
          tripletContext.map(async (context) => {
            // Delete any stale build artifacts before building
            // This is important, since we might rename the output files
            fs.rmSync(context.tripletOutputPath, {
              recursive: true,
              force: true,
            });
            await buildProject(context);
          })
        );
      } finally {
        spinner.stop();
      }

      // Collect triplets in vendor specific containers
      const appleTriplets = tripletContext.filter(({ triplet }) =>
        isAppleTriplet(triplet)
      );
      if (appleTriplets.length > 0) {
        const libraryPaths = appleTriplets.flatMap(({ tripletOutputPath }) => {
          const configSpecifcPath = path.join(
            tripletOutputPath,
            globalContext.configuration
          );
          assert(
            fs.existsSync(configSpecifcPath),
            `Expected a directory at ${configSpecifcPath}`
          );
          // Expect binary file(s), either .node or .dylib
          return fs.readdirSync(configSpecifcPath).map((file) => {
            const filePath = path.join(configSpecifcPath, file);
            if (filePath.endsWith(".dylib")) {
              return filePath;
            } else if (file.endsWith(".node")) {
              // Rename the file to .dylib for xcodebuild to accept it
              const newFilePath = filePath.replace(/\.node$/, ".dylib");
              fs.renameSync(filePath, newFilePath);
              return newFilePath;
            } else {
              throw new Error(
                `Expected a .node or .dylib file, but found ${file}`
              );
            }
          });
        });
        const frameworkPaths = libraryPaths.map(createFramework);
        const xcframeworkFilename =
          determineXCFrameworkFilename(frameworkPaths);

        // Create the xcframework
        const xcframeworkOutputPath = path.resolve(
          // Defaults to storing the xcframework next to the CMakeLists.txt file
          globalContext.out || globalContext.source,
          xcframeworkFilename
        );

        try {
          spinner.start("Assembling XCFramework");
          await createXCframework({
            outputPath: xcframeworkOutputPath,
            libraryPaths: [],
            frameworkPaths,
          });
        } finally {
          spinner.stop();
        }

        console.log(
          chalk.greenBright("✓"),
          "XCFramework created at",
          chalk.dim(path.relative(process.cwd(), xcframeworkOutputPath))
        );
      }
    } catch (error) {
      if (error instanceof SpawnFailure) {
        error.flushOutput("both");
        console.error();
        console.error(chalk.redBright("✖"), error.message);
        process.exitCode = 1;
      } else {
        process.exitCode = 2;
        throw error;
      }
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

function getTripletConfigureCmakeArgs(triplet: SupportedTriplet) {
  if (isAppleTriplet(triplet)) {
    return getAppleConfigureCmakeArgs(triplet);
  } else {
    throw new Error(`Support for '${triplet}' is not implemented yet`);
  }
}

function getBuildArgs(triplet: SupportedTriplet) {
  if (isAppleTriplet(triplet)) {
    return getAppleBuildArgs();
  } else {
    throw new Error(`Support for '${triplet}' is not implemented yet`);
  }
}

async function configureProject(context: TripletScopedContext) {
  const { triplet, tripletBuildPath, source } = context;
  const variables = getVariables(context);
  const variablesArgs = Object.entries(variables).flatMap(([key, value]) => [
    "-D",
    `${key}=${value}`,
  ]);

  await spawn(
    "cmake",
    [
      "-S",
      source,
      "-B",
      tripletBuildPath,
      ...variablesArgs,
      ...getTripletConfigureCmakeArgs(triplet),
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
  const includePaths = [getNodeApiHeadersPath(), getNodeAddonHeadersPath()];
  for (const includePath of includePaths) {
    assert(
      !includePath.includes(";"),
      `Include path with a ';' is not supported: ${includePath}`
    );
  }
  return {
    CMAKE_JS_INC: includePaths.join(";"),
    CMAKE_LIBRARY_OUTPUT_DIRECTORY: context.tripletOutputPath,
  };
}
