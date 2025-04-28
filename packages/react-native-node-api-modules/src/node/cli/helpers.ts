import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs";
import { createRequire } from "node:module";

import { spawn } from "bufout";

import { hashModulePath } from "../path-utils.js";

// Must be in all xcframeworks to be considered as Node-API modules
export const MAGIC_FILENAME = "react-native-node-api-module";
export const XCFRAMEWORKS_PATH = path.resolve(
  __dirname,
  "../../../xcframeworks"
);

/**
 * Get the latest modification time of all files in a directory and its subdirectories.
 */
function getLatestMtime(dir: string): number {
  const entries = fs.readdirSync(dir, {
    withFileTypes: true,
    recursive: true,
  });

  let latest = 0;

  for (const entry of entries) {
    if (entry.isFile()) {
      const fullPath = path.join(entry.parentPath, entry.name);
      const stat = fs.statSync(fullPath);
      if (stat.mtimeMs > latest) {
        latest = stat.mtimeMs;
      }
    }
  }

  return latest;
}

/**
 * Search upwards from a directory to find a package.json and
 * return a record mapping from each dependencies of that package to their path on disk.
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
                path.dirname(
                  require.resolve(`${dependencyName}/package.json`, {
                    paths: [from],
                  })
                ),
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

/**
 * Recursively search into a directory for xcframeworks containing Node-API modules.
 */
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

/**
 * Finds all dependencies of the app package and their xcframeworks.
 */
export function findPackageDependencyPathsAndXcframeworks(
  installationRoot: string
) {
  // Find the location of each dependency
  const dependencyPathsByName = findPackageDependencyPaths(installationRoot);
  // Find all their xcframeworks
  return Object.fromEntries(
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
}

type UpdateInfoPlistOptions = {
  filePath: string;
  oldLibraryName: string;
  newLibraryName: string;
};

/**
 * Update the Info.plist file of an xcframework to use the new library name.
 */
export function updateInfoPlist({
  filePath,
  oldLibraryName,
  newLibraryName,
}: UpdateInfoPlistOptions) {
  const infoPlistContents = fs.readFileSync(filePath, "utf-8");
  // TODO: Use a proper plist parser
  const updatedContents = infoPlistContents.replaceAll(
    oldLibraryName,
    newLibraryName
  );
  fs.writeFileSync(filePath, updatedContents, "utf-8");
}

type RebuildXcframeworkOptions = {
  modulePath: string;
  incremental: boolean;
};

type HashedXCFramework = {
  originalPath: string;
  outputPath: string;
  skipped: boolean;
  hash: string;
};

export async function rebuildXcframeworkHashed({
  modulePath,
  incremental,
}: RebuildXcframeworkOptions): Promise<HashedXCFramework> {
  // Copy the xcframework to the output directory and rename the framework and binary
  const hash = hashModulePath(modulePath);
  const tempPath = path.join(XCFRAMEWORKS_PATH, `node-api-${hash}-temp`);
  try {
    const outputPath = path.join(
      XCFRAMEWORKS_PATH,
      `node-api-${hash}.xcframework`
    );
    if (incremental && fs.existsSync(outputPath)) {
      const moduleModified = getLatestMtime(modulePath);
      const outputModified = getLatestMtime(outputPath);
      if (moduleModified < outputModified) {
        return {
          skipped: true,
          outputPath,
          originalPath: modulePath,
          hash,
        };
      }
    }
    // Delete any existing xcframework (or xcodebuild will try to amend it)
    fs.rmSync(outputPath, { recursive: true, force: true });
    fs.cpSync(modulePath, tempPath, { recursive: true });

    const frameworkPaths = await Promise.all(
      fs
        .readdirSync(tempPath, {
          withFileTypes: true,
        })
        .filter((tripletEntry) => tripletEntry.isDirectory())
        .flatMap((tripletEntry) => {
          const tripletPath = path.join(tempPath, tripletEntry.name);
          return fs
            .readdirSync(tripletPath, {
              withFileTypes: true,
            })
            .filter(
              (frameworkEntry) =>
                frameworkEntry.isDirectory() &&
                path.extname(frameworkEntry.name) === ".framework"
            )
            .flatMap(async (frameworkEntry) => {
              const frameworkPath = path.join(tripletPath, frameworkEntry.name);
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
              await spawn(
                "install_name_tool",
                [
                  "-id",
                  `@rpath/${newLibraryName}.framework/${newLibraryName}`,
                  newLibraryPath,
                ],
                {
                  outputMode: "buffered",
                }
              );
              // Update the Info.plist file for the framework
              updateInfoPlist({
                filePath: path.join(newFrameworkPath, "Info.plist"),
                oldLibraryName,
                newLibraryName,
              });
              return newFrameworkPath;
            });
        })
    );

    // Create a new xcframework from the renamed frameworks
    await spawn(
      "xcodebuild",
      [
        "-create-xcframework",
        ...frameworkPaths.flatMap((frameworkPath) => [
          "-framework",
          frameworkPath,
        ]),
        "-output",
        outputPath,
      ],
      {
        outputMode: "buffered",
      }
    );

    return {
      skipped: false,
      outputPath,
      originalPath: modulePath,
      hash,
    };
  } finally {
    fs.rmSync(tempPath, { recursive: true, force: true });
  }
}
