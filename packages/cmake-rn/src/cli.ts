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
} from "@react-native-node-api/cli-utils";

import {
  platforms,
  allTriplets as allTriplets,
  findPlatformForTriplet,
  platformHasTriplet,
} from "./platforms.js";
import { Platform } from "./platforms/types.js";
import { getCcachePath } from "./ccache.js";

// We're attaching a lot of listeners when spawning in parallel
EventEmitter.defaultMaxListeners = 100;

const verboseOption = new Option(
  "--verbose",
  "Print more output during the build",
).default(process.env.CI === "true");

const sourcePathOption = new Option(
  "--source <path>",
  "Specify the source directory containing a CMakeLists.txt file",
).default(process.cwd());

const configurationOption = new Option("--configuration <configuration>")
  .choices(["Release", "Debug", "RelWithDebInfo", "MinSizeRel"] as const)
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
).default("{source}/build");

const cleanOption = new Option(
  "--clean",
  "Delete the build directory before configuring the project",
);

const outPathOption = new Option(
  "--out <path>",
  "Specify the output directory to store the final build artifacts",
).default("{build}/{configuration}");

const defineOption = new Option(
  "-D,--define <entry...>",
  "Define cache variables passed when configuring projects",
)
  .argParser<Record<string, string>[]>((input, previous = []) => {
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
    previous.push({ [type ? `${name}:${type}` : name]: value });
    return previous;
  })
  .default([]);

const targetOption = new Option(
  "--target <target...>",
  "CMake targets to build",
).default([] as string[], "Build all targets of the CMake project");

const stripOption = new Option(
  "--strip",
  "Strip debug symbols from the final binaries",
).default(false);

const noAutoLinkOption = new Option(
  "--no-auto-link",
  "Don't mark the output as auto-linkable by react-native-node-api",
);

const noWeakNodeApiLinkageOption = new Option(
  "--no-weak-node-api-linkage",
  "Don't pass the path of the weak-node-api library from react-native-node-api",
);

const cmakeJsOption = new Option(
  "--cmake-js",
  "Define CMAKE_JS_* variables used for compatibility with cmake-js",
).default(false);

const ccachePathOption = new Option(
  "--ccache-path <path>",
  "Specify the path to the ccache executable",
).default(getCcachePath());

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
  .addOption(stripOption)
  .addOption(noAutoLinkOption)
  .addOption(noWeakNodeApiLinkageOption)
  .addOption(cmakeJsOption)
  .addOption(ccachePathOption);

for (const platform of platforms) {
  const allOption = new Option(
    `--${platform.id}`,
    `Enable all ${platform.name} triplets`,
  );
  program = program.addOption(allOption);
  program = platform.amendCommand(program);
}

function expandTemplate(
  input: string,
  values: Record<string, unknown>,
): string {
  return input.replaceAll(/{([^}]+)}/g, (_, key: string) =>
    typeof values[key] === "string" ? values[key] : "",
  );
}

program = program.action(
  wrapAction(async ({ triplet: requestedTriplets, ...baseOptions }) => {
    baseOptions.build = path.resolve(
      process.cwd(),
      expandTemplate(baseOptions.build, baseOptions),
    );
    baseOptions.out = path.resolve(
      process.cwd(),
      expandTemplate(baseOptions.out, baseOptions),
    );
    const {
      verbose,
      clean,
      source,
      out,
      build: buildPath,
      ccachePath,
    } = baseOptions;

    assertFixable(
      fs.existsSync(path.join(source, "CMakeLists.txt")),
      `No CMakeLists.txt found in source directory: ${chalk.dim(source)}`,
      {
        instructions: `Change working directory into a directory with a CMakeLists.txt, create one or specify the correct source directory using --source`,
      },
    );

    if (ccachePath) {
      console.log(`♻️ Using ccache: ${chalk.dim(ccachePath)}`);
    }

    if (clean) {
      await fs.promises.rm(buildPath, { recursive: true, force: true });
    }
    const triplets = new Set<string>(requestedTriplets);

    for (const platform of Object.values(platforms)) {
      // Forcing the types a bit here, since the platform id option is dynamically added
      if ((baseOptions as Record<string, unknown>)[platform.id]) {
        for (const triplet of await platform.defaultTriplets("all")) {
          triplets.add(triplet);
        }
      }
    }

    if (triplets.size === 0) {
      for (const platform of Object.values(platforms)) {
        if (platform.isSupportedByHost()) {
          for (const triplet of await platform.defaultTriplets(
            "current-development",
          )) {
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

    const tripletContexts = [...triplets].map((triplet) => {
      const platform = findPlatformForTriplet(triplet);

      assert(
        platform.isSupportedByHost(),
        `Triplet '${triplet}' cannot be built, as the '${platform.name}' platform is not supported on a '${process.platform}' host.`,
      );

      return {
        triplet,
        platform,
        async spawn(command: string, args: string[], cwd?: string) {
          const outputPrefix = verbose ? chalk.dim(`[${triplet}] `) : undefined;
          if (verbose) {
            console.log(
              `${outputPrefix}» ${command} ${args.map((arg) => chalk.dim(`${arg}`)).join(" ")}`,
              cwd ? `(in ${chalk.dim(cwd)})` : "",
            );
          }
          await spawn(command, args, {
            outputMode: verbose ? "inherit" : "buffered",
            outputPrefix,
            cwd,
          });
        },
      };
    });

    // Configure every triplet project
    const tripletsSummary = chalk.dim(
      `(${getTripletsSummary(tripletContexts)})`,
    );

    // Perform configure steps for each platform in sequence
    await oraPromise(
      Promise.all(
        platforms.map(async (platform) => {
          const relevantTriplets = tripletContexts.filter(({ triplet }) =>
            platformHasTriplet(platform, triplet),
          );
          if (relevantTriplets.length > 0) {
            await platform.configure(
              relevantTriplets,
              baseOptions,
              (command, args, cwd) =>
                spawn(command, args, {
                  outputMode: verbose ? "inherit" : "buffered",
                  outputPrefix: verbose
                    ? chalk.dim(`[${platform.name}] `)
                    : undefined,
                  cwd,
                }),
            );
          }
        }),
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
          // TODO: Consider if this is still important 😬
          // // Delete any stale build artifacts before building
          // // This is important, since we might rename the output files
          // await fs.promises.rm(context.outputPath, {
          //   recursive: true,
          //   force: true,
          // });
          await platform.build(context, baseOptions);
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
      await platform.postBuild(out, relevantTriplets, baseOptions);
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

export { program };
