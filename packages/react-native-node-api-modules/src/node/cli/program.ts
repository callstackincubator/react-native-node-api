import path from "node:path";
import fs from "node:fs";

import { Command } from "@commander-js/extra-typings";
import {
  findDuplicates,
  findPackageDependencyPaths,
  findXCFrameworkPaths,
  rebuildXcframeworkHashed,
  XCFRAMEWORKS_PATH,
} from "./helpers";

export const program = new Command("react-native-node-api-modules");

program
  .command("copy-xcframeworks")
  .argument("<installation-root>", "Parent directory of the Podfile", (p) =>
    path.resolve(process.cwd(), p)
  )
  .action((installationRoot: string) => {
    console.log(
      `Copying Node-API xcframeworks with ${process.execPath} into ${XCFRAMEWORKS_PATH}`
    );
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
    const xcframeworks = Object.entries(dependenciesByName).flatMap(
      ([, dependency]) => {
        return dependency.xcframeworkPaths.map((xcframeworkPath) => {
          return rebuildXcframeworkHashed(
            path.join(dependency.path, xcframeworkPath)
          );
        });
      }
    );

    const duplicates = findDuplicates(xcframeworks, ({ path }) => path);
    for (const duplicate of duplicates) {
      console.warn(
        `Warning: Duplicate xcframework found: ${duplicate}. This may cause issues.`
      );
    }

    for (const xcframework of xcframeworks) {
      // TODO: Print some info about the xcframework (including the hash)
      // const isDuplicate = duplicates.has(xcframework);
      console.log(xcframework.path);
    }
  });
