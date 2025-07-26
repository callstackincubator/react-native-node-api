import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { getLatestMtime, getLibraryName, MAGIC_FILENAME } from "../path-utils";
import {
  getLinkedModuleOutputPath,
  LinkModuleResult,
  type LinkModuleOptions,
} from "./link-modules";

const ANDROID_ARCHITECTURES = [
  "arm64-v8a",
  "armeabi-v7a",
  "x86_64",
  "x86",
] as const;

export async function linkAndroidDir({
  incremental,
  modulePath,
  naming,
  platform,
}: LinkModuleOptions): Promise<LinkModuleResult> {
  const libraryName = getLibraryName(modulePath, naming);
  const outputPath = getLinkedModuleOutputPath(platform, modulePath, naming);

  if (incremental && fs.existsSync(outputPath)) {
    const moduleModified = getLatestMtime(modulePath);
    const outputModified = getLatestMtime(outputPath);
    if (moduleModified < outputModified) {
      return {
        originalPath: modulePath,
        libraryName,
        outputPath,
        skipped: true,
      };
    }
  }

  await fs.promises.rm(outputPath, { recursive: true, force: true });
  await fs.promises.cp(modulePath, outputPath, { recursive: true });
  for (const arch of ANDROID_ARCHITECTURES) {
    const archPath = path.join(outputPath, arch);
    if (!fs.existsSync(archPath)) {
      // Skip missing architectures
      continue;
    }
    const libraryDirents = await fs.promises.readdir(archPath, {
      withFileTypes: true,
    });
    assert(libraryDirents.length === 1, "Expected exactly one library file");
    const [libraryDirent] = libraryDirents;
    assert(libraryDirent.isFile(), "Expected a library file");
    const libraryPath = path.join(libraryDirent.parentPath, libraryDirent.name);
    await fs.promises.rename(
      libraryPath,
      path.join(archPath, `lib${libraryName}.so`),
    );
  }
  await fs.promises.rm(path.join(outputPath, MAGIC_FILENAME), {
    recursive: true,
  });

  // TODO: Update the DT_NEEDED entry in the .so files

  return {
    originalPath: modulePath,
    outputPath,
    libraryName,
    skipped: false,
  };
}
