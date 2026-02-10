import assert from "node:assert/strict";
import path from "node:path";
import { EventEmitter } from "node:stream";

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
import { ensureXcodeBuildPhase, createAppleLinker } from "./apple";
import { linkAndroidDir } from "./android";

// We're attaching a lot of listeners when spawning in parallel
EventEmitter.defaultMaxListeners = 100;

export const program = new Command("react-native-node-api").addCommand(
  vendorHermes,
);

async function createLinker(platform: PlatformName): Promise<ModuleLinker> {
  if (platform === "android") {
    return linkAndroidDir;
  } else if (platform === "apple") {
    return createAppleLinker();
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
    "--prune",
    "Delete vendored modules that are no longer auto-linked",
    true,
  )
  .option("--android", "Link Android modules")
  .option("--apple", "Link Apple modules")
  .addOption(packageNameOption)
  .addOption(pathSuffixOption)
  .action(
    wrapAction(
      async (pathArg, { prune, pathSuffix, android, apple, packageName }) => {
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
          const modules = await oraPromise(
            async () =>
              await linkModules({
                platform,
                fromPath: path.resolve(pathArg),
                naming: { packageName, pathSuffix },
                linker: await createLinker(platform),
              }),
            {
              text: `Linking ${platformDisplayName} Node-API modules`,
              successText: `Linked ${platformDisplayName} Node-API modules`,
              failText: () =>
                `Failed to link ${platformDisplayName} Node-API modules`,
            },
          );

          if (modules.length === 0) {
            console.log("Found no Node-API modules 🤷");
          }

          const failures = modules.filter((result) => "failure" in result);
          const linked = modules.filter((result) => "outputPath" in result);

          for (const { originalPath, outputPath, skipped, signed } of linked) {
            const prettyOutputPath = outputPath
              ? "→ " + prettyPath(outputPath)
              : "";
            const signedSuffix = signed ? "🔏" : "";
            if (skipped) {
              console.log(
                chalk.greenBright("-"),
                "Skipped",
                prettyPath(originalPath),
                prettyOutputPath,
                signedSuffix,
                "(up to date)",
              );
            } else {
              console.log(
                chalk.greenBright("⚭"),
                "Linked",
                prettyPath(originalPath),
                prettyOutputPath,
                signedSuffix,
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

program
  .command("patch-xcode-project")
  .description("Patch the Xcode project to include the Node-API build phase")
  .argument("[path]", "Some path inside the app package", process.cwd())
  .action(
    wrapAction(async (pathInput) => {
      const resolvedPath = path.resolve(process.cwd(), pathInput);
      console.log(
        "Patching Xcode project in",
        prettyPath(resolvedPath),
        "to include a build phase to copy, rename and sign Node-API frameworks",
      );
      assert.equal(
        process.platform,
        "darwin",
        "Patching Xcode project is only supported on macOS",
      );
      await ensureXcodeBuildPhase(resolvedPath);
    }),
  );
