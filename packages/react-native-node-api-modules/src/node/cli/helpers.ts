import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs/promises";
import { readdirSync, existsSync, statSync } from "node:fs";
import { createRequire } from "node:module";

import { spawn } from "bufout";
import { packageDirectorySync } from "pkg-dir";
import { readPackageSync } from "read-pkg";

import { NamingStrategy, hashModulePath } from "../path-utils.js";

// Must be in all xcframeworks to be considered as Node-API modules
export const MAGIC_FILENAME = "react-native-node-api-module";
export const XCFRAMEWORKS_PATH = path.resolve(
  __dirname,
  "../../../xcframeworks"
);
export const DEFAULT_EXCLUDE_PATTERNS = [/\/node_modules\//, /\/.git\//];

export function resolvePackageRoot(
  requireFromPackageRoot: NodeJS.Require,
  packageName: string
): string | undefined {
  try {
    const resolvedPath = requireFromPackageRoot.resolve(packageName);
    return packageDirectorySync({ cwd: resolvedPath });
  } catch {
    // TODO: Add a debug log here
    return undefined;
  }
}

/**
 * Get the latest modification time of all files in a directory and its subdirectories.
 */
function getLatestMtime(dir: string): number {
  const entries = readdirSync(dir, {
    withFileTypes: true,
    recursive: true,
  });

  let latest = 0;

  for (const entry of entries) {
    if (entry.isFile()) {
      const fullPath = path.join(entry.parentPath, entry.name);
      const stat = statSync(fullPath);
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
  const packageRoot = packageDirectorySync({ cwd: path.dirname(from) });
  assert(packageRoot, `Could not find package root from ${from}`);

  const requireFromPackageRoot = createRequire(
    path.join(packageRoot, "noop.js")
  );

  const { dependencies = {} } = readPackageSync({ cwd: packageRoot });

  return Object.fromEntries(
    Object.keys(dependencies)
      .map((dependencyName) => {
        const resolvedDependencyRoot = resolvePackageRoot(
          requireFromPackageRoot,
          dependencyName
        );
        return resolvedDependencyRoot
          ? [dependencyName, resolvedDependencyRoot]
          : undefined;
      })
      .filter((item) => typeof item !== "undefined")
  );
}

export type FindXCFrameworkOptions = {
  excludePatterns?: RegExp[];
};

/**
 * Recursively search into a directory for xcframeworks containing Node-API modules.
 * TODO: Turn this asynchronous
 */
export function findXCFrameworkPaths(
  fromPath: string,
  options: FindXCFrameworkOptions = {},
  suffix = ""
): string[] {
  const candidatePath = path.join(fromPath, suffix);
  const { excludePatterns = DEFAULT_EXCLUDE_PATTERNS } = options;
  return readdirSync(candidatePath, { withFileTypes: true }).flatMap((file) => {
    if (
      file.isFile() &&
      file.name === MAGIC_FILENAME &&
      path.extname(candidatePath) === ".xcframework"
    ) {
      return [candidatePath];
    } else if (file.isDirectory()) {
      const newSuffix = path.join(suffix, file.name);
      if (!excludePatterns.some((pattern) => pattern.test(newSuffix))) {
        // Traverse into the child directory
        return findXCFrameworkPaths(fromPath, options, newSuffix);
      }
    }
    return [];
  });
}

/**
 * Finds all dependencies of the app package and their xcframeworks.
 */
export function findPackageDependencyPathsAndXcframeworks(
  installationRoot: string,
  options: FindXCFrameworkOptions = {}
) {
  // Find the location of each dependency
  const dependencyPathsByName = findPackageDependencyPaths(installationRoot);
  // Find all their xcframeworks
  return Object.fromEntries(
    Object.entries(dependencyPathsByName)
      .map(([dependencyName, dependencyPath]) => {
        // Make all the xcframeworks relative to the dependency path
        const xcframeworkPaths = findXCFrameworkPaths(
          dependencyPath,
          options
        ).map((p) => path.relative(dependencyPath, p));
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
export async function updateInfoPlist({
  filePath,
  oldLibraryName,
  newLibraryName,
}: UpdateInfoPlistOptions) {
  const infoPlistContents = await fs.readFile(filePath, "utf-8");
  // TODO: Use a proper plist parser
  const updatedContents = infoPlistContents.replaceAll(
    oldLibraryName,
    newLibraryName
  );
  await fs.writeFile(filePath, updatedContents, "utf-8");
}

type RebuildXcframeworkOptions = {
  modulePath: string;
  incremental: boolean;
  naming: NamingStrategy;
};

type VendoredXcframework = {
  originalPath: string;
  outputPath: string;
} & (
  | {
      hash: string;
      packageName?: never;
    }
  | {
      hash?: never;
      packageName: string;
    }
);

type VendoredXcframeworkResult = VendoredXcframework & {
  skipped: boolean;
};

export function determineVendoredXcframeworkDetails(
  modulePath: string,
  naming: NamingStrategy
): VendoredXcframework {
  if (naming === "hash") {
    const hash = hashModulePath(modulePath);
    return {
      hash,
      originalPath: modulePath,
      outputPath: path.join(XCFRAMEWORKS_PATH, `node-api-${hash}.xcframework`),
    };
  } else {
    const packageRoot = packageDirectorySync({ cwd: modulePath });
    assert(packageRoot, `Could not find package root from ${modulePath}`);
    const { name } = readPackageSync({ cwd: packageRoot });
    assert(name, `Could not find package name from ${packageRoot}`);
    return {
      packageName: name,
      originalPath: modulePath,
      outputPath: path.join(XCFRAMEWORKS_PATH, `${name}.xcframework`),
    };
  }
}

export function hasDuplicatesWhenVendored(
  modulePaths: string[],
  naming: NamingStrategy
): boolean {
  const outputPaths = modulePaths.map((modulePath) => {
    const { outputPath } = determineVendoredXcframeworkDetails(
      modulePath,
      naming
    );
    return outputPath;
  });
  const uniqueNames = new Set(outputPaths);
  return uniqueNames.size !== outputPaths.length;
}

export async function vendorXcframework({
  modulePath,
  incremental,
  naming,
}: RebuildXcframeworkOptions): Promise<VendoredXcframeworkResult> {
  // Copy the xcframework to the output directory and rename the framework and binary
  const details = determineVendoredXcframeworkDetails(modulePath, naming);
  const { outputPath } = details;
  const discriminator =
    typeof details.hash === "string" ? details.hash : details.packageName;
  const tempPath = path.join(
    XCFRAMEWORKS_PATH,
    `node-api-${discriminator}-temp`
  );
  try {
    if (incremental && existsSync(outputPath)) {
      const moduleModified = getLatestMtime(modulePath);
      const outputModified = getLatestMtime(outputPath);
      if (moduleModified < outputModified) {
        return { ...details, skipped: true };
      }
    }
    // Delete any existing xcframework (or xcodebuild will try to amend it)
    await fs.rm(outputPath, { recursive: true, force: true });
    await fs.cp(modulePath, tempPath, { recursive: true });

    const frameworkPaths = await Promise.all(
      readdirSync(tempPath, {
        withFileTypes: true,
      })
        .filter((tripletEntry) => tripletEntry.isDirectory())
        .flatMap((tripletEntry) => {
          const tripletPath = path.join(tempPath, tripletEntry.name);
          return readdirSync(tripletPath, {
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
              const newLibraryName = path.basename(
                details.outputPath,
                ".xcframework"
              );
              const newFrameworkPath = path.join(
                tripletPath,
                `${newLibraryName}.framework`
              );
              const newLibraryPath = path.join(
                newFrameworkPath,
                newLibraryName
              );
              assert(
                existsSync(oldLibraryPath),
                `Expected a library at '${oldLibraryPath}'`
              );
              // Rename the library
              await fs.rename(
                oldLibraryPath,
                // Cannot use newLibraryPath here, because the framework isn't renamed yet
                path.join(frameworkPath, newLibraryName)
              );
              // Rename the framework
              await fs.rename(frameworkPath, newFrameworkPath);
              // Expect the library in the new location
              assert(existsSync(newLibraryPath));
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
              await updateInfoPlist({
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

    return { ...details, skipped: false };
  } finally {
    await fs.rm(tempPath, { recursive: true, force: true });
  }
}
