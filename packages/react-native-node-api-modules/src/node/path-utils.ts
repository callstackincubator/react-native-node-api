import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";

// import { spawn } from "bufout";

export const NAMING_STATEGIES = ["hash", "package-name"] as const;
export type NamingStrategy = (typeof NAMING_STATEGIES)[number];

export function isNodeApiModule(modulePath: string): boolean {
  // Determine if we're trying to load a Node-API module
  // Strip optional .node extension
  const candidateBasePath = path.resolve(
    path.dirname(modulePath),
    path.basename(modulePath, ".node")
  );
  return [
    candidateBasePath + ".xcframework",
    // TODO: Add Android support
  ].some(fs.existsSync);
}

/**
 * Replaces any platform specific extensions with the common .node extension.
 */
export function stripExtension(modulePath: string) {
  return path.format({
    ...path.parse(modulePath),
    base: undefined,
    ext: undefined,
  });
}

/**
 * Replaces any platform specific extensions with the common .node extension.
 */
export function replaceWithNodeExtension(modulePath: string) {
  return path.format({
    ...path.parse(modulePath),
    base: undefined,
    ext: ".node",
  });
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
  const candidatePackageJsonPath = path.join(modulePath, "package.json");
  const parentDirectoryPath = path.dirname(modulePath);
  if (fs.existsSync(candidatePackageJsonPath)) {
    const packageJsonContent = fs.readFileSync(
      candidatePackageJsonPath,
      "utf8"
    );
    const packageJson = JSON.parse(packageJsonContent) as unknown;
    assert(
      typeof packageJson === "object" && packageJson !== null,
      "Expected package.json to be an object"
    );
    assert(
      "name" in packageJson && typeof packageJson.name === "string",
      "Expected package.json to have a name"
    );
    return {
      packageName: packageJson.name,
      relativePath: path.relative(modulePath, originalPath),
    };
  } else if (parentDirectoryPath === modulePath) {
    // We've reached the root of the filesystem
    throw new Error("Could not find containing package");
  } else {
    return determineModuleContext(parentDirectoryPath, originalPath);
  }
}

export function normalizeModulePath(modulePath: string) {
  // Transforming platform specific paths to a common path
  if (path.extname(modulePath) !== ".node") {
    modulePath = replaceWithNodeExtension(modulePath);
  }
  const { packageName, relativePath } = determineModuleContext(modulePath);
  return path.normalize(path.join(packageName, relativePath));
}

// export async function updateLibraryInstallPathInXCFramework(
//   xcframeworkPath: string
// ) {
//   for (const file of fs.readdirSync(xcframeworkPath, {
//     withFileTypes: true,
//     recursive: true,
//   })) {
//     if (file.isDirectory() && path.extname(file.name) === ".framework") {
//       const libraryName = path.basename(file.name, ".framework");
//       const libraryPath = path.join(file.parentPath, file.name, libraryName);
//       assert(fs.existsSync(libraryPath), `Expected library at: ${libraryPath}`);
//       const newInstallName = getLibraryInstallName(xcframeworkPath);
//       await spawn("install_name_tool", ["-id", newInstallName, libraryPath]);
//     }
//   }
// }

type HashModulePathOptions = {
  verify?: boolean;
};

export function hashModulePath(
  modulePath: string,
  { verify = true }: HashModulePathOptions = {}
) {
  const hash = crypto.createHash("sha256");
  assert(
    path.isAbsolute(modulePath),
    `Expected absolute path when hashing, got: ${modulePath}`
  );
  const strippedModulePath = stripExtension(modulePath);
  if (verify) {
    assert(
      isNodeApiModule(strippedModulePath),
      `Expected a Node-API module at ${strippedModulePath}`
    );
  }
  hash.update(normalizeModulePath(strippedModulePath));
  return hash.digest("hex").slice(0, 8);
}

export function getLibraryDiscriminator(
  modulePath: string,
  naming: NamingStrategy
) {
  if (naming === "package-name") {
    const { packageName } = determineModuleContext(modulePath);
    return packageName;
  } else if (naming === "hash") {
    return hashModulePath(modulePath);
  } else {
    throw new Error(`Unknown naming strategy: ${naming}`);
  }
}

export function getLibraryName(modulePath: string, naming: NamingStrategy) {
  const discriminator = getLibraryDiscriminator(modulePath, naming);
  return naming === "hash" ? `node-api-${discriminator}` : discriminator;
}

export function getLibraryInstallName(
  modulePath: string,
  naming: NamingStrategy
) {
  const libraryName = getLibraryName(modulePath, naming);
  return `@rpath/${libraryName}.framework/${libraryName}`;
}
