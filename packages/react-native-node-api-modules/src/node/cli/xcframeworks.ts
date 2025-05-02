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
  getLibraryName,
  normalizeModulePath,
} from "../path-utils";

// We're attaching a lot of listeners when spawning in parallel
EventEmitter.defaultMaxListeners = 100;

export const command = new Command("xcframeworks").description(
  "Working with Node-API xcframeworks"
);

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

const { NODE_API_MODULES_STRIP_PATH_SUFFIX } = process.env;
assert(
  typeof NODE_API_MODULES_STRIP_PATH_SUFFIX === "undefined" ||
  NODE_API_MODULES_STRIP_PATH_SUFFIX === "true" ||
  NODE_API_MODULES_STRIP_PATH_SUFFIX === "false",
  "Expected NODE_API_MODULES_STRIP_PATH_SUFFIX to be either 'true' or 'false'"
);

const stripPathSuffixOption = new Option(
  "--strip-path-suffix",
  "Don't append escaped relative path to the library names (entails one Node-API module per package)"
).default(NODE_API_MODULES_STRIP_PATH_SUFFIX === "true");

command
  .command("copy")
  .option(
    "--podfile <file-path>",
    "Path to the Podfile",
    path.resolve("./ios/Podfile")
  )
  .option(
    "--force",
    "Don't check timestamps of input files to skip unnecessary rebuilds",
    false
  )
  .option("--prune", "Delete xcframeworks that are no longer auto-linked", true)
  .addOption(stripPathSuffixOption)
  .action(async ({ podfile, force, prune, stripPathSuffix }) => {
    if (stripPathSuffix) {
      console.log(
        chalk.yellowBright("Warning:"),
        "Stripping path suffixes, which might lead to name collisions"
      );
    }
    const xcframeworks = await copyXCFrameworks({
      installationRoot: path.resolve(podfile),
      incremental: !force,
      naming: { stripPathSuffix },
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

command
  .command("info <path>")
  .description(
    "Utility to print, module path, the hash of a single xcframework"
  )
  .addOption(stripPathSuffixOption)
  .action((pathInput, { stripPathSuffix }) => {
    const resolvedModulePath = path.resolve(pathInput);
    const normalizedModulePath = normalizeModulePath(resolvedModulePath);
    const { packageName, relativePath } =
      determineModuleContext(resolvedModulePath);
    const libraryName = getLibraryName(resolvedModulePath, {
      stripPathSuffix,
    });
    console.log({
      resolvedModulePath,
      normalizedModulePath,
      packageName,
      relativePath,
      libraryName,
    });
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
  naming: NamingStrategy
) {
  const libraryNamesPerPath = Object.fromEntries(
    xcframeworkPaths.map((xcframeworkPath) => [
      xcframeworkPath,
      getLibraryName(xcframeworkPath, naming),
    ])
  );
  const duplicates = findDuplicates(Object.values(libraryNamesPerPath));
  for (const [xcframeworkPath, libraryName] of Object.entries(
    libraryNamesPerPath
  )) {
    const duplicated = duplicates.has(libraryName);
    console.log(
      " ↳",
      prettyPath(xcframeworkPath),
      duplicated
        ? chalk.redBright(`(${libraryName})`)
        : chalk.greenBright(`(${libraryName})`)
    );
  }
}

command
  .command("list")
  .description("Lists Node-API module XCFrameworks")
  .option(
    "--podfile <file-path>",
    "List all Node-API frameworks of an app, based off the Podfile"
  )
  .option(
    "--dependency <dir-path>",
    "List all Node-API frameworks of a single dependency"
  )
  .option("--json", "Output as JSON", false)
  .addOption(stripPathSuffixOption)
  .action(
    async ({
      podfile: podfileArg,
      dependency: dependencyArg,
      json,
      stripPathSuffix,
    }) => {
      if (stripPathSuffix) {
        console.log(
          chalk.yellowBright("Warning:"),
          "Stripping path suffixes might lead to name collisions"
        );
      }
      if (podfileArg) {
        const rootPath = path.dirname(path.resolve(podfileArg));
        const dependencies =
          findPackageDependencyPathsAndXcframeworks(rootPath);

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
              ),
              { stripPathSuffix }
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
          logXcframeworkPaths(xcframeworkPaths, { stripPathSuffix });
        }
      } else {
        throw new Error("Expected either --podfile or --package option");
      }
    }
  );
