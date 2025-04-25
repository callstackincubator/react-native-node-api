import path from "node:path";
import fs from "node:fs";
import { EventEmitter } from "node:events";

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

program
  .command("copy-xcframeworks")
  .argument("<installation-root>", "Parent directory of the Podfile", (p) =>
    path.resolve(process.cwd(), p)
  )
  .action(async (installationRoot: string) => {
    const spinner = ora(
      `Copying Node-API xcframeworks into ${prettyPath(XCFRAMEWORKS_PATH)}`
    ).start();
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

    // To be able to reference the xcframeworks from the Podspec,
    // we need them as sub-directories of the Podspec parent directory.
    // Create or clean the output directory
    fs.rmSync(XCFRAMEWORKS_PATH, { recursive: true, force: true });
    fs.mkdirSync(XCFRAMEWORKS_PATH, { recursive: true });
    // Create symbolic links for each xcframework found in dependencies
    const xcframeworks = await Promise.all(
      Object.entries(dependenciesByName).flatMap(([, dependency]) => {
        return dependency.xcframeworkPaths.map(async (xcframeworkPath) => {
          const originalPath = path.join(dependency.path, xcframeworkPath);
          try {
            return await rebuildXcframeworkHashed(originalPath);
          } catch (error) {
            if (error instanceof SpawnFailure) {
              return {
                originalPath,
                error,
              };
            } else {
              throw error;
            }
          }
        });
      })
    );

    spinner.stop();

    const failures = xcframeworks.filter((result) => "error" in result);

    const rebuilds = xcframeworks.filter((result) => "path" in result);

    for (const xcframework of rebuilds) {
      const { originalPath, path } = xcframework;
      console.log(
        `${chalk.greenBright("✓")} Rebuilt ${prettyPath(originalPath)}`
      );
      console.log(`  into ${prettyPath(path)}`);
    }

    for (const { originalPath, error } of failures) {
      console.error(
        "\n",
        chalk.redBright("✖"),
        "Failed to copy",
        prettyPath(originalPath)
      );
      console.error(error.message);
      error.flushOutput("both");
      process.exitCode = 1;
    }
  });
