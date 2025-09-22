import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs";
import { EventEmitter } from "node:events";

import {
  chalk,
  Command,
  Option,
  spawn,
  oraPromise,
  assertFixable,
  wrapAction,
  setVerbose,
} from "@react-native-node-api/cli-utils";
import { isSupportedTriplet } from "react-native-node-api";

import { getWeakNodeApiVariables } from "./weak-node-api.js";
import {
  platforms,
  allTriplets as allTriplets,
  findPlatformForTriplet,
  platformHasTriplet,
} from "./platforms.js";
import { BaseOpts, TripletContext, Platform } from "./platforms/types.js";

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

// TODO: Derive default build triplets
// This is especially important when driving the build from within a React Native app package.

const { CMAKE_RN_TRIPLETS } = process.env;

const defaultTriplets = CMAKE_RN_TRIPLETS ? CMAKE_RN_TRIPLETS.split(",") : [];

for (const triplet of defaultTriplets) {
  assert(
    (allTriplets as string[]).includes(triplet),
    `Unexpected triplet in CMAKE_RN_TRIPLETS: ${triplet}`,
  );
}

const tripletOption = new Option(
  "--triplet <triplet...>",
  "Triplets to build for",
)
  .choices(allTriplets)
  .default(
    defaultTriplets,
    "CMAKE_RN_TRIPLETS environment variable split by ','",
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

const defineOption = new Option(
  "-D,--define <entry...>",
  "Define cache variables passed when configuring projects",
).argParser<Record<string, string | CmakeTypedDefinition>>(
  (input, previous = {}) => {
    // TODO: Implement splitting of value using a regular expression (using named groups) for the format <var>[:<type>]=<value>
    // and return an object keyed by variable name with the string value as value or alternatively an array of [value, type]
    const match = input.match(
      /^(?<name>[^:=]+)(:(?<type>[^=]+))?=(?<value>.+)$/,
    );
    if (!match || !match.groups) {
      throw new Error(
        `Invalid format for -D/--define argument: ${input}. Expected <var>[:<type>]=<value>`,
      );
    }
    const { name, type, value } = match.groups;
    return { ...previous, [name]: type ? { value, type } : value };
  },
);

const targetOption = new Option(
  "--target <target...>",
  "CMake targets to build",
).default([] as string[], "Build all targets of the CMake project");

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
  .addOption(tripletOption)
  .addOption(verboseOption)
  .addOption(sourcePathOption)
  .addOption(buildPathOption)
  .addOption(outPathOption)
  .addOption(configurationOption)
  .addOption(defineOption)
  .addOption(cleanOption)
  .addOption(targetOption)
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
  wrapAction(async ({ triplet: requestedTriplets, ...baseOptions }) => {
    setVerbose(baseOptions.verbose);
    assertFixable(
      fs.existsSync(path.join(baseOptions.source, "CMakeLists.txt")),
      `No CMakeLists.txt found in source directory: ${chalk.dim(baseOptions.source)}`,
      {
        instructions: `Change working directory into a directory with a CMakeLists.txt, create one or specify the correct source directory using --source`,
      },
    );

    const buildPath = getBuildPath(baseOptions);
    if (baseOptions.clean) {
      await fs.promises.rm(buildPath, { recursive: true, force: true });
    }
    const triplets = new Set<string>(requestedTriplets);

    for (const platform of Object.values(platforms)) {
      // Forcing the types a bit here, since the platform id option is dynamically added
      if ((baseOptions as Record<string, unknown>)[platform.id]) {
        for (const triplet of platform.triplets) {
          triplets.add(triplet);
        }
      }
    }

    if (triplets.size === 0) {
      for (const platform of Object.values(platforms)) {
        if (platform.isSupportedByHost()) {
          for (const triplet of await platform.defaultTriplets()) {
            triplets.add(triplet);
          }
        }
      }
      if (triplets.size === 0) {
        throw new Error(
          "Found no default build triplets: Install some platform specific build tools",
        );
      } else {
        console.error(
          chalk.yellowBright("ℹ"),
          "Using default build triplets",
          chalk.dim("(" + [...triplets].join(", ") + ")"),
        );
      }
    }

    if (!baseOptions.out) {
      baseOptions.out = path.join(buildPath, baseOptions.configuration);
    }

    const tripletContexts = [...triplets].map((triplet) => {
      const platform = findPlatformForTriplet(triplet);
      const tripletBuildPath = getTripletBuildPath(buildPath, triplet);
      return {
        triplet,
        platform,
        buildPath: tripletBuildPath,
        outputPath: path.join(tripletBuildPath, "out"),
        options: baseOptions,
      };
    });

    // Configure every triplet project
    const tripletsSummary = chalk.dim(
      `(${getTripletsSummary(tripletContexts)})`,
    );
    await oraPromise(
      Promise.all(
        tripletContexts.map(({ platform, ...context }) =>
          configureProject(platform, context, baseOptions),
        ),
      ),
      {
        text: `Configuring projects ${tripletsSummary}`,
        isSilent: baseOptions.verbose,
        successText: `Configured projects ${tripletsSummary}`,
        failText: ({ message }) => `Failed to configure projects: ${message}`,
      },
    );

    // Build every triplet project
    await oraPromise(
      Promise.all(
        tripletContexts.map(async ({ platform, ...context }) => {
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
      const relevantTriplets = tripletContexts.filter(({ triplet }) =>
        platformHasTriplet(platform, triplet),
      );
      if (relevantTriplets.length == 0) {
        continue;
      }
      await platform.postBuild(
        {
          outputPath: baseOptions.out || baseOptions.source,
          triplets: relevantTriplets,
        },
        baseOptions,
      );
    }
  }),
);

function getTripletsSummary(
  tripletContexts: { triplet: string; platform: Platform }[],
) {
  const tripletsPerPlatform: Record<string, string[]> = {};
  for (const { triplet, platform } of tripletContexts) {
    if (!tripletsPerPlatform[platform.id]) {
      tripletsPerPlatform[platform.id] = [];
    }
    tripletsPerPlatform[platform.id].push(triplet);
  }
  return Object.entries(tripletsPerPlatform)
    .map(([platformId, triplets]) => {
      return `${platformId}: ${triplets.join(", ")}`;
    })
    .join(" / ");
}

function getBuildPath({ build, source }: BaseOpts) {
  // TODO: Add configuration (debug vs release)
  return path.resolve(process.cwd(), build || path.join(source, "build"));
}

/**
 * Namespaces the output path with a triplet name
 */
function getTripletBuildPath(buildPath: string, triplet: unknown) {
  assert(typeof triplet === "string", "Expected triplet to be a string");
  return path.join(buildPath, triplet.replace(/;/g, "_"));
}

async function configureProject<T extends string>(
  platform: Platform<T[], Record<string, unknown>>,
  context: TripletContext<T>,
  options: BaseOpts,
) {
  const { triplet, buildPath, outputPath } = context;
  const { verbose, source, weakNodeApiLinkage } = options;

  const nodeApiDefinitions =
    weakNodeApiLinkage && isSupportedTriplet(triplet)
      ? getWeakNodeApiVariables(triplet)
      : // TODO: Make this a part of the platform definition
        {};

  const definitions = {
    ...nodeApiDefinitions,
    ...options.define,
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
      ...toDefineArguments(definitions),
    ],
    {
      outputMode: verbose ? "inherit" : "buffered",
      outputPrefix: verbose ? chalk.dim(`[${triplet}] `) : undefined,
    },
  );
}

async function buildProject<T extends string>(
  platform: Platform<T[], Record<string, unknown>>,
  context: TripletContext<T>,
  options: BaseOpts,
) {
  const { triplet, buildPath } = context;
  const { verbose, configuration } = options;
  await spawn(
    "cmake",
    [
      "--build",
      buildPath,
      "--config",
      configuration,
      ...(options.target.length > 0 ? ["--target", ...options.target] : []),
      "--",
      ...platform.buildArgs(context, options),
    ],
    {
      outputMode: verbose ? "inherit" : "buffered",
      outputPrefix: verbose ? chalk.dim(`[${triplet}] `) : undefined,
    },
  );
}

type CmakeTypedDefinition = { value: string; type: string };

function toDefineArguments(
  declarations: Record<string, string | CmakeTypedDefinition>,
) {
  return Object.entries(declarations).flatMap(([key, definition]) => {
    if (typeof definition === "string") {
      return ["-D", `${key}=${definition}`];
    } else {
      return ["-D", `${key}:${definition.type}=${definition.value}`];
    }
  });
}

export { program };
