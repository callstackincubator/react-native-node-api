import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { getLibraryName, MAGIC_FILENAME } from "../path-utils";
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
  modulePath,
  naming,
}: LinkModuleOptions): Promise<LinkModuleResult> {
  const libraryName = getLibraryName(modulePath, naming);
  const outputPath = getLinkedModuleOutputPath("android", modulePath, naming);

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
