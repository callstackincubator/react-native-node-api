import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs";

import { Command } from "@commander-js/extra-typings";
import { SpawnFailure } from "bufout";
import chalk from "chalk";
import ora from "ora";

import {
  findPackageDependencyPaths,
  findXCFrameworkPaths,
  rebuildXcframeworkHashed,
  XCFRAMEWORKS_PATH,
} from "./helpers";

// We're attaching a lot of listeners when spawning in parallel
process.stdout.setMaxListeners(100);
process.stderr.setMaxListeners(100);

export const program = new Command("react-native-node-api-modules");

function prettyPath(p: string) {
  return chalk.dim(path.relative(process.cwd(), p));
}

type CopyXCFrameworksOptions = {
  installationRoot: string;
  incremental: boolean;
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
}: CopyXCFrameworksOptions): Promise<XCFrameworkOutput[]> {
  const spinner = ora(
    `Copying Node-API xcframeworks into ${prettyPath(XCFRAMEWORKS_PATH)}`
  ).start();
  try {
    // Find the location of each dependency
    const dependencyPathsByName = findPackageDependencyPaths(installationRoot);
    // Find all their xcframeworks
    const dependenciesByName = Object.fromEntries(
      Object.entries(dependencyPathsByName)
        .map(([dependencyName, dependencyPath]) => {
          // Make all the xcframeworks relative to the dependency path
          const xcframeworkPaths = findXCFrameworkPaths(dependencyPath).map(
            (p) => path.relative(dependencyPath, p)
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
    // Create symbolic links for each xcframework found in dependencies
    return await Promise.all(
      Object.entries(dependenciesByName).flatMap(([, dependency]) => {
        return dependency.xcframeworkPaths.map(async (xcframeworkPath) => {
          const originalPath = path.join(dependency.path, xcframeworkPath);
          try {
            return await rebuildXcframeworkHashed({
              modulePath: originalPath,
              incremental,
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
    );
  } finally {
    spinner.stop();
  }
}

// TODO: Consider adding a flag to drive the build of the original xcframeworks too

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
  .option("--prune", "Delete xcframeworks that are no longer auto-linked", true)
  .action(async (installationRoot: string, { force, prune }) => {
    const xcframeworks = await copyXCFrameworks({
      installationRoot,
      incremental: !force,
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
