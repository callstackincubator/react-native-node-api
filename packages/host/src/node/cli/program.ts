import assert from "node:assert/strict";
import path from "node:path";
import { EventEmitter } from "node:stream";

import { Command } from "@commander-js/extra-typings";
import { SpawnFailure } from "bufout";
import chalk from "chalk";
import { oraPromise } from "ora";

import {
  determineModuleContext,
  findNodeApiModulePathsByDependency,
  getAutolinkPath,
  getLibraryName,
  logModulePaths,
  normalizeModulePath,
  PlatformName,
  PLATFORMS,
  prettyPath,
} from "../path-utils";

import { command as vendorHermes } from "./hermes";
import { pathSuffixOption } from "./options";
import { linkModules, pruneLinkedModules, ModuleLinker } from "./link-modules";
import { linkXcframework } from "./apple";
import { linkAndroidDir } from "./android";

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
    throw new Error(`Unknown platform: ${platform}`);
  }
}

function getPlatformDisplayName(platform: PlatformName) {
  if (platform === "android") {
    return "Android";
  } else if (platform === "apple") {
    return "Apple";
  } else {
    throw new Error(`Unknown platform: ${platform}`);
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
  .addOption(pathSuffixOption)
  .action(async (pathArg, { force, prune, pathSuffix, android, apple }) => {
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
            naming: { pathSuffix },
            linker: getLinker(platform),
          }),
        {
          text: `Linking ${platformDisplayName} Node-API modules into ${prettyPath(
            platformOutputPath,
          )}`,
          successText: `Linked ${platformDisplayName} Node-API modules into ${prettyPath(
            platformOutputPath,
          )}`,
          failText: (error) =>
            `Failed to link ${platformDisplayName} Node-API modules into ${prettyPath(
              platformOutputPath,
            )}: ${error.message}`,
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
  });

program
  .command("list")
  .description("Lists Node-API modules")
  .argument("[from-path]", "Some path inside the app package", process.cwd())
  .option("--json", "Output as JSON", false)
  .addOption(pathSuffixOption)
  .action(async (fromArg, { json, pathSuffix }) => {
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
      for (const [dependencyName, dependency] of Object.entries(dependencies)) {
        console.log(
          chalk.blueBright(dependencyName),
          "→",
          prettyPath(dependency.path),
        );
        logModulePaths(
          dependency.modulePaths.map((p) => path.join(dependency.path, p)),
          { pathSuffix },
        );
      }
    }
  });

program
  .command("info <path>")
  .description(
    "Utility to print, module path, the hash of a single Android library",
  )
  .addOption(pathSuffixOption)
  .action((pathInput, { pathSuffix }) => {
    const resolvedModulePath = path.resolve(pathInput);
    const normalizedModulePath = normalizeModulePath(resolvedModulePath);
    const { packageName, relativePath } =
      determineModuleContext(resolvedModulePath);
    const libraryName = getLibraryName(resolvedModulePath, {
      pathSuffix,
    });
    console.log({
      resolvedModulePath,
      normalizedModulePath,
      packageName,
      relativePath,
      libraryName,
    });
  });
