import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";

import { spawn } from "bufout";

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
    return normalizeModulePath(replaceWithNodeExtension(modulePath));
  }
  const { packageName, relativePath } = determineModuleContext(modulePath);
  return path.normalize(path.join(packageName, relativePath));
}

export function hashModulePath(modulePath: string) {
  const hash = crypto.createHash("sha256");
  hash.update(normalizeModulePath(modulePath));
  return hash.digest("hex").slice(0, 8);
}

export function getLibraryInstallName(modulePath: string) {
  const hash = hashModulePath(modulePath);
  return `@rpath/node-api-${hash}.framework/node-api-${hash}`;
}

export async function updateLibraryInstallPathInXCFramework(
  xcframeworkPath: string
) {
  for (const file of fs.readdirSync(xcframeworkPath, {
    withFileTypes: true,
    recursive: true,
  })) {
    if (file.isDirectory() && path.extname(file.name) === ".framework") {
      const libraryName = path.basename(file.name, ".framework");
      const libraryPath = path.join(file.parentPath, file.name, libraryName);
      assert(fs.existsSync(libraryPath), `Expected library at: ${libraryPath}`);
      const newInstallName = getLibraryInstallName(xcframeworkPath);
      await spawn("install_name_tool", ["-id", newInstallName, libraryPath]);
    }
  }
}
