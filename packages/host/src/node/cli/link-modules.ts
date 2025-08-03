import path from "node:path";
import fs from "node:fs";

import { SpawnFailure } from "bufout";
import {
  findNodeApiModulePathsByDependency,
  getAutolinkPath,
  getLibraryName,
  logModulePaths,
  NamingStrategy,
  PlatformName,
  prettyPath,
} from "../path-utils";
import chalk from "chalk";

export type ModuleLinker = (
  options: LinkModuleOptions,
) => Promise<LinkModuleResult>;

export type LinkModulesOptions = {
  platform: PlatformName;
  incremental: boolean;
  naming: NamingStrategy;
  fromPath: string;
  linker: ModuleLinker;
};

export type LinkModuleOptions = Omit<
  LinkModulesOptions,
  "fromPath" | "linker"
> & {
  modulePath: string;
};

export type ModuleDetails = {
  originalPath: string;
  outputPath: string;
  libraryName: string;
};

export type LinkModuleResult = ModuleDetails & {
  skipped: boolean;
};

export type ModuleOutputBase = {
  originalPath: string;
  skipped: boolean;
};

type ModuleOutput = ModuleOutputBase &
  (
    | { outputPath: string; failure?: never }
    | { outputPath?: never; failure: SpawnFailure }
  );

export async function linkModules({
  fromPath,
  incremental,
  naming,
  platform,
  linker,
}: LinkModulesOptions): Promise<ModuleOutput[]> {
  // Find all their xcframeworks
  const dependenciesByName = await findNodeApiModulePathsByDependency({
    fromPath,
    platform,
    includeSelf: true,
  });

  // Find absolute paths to xcframeworks
  const absoluteModulePaths = Object.values(dependenciesByName).flatMap(
    (dependency) =>
      dependency.modulePaths.map((modulePath) =>
        path.join(dependency.path, modulePath),
      ),
  );

  if (hasDuplicateLibraryNames(absoluteModulePaths, naming)) {
    logModulePaths(absoluteModulePaths, naming);
    throw new Error("Found conflicting library names");
  }

  return Promise.all(
    absoluteModulePaths.map(async (originalPath) => {
      try {
        return await linker({
          modulePath: originalPath,
          incremental,
          naming,
          platform,
        });
      } catch (error) {
        if (error instanceof SpawnFailure) {
          return {
            originalPath,
            skipped: false,
            failure: error,
          };
        } else {
          throw error;
        }
      }
    }),
  );
}

export async function pruneLinkedModules(
  platform: PlatformName,
  linkedModules: ModuleOutput[],
) {
  if (linkedModules.some(({ failure }) => failure)) {
    // Don't prune if any of the modules failed to copy
    return;
  }
  const platformOutputPath = getAutolinkPath(platform);
  // Pruning only when all modules are copied successfully
  const expectedPaths = new Set([...linkedModules.map((m) => m.outputPath)]);
  await Promise.all(
    fs.readdirSync(platformOutputPath).map(async (entry) => {
      const candidatePath = path.resolve(platformOutputPath, entry);
      if (!expectedPaths.has(candidatePath)) {
        console.log(
          "🧹Deleting",
          prettyPath(candidatePath),
          chalk.dim("(no longer linked)"),
        );
        await fs.promises.rm(candidatePath, { recursive: true, force: true });
      }
    }),
  );
}

export function hasDuplicateLibraryNames(
  modulePaths: string[],
  naming: NamingStrategy,
): boolean {
  const libraryNames = modulePaths.map((modulePath) => {
    return getLibraryName(modulePath, naming);
  });
  const uniqueNames = new Set(libraryNames);
  return uniqueNames.size !== libraryNames.length;
}

export function getLinkedModuleOutputPath(
  platform: PlatformName,
  modulePath: string,
  naming: NamingStrategy,
): string {
  const libraryName = getLibraryName(modulePath, naming);
  if (platform === "android") {
    return path.join(getAutolinkPath(platform), libraryName);
  } else if (platform === "apple") {
    return path.join(getAutolinkPath(platform), libraryName + ".xcframework");
  } else {
    throw new Error(`Unsupported platform: ${platform as string}`);
  }
}
