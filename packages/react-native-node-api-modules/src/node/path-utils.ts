import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";

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

export function hashNodeApiModulePath(modulePath: string) {
  // Transforming platform specific paths to a common path
  if (path.extname(modulePath) !== ".node") {
    return hashNodeApiModulePath(replaceWithNodeExtension(modulePath));
  }
  const hash = crypto.createHash("sha256");
  hash.update(path.normalize(modulePath));
  const result = hash.digest("hex").slice(0, 8);
  return result;
}

// TODO: Find a better name for this function 🤦
export function getNodeApiRequireCallArgument(modulePath: string) {
  const hash = hashNodeApiModulePath(modulePath);
  return `@rpath/node-api-${hash}.framework/node-api-${hash}`;
}
