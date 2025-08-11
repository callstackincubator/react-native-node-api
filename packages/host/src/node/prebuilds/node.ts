import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { determineLibraryBasename } from "../path-utils.js";
import { NodeTriplet } from "./triplets.js";

type OSArchName =
  | `${typeof process.platform}-${typeof process.arch}`
  | "darwin-arm64;x64";

const DIRECTORY_NAMES_PER_TARGET = {
  "arm64;x86_64-apple-darwin": "darwin-arm64;x64",
  "arm64-apple-darwin": "darwin-arm64",
  "x86_64-apple-darwin": "darwin-x64",
} satisfies Record<NodeTriplet, OSArchName>;

/**
 * Determine the filename of the Android libs directory based on the framework paths.
 * Ensuring that all framework paths have the same base name.
 */
export function determineNodeLibsFilename(libraryPaths: string[]) {
  const libraryName = determineLibraryBasename(libraryPaths);
  return `${libraryName}.nodejs.node`;
}

type NodeLibsDirectoryOptions = {
  outputPath: string;
  libraryPathByTriplet: Record<NodeTriplet, string>;
  autoLink: boolean;
};

export async function createNodeLibsDirectory({
  outputPath,
  libraryPathByTriplet,
  autoLink,
}: NodeLibsDirectoryOptions) {
  // Delete and recreate any existing output directory
  await fs.promises.rm(outputPath, { recursive: true, force: true });
  await fs.promises.mkdir(outputPath, { recursive: true });
  for (const [triplet, libraryPath] of Object.entries(libraryPathByTriplet) as [
    NodeTriplet,
    string,
  ][]) {
    assert(
      fs.existsSync(libraryPath),
      `Library not found: ${libraryPath} for triplet ${triplet}`,
    );
    // Create the architecture-specific directory
    const osArch = DIRECTORY_NAMES_PER_TARGET[triplet];
    const osArchOutputPath = path.join(outputPath, osArch);
    await fs.promises.mkdir(osArchOutputPath, { recursive: true });
    // Strip any extension from the library name and rename it to .node
    const libraryName = path
      .basename(libraryPath)
      .replaceAll(/\.so$|\.dylib$|\.node$/g, "");
    const nodeSuffixedName = `${libraryName}.node`;
    const libraryOutputPath = path.join(osArchOutputPath, nodeSuffixedName);
    await fs.promises.copyFile(libraryPath, libraryOutputPath);
  }
  if (autoLink) {
    // Write a file to mark the Android libs directory is a Node-API module
    await fs.promises.writeFile(
      path.join(outputPath, "react-native-node-api-module"),
      "",
      "utf8",
    );
  }
  return outputPath;
}
