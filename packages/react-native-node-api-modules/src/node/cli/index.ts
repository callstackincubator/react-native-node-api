import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs";
import cp from "node:child_process";
import { createRequire } from "node:module";

import { Command } from "@commander-js/extra-typings";

import { hashNodeApiModulePath } from "../path-utils.js";

// Must be in all xcframeworks to be considered as Node-API modules
const MAGIC_FILENAME = "react-native-node-api-module";
const XCFRAMEWORKS_PATH = path.resolve(__dirname, "../../../xcframeworks");

/**
 * Search upwards from a directory to find a package.json and
 * return a list of the resolved paths of all dependencies of that package.
 */
export function findPackageDependencyPaths(
  from: string
): Record<string, string> {
  const candidatePath = path.join(from, "package.json");
  const parentDir = path.dirname(from);
  if (fs.existsSync(candidatePath)) {
    const require = createRequire(from);
    const contents = fs.readFileSync(candidatePath, "utf-8");
    const json = JSON.parse(contents) as unknown;
    // Assert the package.json has the expected structure
    assert(
      typeof json === "object" && json !== null,
      "Expected package.json to be an object"
    );
    if (
      "dependencies" in json &&
      typeof json.dependencies === "object" &&
      json.dependencies !== null
    ) {
      return Object.fromEntries(
        Object.keys(json.dependencies)
          .map((dependencyName) => {
            try {
              return [
                dependencyName,
                path.dirname(require.resolve(`${dependencyName}/package.json`)),
              ];
            } catch {
              return undefined;
            }
          })
          .filter((item) => typeof item !== "undefined")
      );
    } else {
      return {};
    }
  } else if (parentDir === from) {
    throw new Error("package.json not found in any parent directory");
  } else {
    return findPackageDependencyPaths(parentDir);
  }
}

export function findXCFrameworkPaths(dependencyPath: string): string[] {
  return fs
    .readdirSync(dependencyPath, { withFileTypes: true })
    .flatMap((file) => {
      if (
        file.isFile() &&
        file.name === MAGIC_FILENAME &&
        path.extname(dependencyPath) === ".xcframework"
      ) {
        return [dependencyPath];
      } else if (file.isDirectory()) {
        // Traverse into the child directory
        return findXCFrameworkPaths(path.join(dependencyPath, file.name));
      }
      return [];
    });
}

type UpdateInfoPlistOptions = {
  filePath: string;
  oldLibraryName: string;
  newLibraryName: string;
};

export function updateInfoPlist({
  filePath,
  oldLibraryName,
  newLibraryName,
}: UpdateInfoPlistOptions) {
  // TODO: Use a proper plist parser
  const infoPlistContents = fs.readFileSync(filePath, "utf-8");
  const updatedContents = infoPlistContents.replaceAll(
    oldLibraryName,
    newLibraryName
  );
  fs.writeFileSync(filePath, updatedContents, "utf-8");
}

export function rebuildXcframeworkHashed(modulePath: string) {
  // Copy the xcframework to the output directory and rename the framework and binary
  const hash = hashNodeApiModulePath(modulePath);
  const tempPath = path.join(XCFRAMEWORKS_PATH, `node-api-${hash}-temp`);
  try {
    const outputPath = path.join(
      XCFRAMEWORKS_PATH,
      `node-api-${hash}.xcframework`
    );

    fs.cpSync(modulePath, tempPath, { recursive: true });

    const frameworkPaths = fs
      .readdirSync(tempPath, {
        withFileTypes: true,
      })
      .flatMap((tripletEntry) => {
        if (tripletEntry.isDirectory()) {
          const tripletPath = path.join(tempPath, tripletEntry.name);
          return fs
            .readdirSync(tripletPath, {
              withFileTypes: true,
            })
            .flatMap((frameworkEntry) => {
              if (
                frameworkEntry.isDirectory() &&
                path.extname(frameworkEntry.name) === ".framework"
              ) {
                const frameworkPath = path.join(
                  tripletPath,
                  frameworkEntry.name
                );
                const oldLibraryName = path.basename(
                  frameworkEntry.name,
                  ".framework"
                );
                const oldLibraryPath = path.join(frameworkPath, oldLibraryName);
                const newLibraryName = `node-api-${hash}`;
                const newFrameworkPath = path.join(
                  tripletPath,
                  `${newLibraryName}.framework`
                );
                const newLibraryPath = path.join(
                  newFrameworkPath,
                  newLibraryName
                );
                assert(
                  fs.existsSync(oldLibraryPath),
                  `Expected a library at '${oldLibraryPath}'`
                );
                // Rename the library
                fs.renameSync(
                  oldLibraryPath,
                  // Cannot use newLibraryPath here, because the framework isn't renamed yet
                  path.join(frameworkPath, `node-api-${hash}`)
                );
                // Rename the framework
                fs.renameSync(frameworkPath, newFrameworkPath);
                // Expect the library in the new location
                assert(fs.existsSync(newLibraryPath));
                // Update the binary
                const { status } = cp.spawnSync("install_name_tool", [
                  "-id",
                  `@rpath/${newLibraryName}.framework/${newLibraryName}`,
                  newLibraryPath,
                ]);
                assert.equal(status, 0, "Failed to update the library id");
                // Update the Info.plist file for the framework
                updateInfoPlist({
                  filePath: path.join(newFrameworkPath, "Info.plist"),
                  oldLibraryName,
                  newLibraryName,
                });
                return newFrameworkPath;
              } else {
                return [];
              }
            });
        } else {
          return [];
        }
      });

    // Create a new xcframework from the renamed frameworks
    const { status } = cp.spawnSync("xcodebuild", [
      "-create-xcframework",
      ...frameworkPaths.flatMap((frameworkPath) => [
        "-framework",
        frameworkPath,
      ]),
      "-output",
      outputPath,
    ]);
    assert.equal(status, 0, "Failed to create xcframework");

    return outputPath;
  } finally {
    fs.rmSync(tempPath, { recursive: true, force: true });
  }
}

export const program = new Command("react-native-node-api-modules");

program
  .command("link-xcframework-paths")
  .argument("<installation-root>", "Parent directory of the Podfile", (p) =>
    path.resolve(process.cwd(), p)
  )
  .action((installationRoot: string) => {
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
    const xcframeworkPaths = Object.entries(dependenciesByName).flatMap(
      ([, dependency]) => {
        return dependency.xcframeworkPaths.map((xcframeworkPath) => {
          return rebuildXcframeworkHashed(
            path.join(dependency.path, xcframeworkPath)
          );
        });
      }
    );
    console.log(JSON.stringify(xcframeworkPaths, null, 2));
  });

export function run(argv: string[]) {
  program.parse(argv);
}
