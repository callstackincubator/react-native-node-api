import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { AndroidTriplet } from "./triplets.js";
import { determineLibraryBasename } from "../path-utils.js";

export const DEFAULT_ANDROID_TRIPLETS = [
  "aarch64-linux-android",
  "armv7a-linux-androideabi",
  "i686-linux-android",
  "x86_64-linux-android",
] as const satisfies AndroidTriplet[];

type AndroidArchitecture = "armeabi-v7a" | "arm64-v8a" | "x86" | "x86_64";

export const ANDROID_ARCHITECTURES = {
  "armv7a-linux-androideabi": "armeabi-v7a",
  "aarch64-linux-android": "arm64-v8a",
  "i686-linux-android": "x86",
  "x86_64-linux-android": "x86_64",
} satisfies Record<AndroidTriplet, AndroidArchitecture>;

/**
 * Determine the filename of the Android libs directory based on the framework paths.
 * Ensuring that all framework paths have the same base name.
 */
export function determineAndroidLibsFilename(libraryPaths: string[]) {
  const libraryName = determineLibraryBasename(libraryPaths);
  return `${libraryName}.android.node`;
}

type AndroidLibsDirectoryOptions = {
  outputPath: string;
  libraryPathByTriplet: Record<AndroidTriplet, string>;
  autoLink: boolean;
};

export async function createAndroidLibsDirectory({
  outputPath,
  libraryPathByTriplet,
  autoLink,
}: AndroidLibsDirectoryOptions) {
  // Delete and recreate any existing output directory
  await fs.promises.rm(outputPath, { recursive: true, force: true });
  await fs.promises.mkdir(outputPath, { recursive: true });
  for (const [triplet, libraryPath] of Object.entries(libraryPathByTriplet)) {
    assert(
      fs.existsSync(libraryPath),
      `Library not found: ${libraryPath} for triplet ${triplet}`,
    );
    const arch = ANDROID_ARCHITECTURES[triplet as AndroidTriplet];
    const archOutputPath = path.join(outputPath, arch);
    await fs.promises.mkdir(archOutputPath, { recursive: true });
    // Strip the ".node" extension from the library name
    const libraryName = path.basename(libraryPath, ".node");
    const soSuffixedName =
      path.extname(libraryName) === ".so" ? libraryName : `${libraryName}.so`;
    const finalLibraryName = libraryName.startsWith("lib")
      ? soSuffixedName
      : `lib${soSuffixedName}`;
    const libraryOutputPath = path.join(archOutputPath, finalLibraryName);
    await fs.promises.copyFile(libraryPath, libraryOutputPath);
    // TODO: Update the install path in the library file
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
