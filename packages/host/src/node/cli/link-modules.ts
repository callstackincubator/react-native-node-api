import path from "node:path";
import fs from "node:fs";

import {
  chalk,
  SpawnFailure,
  prettyPath,
} from "@react-native-node-api/cli-utils";

import {
  findNodeApiModulePathsByDependency,
  getAutolinkPath,
  getLibraryName,
  visualizeLibraryMap,
  NamingStrategy,
  PlatformName,
  getLibraryMap,
} from "../path-utils";

export type ModuleLinker = {
  link(options: LinkModuleOptions): Promise<LinkModuleResult>;
  outputParentPath: string;
} & AsyncDisposable;

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
  signed?: boolean;
};

export type ModuleOutputBase = {
  originalPath: string;
  skipped: boolean;
  signed?: boolean;
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

  const libraryMap = getLibraryMap(absoluteModulePaths, naming);
  const duplicates = new Map(
    Array.from(libraryMap.entries()).filter(([, paths]) => paths.length > 1),
  );

  if (duplicates.size > 0) {
    const visualized = visualizeLibraryMap(duplicates);
    throw new Error("Found conflicting library names:\n" + visualized);
  }

  return Promise.all(
    absoluteModulePaths.map(async (originalPath) => {
      try {
        return await linker.link({
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
  linkedModules: ModuleOutput[],
  outputParentPath: string,
) {
  if (linkedModules.some(({ failure }) => failure)) {
    // Don't prune if any of the modules failed to copy
    return;
  }
  // Pruning only when all modules are copied successfully
  const expectedPaths = new Set([...linkedModules.map((m) => m.outputPath)]);
  await Promise.all(
    fs.readdirSync(outputParentPath).map(async (entry) => {
      const candidatePath = path.resolve(outputParentPath, entry);
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
