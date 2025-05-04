import fs from "node:fs";
import path from "node:path";

import { getLatestMtime, getLibraryName, MAGIC_FILENAME } from "../path-utils";
import {
  getLinkedModuleOutputPath,
  LinkModuleResult,
  type LinkModuleOptions,
} from "./link-modules";

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
