import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs";
import { EventEmitter } from "node:events";

import { Command, Option } from "@commander-js/extra-typings";
import { spawn, SpawnFailure } from "bufout";
import { oraPromise } from "ora";
import chalk from "chalk";

import { getWeakNodeApiVariables } from "./weak-node-api.js";
import {
  platforms,
  allTargets,
  findPlatformForTarget,
  platformHasTarget,
} from "./platforms.js";
import { BaseOpts, TargetContext, Platform } from "./platforms/types.js";
import { isSupportedTriplet } from "react-native-node-api";

// We're attaching a lot of listeners when spawning in parallel
EventEmitter.defaultMaxListeners = 100;

// TODO: Add automatic ccache support

const verboseOption = new Option(
  "--verbose",
  "Print more output during the build",
).default(process.env.CI === "true");

const sourcePathOption = new Option(
  "--source <path>",
  "Specify the source directory containing a CMakeLists.txt file",
).default(process.cwd());

// TODO: Add "MinSizeRel" and "RelWithDebInfo"
const configurationOption = new Option("--configuration <configuration>")
  .choices(["Release", "Debug"] as const)
  .default("Release");

// TODO: Derive default targets
// This is especially important when driving the build from within a React Native app package.

const { CMAKE_RN_TARGETS } = process.env;

const defaultTargets = CMAKE_RN_TARGETS ? CMAKE_RN_TARGETS.split(",") : [];

for (const target of defaultTargets) {
  assert(
    (allTargets as string[]).includes(target),
    `Unexpected target in CMAKE_RN_TARGETS: ${target}`,
  );
}

const targetOption = new Option("--target <target...>", "Targets to build for")
  .choices(allTargets)
  .default(
    defaultTargets,
    "CMAKE_RN_TARGETS environment variable split by ','",
  );

const buildPathOption = new Option(
  "--build <path>",
  "Specify the build directory to store the configured CMake project",
);

const cleanOption = new Option(
  "--clean",
  "Delete the build directory before configuring the project",
);

const outPathOption = new Option(
  "--out <path>",
  "Specify the output directory to store the final build artifacts",
).default(false, "./{build}/{configuration}");

const noAutoLinkOption = new Option(
  "--no-auto-link",
  "Don't mark the output as auto-linkable by react-native-node-api",
);

const noWeakNodeApiLinkageOption = new Option(
  "--no-weak-node-api-linkage",
  "Don't pass the path of the weak-node-api library from react-native-node-api",
);

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
    `Enable all ${platform.name} triplets`,
  );
  program = program.addOption(allOption);
  program = platform.amendCommand(program);
}

program = program.action(
  async ({ target: requestedTargets, ...baseOptions }) => {
    try {
      const buildPath = getBuildPath(baseOptions);
      if (baseOptions.clean) {
        await fs.promises.rm(buildPath, { recursive: true, force: true });
      }
      const targets = new Set<string>(requestedTargets);

      for (const platform of Object.values(platforms)) {
        // Forcing the types a bit here, since the platform id option is dynamically added
        if ((baseOptions as Record<string, unknown>)[platform.id]) {
          for (const target of platform.targets) {
            targets.add(target);
          }
        }
      }

      if (targets.size === 0) {
        for (const platform of Object.values(platforms)) {
          if (platform.isSupportedByHost()) {
            for (const target of await platform.defaultTargets()) {
              targets.add(target);
            }
          }
        }
        if (targets.size === 0) {
          throw new Error(
            "Found no default targets: Install some platform specific build tools",
          );
        } else {
          console.error(
            chalk.yellowBright("ℹ"),
            "Using default targets",
            chalk.dim("(" + [...targets].join(", ") + ")"),
          );
        }
      }

      if (!baseOptions.out) {
        baseOptions.out = path.join(buildPath, baseOptions.configuration);
      }

      const targetContexts = [...targets].map((target) => {
        const platform = findPlatformForTarget(target);
        const targetBuildPath = getTargetBuildPath(buildPath, target);
        return {
          target,
          platform,
          buildPath: targetBuildPath,
          outputPath: path.join(targetBuildPath, "out"),
          options: baseOptions,
        };
      });

      // Configure every triplet project
      const targetsSummary = chalk.dim(
        `(${getTargetsSummary(targetContexts)})`,
      );
      await oraPromise(
        Promise.all(
          targetContexts.map(({ platform, ...context }) =>
            configureProject(platform, context, baseOptions),
          ),
        ),
        {
          text: `Configuring projects ${targetsSummary}`,
          isSilent: baseOptions.verbose,
          successText: `Configured projects ${targetsSummary}`,
          failText: ({ message }) => `Failed to configure projects: ${message}`,
        },
      );

      // Build every triplet project
      await oraPromise(
        Promise.all(
          targetContexts.map(async ({ platform, ...context }) => {
            // Delete any stale build artifacts before building
            // This is important, since we might rename the output files
            await fs.promises.rm(context.outputPath, {
              recursive: true,
              force: true,
            });
            await buildProject(platform, context, baseOptions);
          }),
        ),
        {
          text: "Building projects",
          isSilent: baseOptions.verbose,
          successText: "Built projects",
          failText: ({ message }) => `Failed to build projects: ${message}`,
        },
      );

      // Perform post-build steps for each platform in sequence
      for (const platform of platforms) {
        const relevantTargets = targetContexts.filter(({ target }) =>
          platformHasTarget(platform, target),
        );
        if (relevantTargets.length == 0) {
          continue;
        }
        await platform.postBuild(
          {
            outputPath: baseOptions.out || baseOptions.source,
            targets: relevantTargets,
          },
          baseOptions,
        );
      }
    } catch (error) {
      if (error instanceof SpawnFailure) {
        error.flushOutput("both");
      }
      throw error;
    }
  },
);

function getTargetsSummary(
  targetContexts: { target: string; platform: Platform }[],
) {
  const targetsPerPlatform: Record<string, string[]> = {};
  for (const { target, platform } of targetContexts) {
    if (!targetsPerPlatform[platform.id]) {
      targetsPerPlatform[platform.id] = [];
    }
    targetsPerPlatform[platform.id].push(target);
  }
  return Object.entries(targetsPerPlatform)
    .map(([platformId, targets]) => {
      return `${platformId}: ${targets.join(", ")}`;
    })
    .join(" / ");
}

function getBuildPath({ build, source }: BaseOpts) {
  // TODO: Add configuration (debug vs release)
  return path.resolve(process.cwd(), build || path.join(source, "build"));
}

/**
 * Namespaces the output path with a target name
 */
function getTargetBuildPath(buildPath: string, target: unknown) {
  assert(typeof target === "string", "Expected target to be a string");
  return path.join(buildPath, target.replace(/;/g, "_"));
}

async function configureProject<T extends string>(
  platform: Platform<T[], Record<string, unknown>>,
  context: TargetContext<T>,
  options: BaseOpts,
) {
  const { target, buildPath, outputPath } = context;
  const { verbose, source, weakNodeApiLinkage } = options;

  const nodeApiVariables =
    weakNodeApiLinkage && isSupportedTriplet(target)
      ? getWeakNodeApiVariables(target)
      : // TODO: Make this a part of the platform definition
        {};

  const declarations = {
    ...nodeApiVariables,
    CMAKE_LIBRARY_OUTPUT_DIRECTORY: outputPath,
  };

  await spawn(
    "cmake",
    [
      "-S",
      source,
      "-B",
      buildPath,
      ...platform.configureArgs(context, options),
      ...toDeclarationArguments(declarations),
    ],
    {
      outputMode: verbose ? "inherit" : "buffered",
      outputPrefix: verbose ? chalk.dim(`[${target}] `) : undefined,
    },
  );
}

async function buildProject<T extends string>(
  platform: Platform<T[], Record<string, unknown>>,
  context: TargetContext<T>,
  options: BaseOpts,
) {
  const { target, buildPath } = context;
  const { verbose, configuration } = options;
  await spawn(
    "cmake",
    [
      "--build",
      buildPath,
      "--config",
      configuration,
      "--",
      ...platform.buildArgs(context, options),
    ],
    {
      outputMode: verbose ? "inherit" : "buffered",
      outputPrefix: verbose ? chalk.dim(`[${target}] `) : undefined,
    },
  );
}

function toDeclarationArguments(declarations: Record<string, string>) {
  return Object.entries(declarations).flatMap(([key, value]) => [
    "-D",
    `${key}=${value}`,
  ]);
}

export { program };
