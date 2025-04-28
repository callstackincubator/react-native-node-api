import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs";
import { EventEmitter } from "node:stream";

import { Command, Option } from "@commander-js/extra-typings";
import { SpawnFailure } from "bufout";
import chalk from "chalk";
import { oraPromise } from "ora";

import {
  findPackageDependencyPaths,
  findPackageDependencyPathsAndXcframeworks,
  findXCFrameworkPaths,
  hasDuplicatesWhenVendored,
  vendorXcframework,
  XCFRAMEWORKS_PATH,
} from "./helpers";
import {
  NamingStrategy,
  determineModuleContext,
  getLibraryDiscriminator,
  hashModulePath,
} from "../path-utils";

// We're attaching a lot of listeners when spawning in parallel
EventEmitter.defaultMaxListeners = 100;

export const program = new Command("react-native-node-api-modules");

function prettyPath(p: string) {
  return chalk.dim(path.relative(process.cwd(), p));
}

type CopyXCFrameworksOptions = {
  installationRoot: string;
  incremental: boolean;
  naming: NamingStrategy;
};

type XCFrameworkOutputBase = {
  originalPath: string;
  skipped: boolean;
};

type XCFrameworkOutput = XCFrameworkOutputBase &
  (
    | { outputPath: string; failure?: never }
    | { outputPath?: never; failure: SpawnFailure }
  );

async function copyXCFrameworks({
  installationRoot,
  incremental,
  naming,
}: CopyXCFrameworksOptions): Promise<XCFrameworkOutput[]> {
  // Find the location of each dependency
  const dependencyPathsByName = findPackageDependencyPaths(installationRoot);
  // Find all their xcframeworks
  const dependenciesByName = Object.fromEntries(
    Object.entries(dependencyPathsByName)
      .map(([dependencyName, dependencyPath]) => {
        // Make all the xcframeworks relative to the dependency path
        const xcframeworkPaths = findXCFrameworkPaths(dependencyPath).map((p) =>
          path.relative(dependencyPath, p)
        );
        return [
          dependencyName,
          {
            path: dependencyPath,
            xcframeworkPaths,
          },
        ] as const;
      })
      // Remove any dependencies without xcframeworks
      .filter(([, { xcframeworkPaths }]) => xcframeworkPaths.length > 0)
  );

  // Create or clean the output directory
  fs.mkdirSync(XCFRAMEWORKS_PATH, { recursive: true });
  // Create vendored copies of xcframework found in dependencies

  const xcframeworksPaths = Object.entries(dependenciesByName).flatMap(
    ([, dependency]) => {
      return dependency.xcframeworkPaths.map((xcframeworkPath) =>
        path.join(dependency.path, xcframeworkPath)
      );
    }
  );

  if (hasDuplicatesWhenVendored(xcframeworksPaths, naming)) {
    // TODO: Make this prettier
    logXcframeworkPaths(xcframeworksPaths, naming);
    throw new Error("Found conflicting xcframeworks");
  }

  return oraPromise(
    Promise.all(
      Object.entries(dependenciesByName).flatMap(([, dependency]) => {
        return dependency.xcframeworkPaths.map(async (xcframeworkPath) => {
          const originalPath = path.join(dependency.path, xcframeworkPath);
          try {
            return await vendorXcframework({
              modulePath: originalPath,
              incremental,
              naming,
            });
          } catch (error) {
            if (error instanceof SpawnFailure) {
              return {
                originalPath,
                skipped: false,
                failure: error,
              };
            } else {
              throw error;
            }
          }
        });
      })
    ),
    {
      text: `Copying Node-API xcframeworks into ${prettyPath(
        XCFRAMEWORKS_PATH
      )}`,
      successText: `Copied Node-API xcframeworks into ${prettyPath(
        XCFRAMEWORKS_PATH
      )}`,
      failText: (err) =>
        `Failed to copy Node-API xcframeworks into ${prettyPath(
          XCFRAMEWORKS_PATH
        )}: ${err.message}`,
    }
  );
}

// TODO: Consider adding a flag to drive the build of the original xcframeworks too

const { NODE_API_MODULES_NAMING = "package-name" } = process.env;
assert(
  typeof NODE_API_MODULES_NAMING === "undefined" ||
    NODE_API_MODULES_NAMING === "hash" ||
    NODE_API_MODULES_NAMING === "package-name",
  "Expected NODE_API_MODULES_NAMING to be either 'hash' or 'package-name'"
);

const namingStrategyOption = new Option(
  "--naming <strategy>",
  "Naming strategy to use when copying the xcframeworks"
)
  .choices(["hash", "package-name"] as const satisfies NamingStrategy[])
  .default(NODE_API_MODULES_NAMING as NamingStrategy);

program
  .command("copy-xcframeworks")
  .argument("<installation-root>", "Parent directory of the Podfile", (p) =>
    path.resolve(process.cwd(), p)
  )
  .option(
    "--force",
    "Don't check timestamps of input files to skip unnecessary rebuilds",
    false
  )
  .addOption(namingStrategyOption)
  .option("--prune", "Delete xcframeworks that are no longer auto-linked", true)
  .action(async (installationRoot: string, { force, prune, naming }) => {
    console.log(`Using ${naming} naming strategy`);
    const xcframeworks = await copyXCFrameworks({
      installationRoot,
      incremental: !force,
      naming,
    });

    const failures = xcframeworks.filter((result) => "failure" in result);
    const rebuilds = xcframeworks.filter((result) => "outputPath" in result);

    for (const xcframework of rebuilds) {
      const { originalPath, outputPath, skipped } = xcframework;
      const outputPart = outputPath
        ? "→ " + prettyPath(path.basename(outputPath))
        : "";
      if (skipped) {
        console.log(
          chalk.greenBright("✓"),
          "Skipped",
          prettyPath(originalPath),
          outputPart,
          "(already up to date)"
        );
      } else {
        console.log(
          chalk.greenBright("✓"),
          "Recreated",
          prettyPath(originalPath),
          outputPart
        );
      }
    }

    for (const { originalPath, failure } of failures) {
      assert(failure instanceof SpawnFailure);
      console.error(
        "\n",
        chalk.redBright("✖"),
        "Failed to copy",
        prettyPath(originalPath)
      );
      console.error(failure.message);
      failure.flushOutput("both");
      process.exitCode = 1;
    }

    if (prune && failures.length === 0) {
      // Pruning only when all xcframeworks are copied successfully
      const expectedPaths = new Set([
        ...rebuilds.map((xcframework) => xcframework.outputPath),
      ]);
      for (const entry of fs.readdirSync(XCFRAMEWORKS_PATH)) {
        const candidatePath = path.resolve(XCFRAMEWORKS_PATH, entry);
        if (!expectedPaths.has(candidatePath)) {
          console.log(
            "🧹Deleting extroneous xcframework",
            prettyPath(candidatePath)
          );
          fs.rmSync(candidatePath, { recursive: true, force: true });
        }
      }
    }
  });

program
  .command("hash-xcframework <path>")
  .description("Utility to print the hash of xcframeworks")
  .action((pathInput) => {
    const resolvedModulePath = path.resolve(pathInput);
    const { packageName, relativePath } =
      determineModuleContext(resolvedModulePath);
    const hash = hashModulePath(resolvedModulePath);
    console.log({ resolvedModulePath, packageName, relativePath, hash });
  });

function findDuplicates(values: string[]) {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) {
      duplicates.add(value);
    } else {
      seen.add(value);
    }
  }
  return duplicates;
}

function logXcframeworkPaths(
  xcframeworkPaths: string[],
  // TODO: Default to iterating and printing for all supported naming strategies
  naming?: NamingStrategy
) {
  const discriminatorsPerPath = Object.fromEntries(
    xcframeworkPaths.map((xcframeworkPath) => [
      xcframeworkPath,
      getLibraryDiscriminator(xcframeworkPath, naming),
    ])
  );
  const duplicates = findDuplicates(Object.values(discriminatorsPerPath));
  for (const [xcframeworkPath, discriminator] of Object.entries(
    discriminatorsPerPath
  )) {
    const duplicated = duplicates.has(discriminator);
    console.log(
      " ↳",
      prettyPath(xcframeworkPath),
      duplicated
        ? chalk.redBright(`(${discriminator})`)
        : chalk.greenBright(`(${discriminator})`)
    );
  }
}

program
  .command("print-xcframeworks")
  .description("Lists Node-API module XCFrameworks")
  .option("--podfile <file-path>", "Path of the App's Podfile")
  .option("--dependency <dir-path>", "Path of some dependency directory")
  .option("--json", "Output as JSON", false)
  .action(async ({ podfile: podfileArg, dependency: dependencyArg, json }) => {
    if (podfileArg) {
      const rootPath = path.dirname(path.resolve(podfileArg));
      const dependencies = findPackageDependencyPathsAndXcframeworks(rootPath);

      if (json) {
        console.log(JSON.stringify(dependencies, null, 2));
      } else {
        const dependencyCount = Object.keys(dependencies).length;
        const xframeworkCount = Object.values(dependencies).reduce(
          (acc, { xcframeworkPaths }) => acc + xcframeworkPaths.length,
          0
        );
        console.log(
          "Found",
          chalk.greenBright(xframeworkCount),
          "xcframeworks in",
          chalk.greenBright(dependencyCount),
          dependencyCount === 1 ? "dependency of" : "dependencies of",
          prettyPath(rootPath)
        );
        for (const [dependencyName, dependency] of Object.entries(
          dependencies
        )) {
          console.log(dependencyName, "→", prettyPath(dependency.path));
          logXcframeworkPaths(
            dependency.xcframeworkPaths.map((p) =>
              path.join(dependency.path, p)
            )
          );
        }
      }
    } else if (dependencyArg) {
      const dependencyPath = path.resolve(dependencyArg);
      const xcframeworkPaths = findXCFrameworkPaths(dependencyPath).map((p) =>
        path.relative(dependencyPath, p)
      );

      if (json) {
        console.log(JSON.stringify(xcframeworkPaths, null, 2));
      } else {
        console.log(
          "Found",
          chalk.greenBright(xcframeworkPaths.length),
          "of",
          prettyPath(dependencyPath)
        );
        logXcframeworkPaths(xcframeworkPaths);
      }
    } else {
      throw new Error("Expected either --podfile or --package option");
    }
  });
