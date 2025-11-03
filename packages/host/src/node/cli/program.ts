import assert from "node:assert/strict";
import path from "node:path";
import { EventEmitter } from "node:stream";
import fs from "node:fs";

import {
  Command,
  chalk,
  SpawnFailure,
  oraPromise,
  wrapAction,
  prettyPath,
} from "@react-native-node-api/cli-utils";

import {
  determineModuleContext,
  findNodeApiModulePathsByDependency,
  getAutolinkPath,
  getLibraryName,
  visualizeLibraryMap,
  normalizeModulePath,
  PlatformName,
  PLATFORMS,
  getLibraryMap,
} from "../path-utils";

import { command as vendorHermes } from "./hermes";
import { packageNameOption, pathSuffixOption } from "./options";
import { linkModules, pruneLinkedModules, ModuleLinker } from "./link-modules";
import { linkXcframework, restoreFrameworkLinks } from "./apple";
import { linkAndroidDir } from "./android";
import { weakNodeApiPath } from "../weak-node-api";

// We're attaching a lot of listeners when spawning in parallel
EventEmitter.defaultMaxListeners = 100;

export const program = new Command("react-native-node-api").addCommand(
  vendorHermes,
);

function getLinker(platform: PlatformName): ModuleLinker {
  if (platform === "android") {
    return linkAndroidDir;
  } else if (platform === "apple") {
    return linkXcframework;
  } else {
    throw new Error(`Unknown platform: ${platform as string}`);
  }
}

function getPlatformDisplayName(platform: PlatformName) {
  if (platform === "android") {
    return "Android";
  } else if (platform === "apple") {
    return "Apple";
  } else {
    throw new Error(`Unknown platform: ${platform as string}`);
  }
}

program
  .command("link")
  .argument("[path]", "Some path inside the app package", process.cwd())
  .option(
    "--force",
    "Don't check timestamps of input files to skip unnecessary rebuilds",
    false,
  )
  .option(
    "--prune",
    "Delete vendored modules that are no longer auto-linked",
    true,
  )
  .option("--android", "Link Android modules")
  .option("--apple", "Link Apple modules")
  .option(
    "--prefix-logs",
    "Add a prefix to ever line being logged, to more easily identify the output",
  )
  .addOption(packageNameOption)
  .addOption(pathSuffixOption)
  .action(
    wrapAction(
      async (
        pathArg,
        { force, prune, pathSuffix, android, apple, packageName, prefixLogs },
      ) => {
        const logPrefix = prefixLogs ? chalk.cyan("[Node-API]") : undefined;
        // Patch a prefix onto all console.logs
        if (prefixLogs) {
          const log = console.log.bind(console);
          const error = console.error.bind(console);
          const warn = console.warn.bind(console);
          Object.assign(console, {
            log: (msg: unknown, ...parts: unknown[]) =>
              log(`${logPrefix} ${String(msg)}`, ...parts),
            error: (msg: unknown, ...parts: unknown[]) =>
              error(`${logPrefix} ${String(msg)}`, ...parts),
            warn: (msg: unknown, ...parts: unknown[]) =>
              warn(`${logPrefix} ${String(msg)}`, ...parts),
          });
        }

        console.log("Auto-linking Node-API modules from", chalk.dim(pathArg));
        const platforms: PlatformName[] = [];
        if (android) {
          platforms.push("android");
        }
        if (apple) {
          platforms.push("apple");
        }

        if (platforms.length === 0) {
          console.error(
            `No platform specified, pass one or more of:`,
            ...PLATFORMS.map((platform) => chalk.bold(`\n  --${platform}`)),
          );
          process.exitCode = 1;
          return;
        }

        for (const platform of platforms) {
          const platformDisplayName = getPlatformDisplayName(platform);
          const platformOutputPath = getAutolinkPath(platform);
          const modules = await oraPromise(
            () =>
              linkModules({
                platform,
                fromPath: path.resolve(pathArg),
                incremental: !force,
                naming: { packageName, pathSuffix },
                linker: getLinker(platform),
              }),
            {
              prefixText: logPrefix,
              text: `Linking ${platformDisplayName} Node-API modules into ${prettyPath(
                platformOutputPath,
              )}`,
              successText: `Linked ${platformDisplayName} Node-API modules into ${prettyPath(
                platformOutputPath,
              )}`,
              failText: () =>
                `Failed to link ${platformDisplayName} Node-API modules into ${prettyPath(
                  platformOutputPath,
                )}`,
            },
          );

          if (modules.length === 0) {
            console.log("Found no Node-API modules 🤷");
          }

          const failures = modules.filter((result) => "failure" in result);
          const linked = modules.filter((result) => "outputPath" in result);

          for (const { originalPath, outputPath, skipped } of linked) {
            const prettyOutputPath = outputPath
              ? "→ " + prettyPath(path.basename(outputPath))
              : "";
            if (skipped) {
              console.log(
                chalk.greenBright("-"),
                "Skipped",
                prettyPath(originalPath),
                prettyOutputPath,
                "(up to date)",
              );
            } else {
              console.log(
                chalk.greenBright("⚭"),
                "Linked",
                prettyPath(originalPath),
                prettyOutputPath,
              );
            }
          }

          for (const { originalPath, failure } of failures) {
            assert(failure instanceof SpawnFailure);
            console.error(
              "\n",
              chalk.redBright("✖"),
              "Failed to copy",
              prettyPath(originalPath),
            );
            console.error(failure.message);
            failure.flushOutput("both");
            process.exitCode = 1;
          }

          if (prune) {
            await pruneLinkedModules(platform, modules);
          }
        }

        if (apple) {
          await oraPromise(
            async () => {
              const xcframeworkPath = path.join(
                weakNodeApiPath,
                "weak-node-api.xcframework",
              );
              await Promise.all(
                [
                  path.join(xcframeworkPath, "macos-x86_64"),
                  path.join(xcframeworkPath, "macos-arm64"),
                  path.join(xcframeworkPath, "macos-arm64_x86_64"),
                ].map(async (slicePath) => {
                  const frameworkPath = path.join(
                    slicePath,
                    "weak-node-api.framework",
                  );
                  if (fs.existsSync(frameworkPath)) {
                    await restoreFrameworkLinks(frameworkPath);
                  }
                }),
              );
            },
            {
              text: "Restoring weak-node-api symlinks",
              successText: "Restored weak-node-api symlinks",
              failText: (error) =>
                `Failed to restore weak-node-api symlinks: ${error.message}`,
            },
          );
        }
      },
    ),
  );

program
  .command("list")
  .description("Lists Node-API modules")
  .argument("[from-path]", "Some path inside the app package", process.cwd())
  .option("--json", "Output as JSON", false)
  .addOption(packageNameOption)
  .addOption(pathSuffixOption)
  .action(
    wrapAction(async (fromArg, { json, pathSuffix, packageName }) => {
      const rootPath = path.resolve(fromArg);
      const dependencies = await findNodeApiModulePathsByDependency({
        fromPath: rootPath,
        platform: PLATFORMS,
        includeSelf: true,
      });

      if (json) {
        console.log(JSON.stringify(dependencies, null, 2));
      } else {
        const dependencyCount = Object.keys(dependencies).length;
        const xframeworkCount = Object.values(dependencies).reduce(
          (acc, { modulePaths }) => acc + modulePaths.length,
          0,
        );
        console.log(
          "Found",
          chalk.greenBright(xframeworkCount),
          "Node-API modules in",
          chalk.greenBright(dependencyCount),
          dependencyCount === 1 ? "package" : "packages",
          "from",
          prettyPath(rootPath),
        );
        for (const [dependencyName, dependency] of Object.entries(
          dependencies,
        )) {
          console.log(
            "\n" + chalk.blueBright(dependencyName),
            "→",
            prettyPath(dependency.path),
          );
          const libraryMap = getLibraryMap(
            dependency.modulePaths.map((p) => path.join(dependency.path, p)),
            { packageName, pathSuffix },
          );
          console.log(visualizeLibraryMap(libraryMap));
        }
      }
    }),
  );

program
  .command("info <path>")
  .description(
    "Utility to print, module path, the hash of a single Android library",
  )
  .addOption(packageNameOption)
  .addOption(pathSuffixOption)
  .action(
    wrapAction((pathInput, { pathSuffix, packageName }) => {
      const resolvedModulePath = path.resolve(pathInput);
      const normalizedModulePath = normalizeModulePath(resolvedModulePath);
      const context = determineModuleContext(resolvedModulePath);
      const libraryName = getLibraryName(resolvedModulePath, {
        packageName,
        pathSuffix,
      });
      console.log({
        resolvedModulePath,
        normalizedModulePath,
        packageName: context.packageName,
        relativePath: context.relativePath,
        libraryName,
      });
    }),
  );
