import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs";
import { findDuplicates } from "./duplicates";
import chalk from "chalk";
import { packageDirectorySync } from "pkg-dir";
import { readPackageSync } from "read-pkg";
import { createRequire } from "node:module";

// TODO: Change to .apple.node
export const PLATFORMS = ["android", "apple"] as const;
export type PlatformName = "android" | "apple";

export const PLATFORM_EXTENSIONS = {
  android: ".android.node",
  apple: ".apple.node",
} as const satisfies Record<PlatformName, string>;
export type PlatformExtentions = (typeof PLATFORM_EXTENSIONS)[PlatformName];

export type NamingStrategy = {
  stripPathSuffix: boolean;
};

// Cache mapping package directory to package name across calls
const packageNameCache = new Map<string, string>();

/**
 * @param modulePath  Batch-scans the path to the module to check (must be extensionless or end in .node)
 * @returns True if a platform specific prebuild exists for the module path, warns on unreadable modules.
 * @throws If the parent directory cannot be read, or if a detected module is unreadable.
 * TODO: Consider checking for a specific platform extension.
 */
export function isNodeApiModule(modulePath: string): boolean {
  {
    // HACK: Take a shortcut (if applicable): existing `.node` files are addons
    try {
      fs.accessSync(modulePath.endsWith(".node") ? modulePath : `${modulePath}.node`);
      return true;
    } catch { /* empty */ }
  }
  const dir = path.dirname(modulePath);
  const baseName = path.basename(modulePath, ".node");
  let entries: string[];
  try {
    entries = fs.readdirSync(dir);
  } catch {
    // Cannot read directory: treat as no module
    return false;
  }
  return Object.values(PLATFORM_EXTENSIONS).some((extension) => {
    const fileName = baseName + extension;
    if (!entries.includes(fileName)) {
      return false;
    }
    
    const filePath = path.join(dir, fileName);
    
    try {
      // First, check if file exists (works the same on all platforms)
      fs.accessSync(filePath, fs.constants.F_OK);
      
      // Then check if it's readable (behavior differs by platform)
      if (!isReadableSync(filePath)) {
        throw new Error(`Found an unreadable module ${fileName}`);
      }
    } catch (err) {
      throw new Error(`Found an unreadable module ${fileName}`, { cause: err });
    }
    return true;
  });
}

/**
 * Check if a path is readable according to permission bits.
 * On Windows, tests store POSIX S_IWUSR bit in stats.mode.
 * On Unix-like, uses fs.accessSync for R_OK.
 */
function isReadableSync(p: string): boolean {
  try {
    if (process.platform === "win32") {
      const stats = fs.statSync(p);
      return !!(stats.mode & fs.constants.S_IWUSR);
    } else {
      fs.accessSync(p, fs.constants.R_OK);
      return true;
    }
  } catch {
    return false;
  }
}

/**
 * Strip of any platform specific extensions from a module path.
 */
export function stripExtension(modulePath: string) {
  return [...Object.values(PLATFORM_EXTENSIONS), ".node"].reduce(
    (modulePath, extension) => {
      if (modulePath.endsWith(extension)) {
        return modulePath.slice(0, -extension.length);
      } else {
        return modulePath;
      }
    },
    modulePath
  );
}

export type ModuleContext = {
  packageName: string;
  relativePath: string;
};

/**
 * Traverse the filesystem upward to find a name for the package that which contains a file.
 */
export function determineModuleContext(
  modulePath: string,
  originalPath = modulePath
): ModuleContext {
  // Locate nearest package directory
  const pkgDir = packageDirectorySync({ cwd: modulePath });
  if (!pkgDir) {
    throw new Error("Could not find containing package");
  }
  // Read and cache package name
  let pkgName = packageNameCache.get(pkgDir);
  if (!pkgName) {
    const pkg = readPackageSync({ cwd: pkgDir });
    assert(
      typeof pkg.name === "string",
      "Expected package.json to have a name"
    );
    pkgName = pkg.name;
    packageNameCache.set(pkgDir, pkgName);
  }
  // Compute module-relative path
  const relPath = normalizeModulePath(path.relative(pkgDir, originalPath));
  return { packageName: pkgName, relativePath: relPath };
}

export function normalizeModulePath(modulePath: string) {
  const dirname = path.normalize(path.dirname(modulePath));
  const basename = path.basename(modulePath);
  const strippedBasename = stripExtension(basename).replace(/^lib/, "");
  // Replace backslashes with forward slashes for cross-platform compatibility
  return path.join(dirname, strippedBasename).replaceAll("\\", "/");
}

export function escapePath(modulePath: string) {
  return modulePath.replace(/[^a-zA-Z0-9]/g, "-");
}

/**
 * Get the name of the library which will be used when the module is linked in.
 */
export function getLibraryName(modulePath: string, naming: NamingStrategy) {
  const { packageName, relativePath } = determineModuleContext(modulePath);
  return naming.stripPathSuffix
    ? packageName
    : `${packageName}--${escapePath(relativePath)}`;
}

export function prettyPath(p: string) {
  return chalk.dim(
    path.relative(process.cwd(), p) || chalk.italic("current directory")
  );
}

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

export function logModulePaths(
  modulePaths: string[],
  // TODO: Default to iterating and printing for all supported naming strategies
  naming: NamingStrategy
) {
  const pathsPerName = new Map<string, string[]>();
  for (const modulePath of modulePaths) {
    const libraryName = getLibraryName(modulePath, naming);
    const existingPaths = pathsPerName.get(libraryName) ?? [];
    existingPaths.push(modulePath);
    pathsPerName.set(libraryName, existingPaths);
  }

  const allModulePaths = modulePaths.map((modulePath) => modulePath);
  const duplicatePaths = findDuplicates(allModulePaths);
  for (const [libraryName, modulePaths] of pathsPerName) {
    console.log(
      chalk.greenBright(`${libraryName}`),
      ...modulePaths.flatMap((modulePath) => {
        const line = duplicatePaths.has(modulePath)
          ? chalk.redBright(prettyPath(modulePath))
          : prettyPath(modulePath);
        return `\n ↳ ${line}`;
      })
    );
  }
}

/**
 * Search upwards from a directory to find a package.json and
 * return a record mapping from each dependencies of that package to their path on disk.
 */
export function findPackageDependencyPaths(
  fromPath: string
): Record<string, string> {
  const packageRoot = packageDirectorySync({ cwd: fromPath });
  assert(packageRoot, `Could not find package root from ${fromPath}`);

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

export const MAGIC_FILENAME = "react-native-node-api-module";

/**
 * Default patterns to use when excluding paths from the search for Node-API modules.
 */
export const DEFAULT_EXCLUDE_PATTERNS = [
  /\/react-native-node-api-modules\//,
  /\/node_modules\//,
  /\/.git\//,
];

export function hasPlatformExtension(
  platform: PlatformName | Readonly<PlatformName[]>,
  fileName: string
): boolean {
  if (typeof platform === "string") {
    return fileName.endsWith(PLATFORM_EXTENSIONS[platform]);
  } else {
    return platform.some((p) => hasPlatformExtension(p, fileName));
  }
}

export type FindNodeApiModuleOptions = {
  fromPath: string;
  excludePatterns?: RegExp[];
  platform: PlatformName | Readonly<PlatformName[]>;
};

/**
 * Recursively search into a directory for xcframeworks containing Node-API modules.
 * TODO: Turn this asynchronous
 */
export function findNodeApiModulePaths(
  options: FindNodeApiModuleOptions,
  suffix = ""
): string[] {
  const {
    fromPath,
    platform,
    excludePatterns = DEFAULT_EXCLUDE_PATTERNS,
  } = options;
  if (excludePatterns.some((pattern) => pattern.test(suffix))) {
    return [];
  }
  const candidatePath = path.join(fromPath, suffix);
  // Normalize path separators for consistent pattern matching on all platforms
  const normalizedSuffix = suffix.split(path.sep).join('/');
  
  if (excludePatterns.some((pattern) => pattern.test(normalizedSuffix))) {
    return [];
  }
  
  return fs
    .readdirSync(candidatePath, { withFileTypes: true })
    .flatMap((file) => {
      if (
        file.isFile() &&
        file.name === MAGIC_FILENAME &&
        hasPlatformExtension(platform, candidatePath)
      ) {
        return [candidatePath];
      } else if (file.isDirectory()) {
        // Traverse into the child directory
        return findNodeApiModulePaths(options, path.join(suffix, file.name));
      }
      return [];
    });
}

/**
 * Finds all dependencies of the app package and their xcframeworks.
 */
export function findNodeApiModulePathsByDependency({
  fromPath,
  includeSelf,
  ...options
}: FindNodeApiModuleOptions & {
  includeSelf: boolean;
}) {
  // Find the location of each dependency
  const packagePathsByName = findPackageDependencyPaths(fromPath);
  if (includeSelf) {
    const packageRoot = packageDirectorySync({ cwd: fromPath });
    assert(packageRoot, `Could not find package root from ${fromPath}`);
    const { name } = readPackageSync({ cwd: packageRoot });
    packagePathsByName[name] = packageRoot;
  }
  // Find all their xcframeworks
  return Object.fromEntries(
    Object.entries(packagePathsByName)
      .map(([dependencyName, dependencyPath]) => {
        // Make all the xcframeworks relative to the dependency path
        const modulePaths = findNodeApiModulePaths({
          fromPath: dependencyPath,
          ...options,
        }).map((p) => path.relative(dependencyPath, p));
        return [
          dependencyName,
          {
            path: dependencyPath,
            modulePaths,
          },
        ] as const;
      })
      // Remove any dependencies without module paths
      .filter(([, { modulePaths }]) => modulePaths.length > 0)
  );
}

/**
 * Determine the library basename (no file extension nor "lib" prefix) based on the library paths.
 * Errors if all framework paths doesn't produce the same basename.
 */
export function determineLibraryBasename(libraryPaths: string[]) {
  const libraryNames = libraryPaths.map((p) =>
    // Strip the "lib" prefix and any file extension
    path.basename(p, path.extname(p)).replace(/^lib/, "")
  );
  const candidates = new Set<string>(libraryNames);
  assert(candidates.size === 1, "Expected all libraries to have the same name");
  const [name] = candidates;
  return name;
}

export function getAutolinkPath(platform: PlatformName) {
  const result = path.resolve(__dirname, "../../auto-linked", platform);
  fs.mkdirSync(result, { recursive: true });
  return result;
}

/**
 * Get the latest modification time of all files in a directory and its subdirectories.
 */
export function getLatestMtime(fromPath: string): number {
  const entries = fs.readdirSync(fromPath, {
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
