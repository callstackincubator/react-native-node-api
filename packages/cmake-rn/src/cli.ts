import path from "node:path";
import fs from "node:fs";
import { EventEmitter } from "node:events";

import { Command, Option } from "@commander-js/extra-typings";
import { spawn, SpawnFailure } from "bufout";
import { oraPromise } from "ora";
import chalk from "chalk";

import { isAndroidTriplet, isAppleTriplet } from "react-native-node-api";

import { getWeakNodeApiVariables } from "./weak-node-api.js";

import { platforms, allTargets, Target } from "./platforms.js";
import { PostBuildContext } from "./platforms/types.js";

// We're attaching a lot of listeners when spawning in parallel
EventEmitter.defaultMaxListeners = 100;

// TODO: Add automatic ccache support

const verboseOption = new Option(
  "--verbose",
  "Print more output during the build"
).default(process.env.CI === "true");

const sourcePathOption = new Option(
  "--source <path>",
  "Specify the source directory containing a CMakeLists.txt file"
).default(process.cwd());

// TODO: Add "MinSizeRel" and "RelWithDebInfo"
const configurationOption = new Option("--configuration <configuration>")
  .choices(["Release", "Debug"] as const)
  .default("Release");

// TODO: Derive default targets
// This is especially important when driving the build from within a React Native app package.

const targetOption = new Option(
  "--target <target...>",
  "Targets to build for"
).choices(allTargets);

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
).default(false, "./{build}/{configuration}");

const noAutoLinkOption = new Option(
  "--no-auto-link",
  "Don't mark the output as auto-linkable by react-native-node-api"
);

const noWeakNodeApiLinkageOption = new Option(
  "--no-weak-node-api-linkage",
  "Don't pass the path of the weak-node-api library from react-native-node-api"
);

/*
  .addOption(androidOption)
  .addOption(appleOption)
  .addOption(ndkVersionOption)
  .addOption(androidSdkVersionOption)
  .addOption(xcframeworkExtensionOption)
 */

let program = new Command("cmake-rn")
  .description("Build React Native Node API modules with CMake")
  .addOption(targetOption)
  .addOption(verboseOption)
  .addOption(sourcePathOption)
  .addOption(buildPathOption)
  .addOption(outPathOption)
  .addOption(configurationOption)
  .addOption(cleanOption)
  .addOption(noAutoLinkOption)
  .addOption(noWeakNodeApiLinkageOption);

for (const platform of platforms) {
  const allOption = new Option(
    `--${platform.id}`,
    `Enable all ${platform.name} triplets`
  );
  for (const option of [allOption, ...platform.options]) {
    program = program.addOption(option);
  }
}

program = program.action(
  async ({ target: requestedTargets, ...globalContext }) => {
    try {
      const buildPath = getBuildPath(globalContext);
      if (globalContext.clean) {
        await fs.promises.rm(buildPath, { recursive: true, force: true });
      }
      const targets = new Set<Target>(requestedTargets);

      for (const platform of platforms) {
        if (platform.id in globalContext && globalContext[platform.id]) {
          for (const target of platform.targets) {
            targets.add(target);
          }
        }
      }

      if (targets.size === 0) {
        for (const platform of platforms) {
          if (platform.isSupportedByHost()) {
            for (const target of platform.defaultTargets()) {
              targets.add(target);
            }
          }
        }
        if (targets.size === 0) {
          throw new Error(
            "Found no default targets: Install some platform specific build tools"
          );
        } else {
          console.error(
            chalk.yellowBright("ℹ"),
            "Using default targets",
            chalk.dim("(" + [...targets].join(", ") + ")")
          );
        }
      }

      if (!globalContext.out) {
        globalContext.out = path.join(buildPath, globalContext.configuration);
      }

      const targetContexts = [...targets].map((target) => {
        const targetBuildPath = getTargetBuildPath(buildPath, target);
        return {
          ...globalContext,
          target,
          targetBuildPath,
          targetOutputPath: path.join(targetBuildPath, "out"),
        };
      });

      // Configure every triplet project
      await oraPromise(Promise.all(targetContexts.map(configureProject)), {
        text: "Configuring projects",
        isSilent: globalContext.verbose,
        successText: "Configured projects",
        failText: ({ message }) => `Failed to configure projects: ${message}`,
      });

      // Build every triplet project
      await oraPromise(
        Promise.all(
          targetContexts.map(async (context) => {
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
          isSilent: globalContext.verbose,
          successText: "Built projects",
          failText: ({ message }) => `Failed to build projects: ${message}`,
        }
      );

      // Perform post-build steps for each platform in sequence
      for (const platform of platforms) {
        const platformTargets = targetContexts.map(
          ({ triplet, tripletOutputPath }) => ({
            target: triplet,
            outputPath: tripletOutputPath,
          })
        );
        if (platformTargets.length > 0) {
          await platform.postBuild({
            configuration: globalContext.configuration,
            outputPath: globalContext.out || globalContext.source,
            prepareAutoLinking: globalContext.autoLink,
            targets: platformTargets,
          });
        }
      }

      // Collect targets in vendor specific containers
      const appleTriplets = targetContexts.filter(({ triplet }) =>
        isAppleTriplet(triplet)
      );

      const androidTriplets = targetContexts.filter(({ triplet }) =>
        isAndroidTriplet(triplet)
      );
      if (androidTriplets.length > 0) {
        // TODO: Call with `globalContext.out || globalContext.source`
      }
    } catch (error) {
      if (error instanceof SpawnFailure) {
        error.flushOutput("both");
      }
      throw error;
    }
  }
);

type GlobalContext = ReturnType<typeof program.optsWithGlobals>;
type TargetScopedContext = Omit<GlobalContext, "target"> & {
  target: Target;
  targetBuildPath: string;
  targetOutputPath: string;
};

function getBuildPath(context: GlobalContext) {
  // TODO: Add configuration (debug vs release)
  return path.resolve(
    process.cwd(),
    context.build || path.join(context.source, "build")
  );
}

/**
 * Namespaces the output path with a target name
 */
function getTargetBuildPath(buildPath: string, target: Target) {
  return path.join(buildPath, target.replace(/;/g, "_"));
}

function getTargetConfigureCmakeArgs(
  triplet: Target,
  {
    ndkVersion,
    androidSdkVersion,
  }: Pick<
    GlobalContext,
    "ndkVersion" | "androidSdkVersion" | "weakNodeApiLinkage"
  >
) {
  if (isAndroidTriplet(triplet)) {
    return getAndroidConfigureCmakeArgs({
      triplet,
      ndkVersion,
      sdkVersion: androidSdkVersion,
    });
  } else if (isAppleTriplet(triplet)) {
    return getAppleConfigureCmakeArgs({ triplet });
  } else {
    throw new Error(`Support for '${triplet}' is not implemented yet`);
  }
}

function getBuildArgs(triplet: Target) {
  if (isAndroidTriplet(triplet)) {
    return [];
  } else if (isAppleTriplet(triplet)) {
    return getAppleBuildArgs();
  } else {
    throw new Error(`Support for '${triplet}' is not implemented yet`);
  }
}

async function configureProject(context: TargetScopedContext) {
  const {
    verbose,
    target,
    targetBuildPath,
    source,
    ndkVersion,
    androidSdkVersion,
    weakNodeApiLinkage,
  } = context;
  await spawn(
    "cmake",
    [
      "-S",
      source,
      "-B",
      targetBuildPath,
      ...getVariablesArgs(getVariables(context)),
      ...getTargetConfigureCmakeArgs(target, {
        ndkVersion,
        weakNodeApiLinkage,
        androidSdkVersion,
      }),
    ],
    {
      outputMode: verbose ? "inherit" : "buffered",
      outputPrefix: verbose ? chalk.dim(`[${target}] `) : undefined,
    }
  );
}

async function buildProject(context: TargetScopedContext) {
  const { verbose, target, targetBuildPath, configuration } = context;
  await spawn(
    "cmake",
    [
      "--build",
      targetBuildPath,
      "--config",
      configuration,
      "--",
      ...getBuildArgs(target),
    ],
    {
      outputMode: verbose ? "inherit" : "buffered",
      outputPrefix: verbose ? chalk.dim(`[${target}] `) : undefined,
    }
  );
}

function getVariables(context: TargetScopedContext): Record<string, string> {
  return {
    ...(context.weakNodeApiLinkage && getWeakNodeApiVariables(context.target)),
    CMAKE_LIBRARY_OUTPUT_DIRECTORY: context.targetOutputPath,
  };
}

function getVariablesArgs(variables: Record<string, string>) {
  return Object.entries(variables).flatMap(([key, value]) => [
    "-D",
    `${key}=${value}`,
  ]);
}

export { program };
