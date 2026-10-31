import fs from "node:fs";
import path from "node:path";

import {
  chalk,
  Command,
  Option,
  applyChanges,
  assertDistinctChanges,
  assertFixable,
  determineDependencySpecifiers,
  findWorkspace,
  mergeStepResults,
  planGitignore,
  planPackageJson,
  planTemplateFile,
  planWorkspace,
  printPlan,
  readFileIfExists,
  readPackage,
  stripPackageScope,
  withDependency,
  withFiles,
  withMissing,
  withMissingScripts,
  wrapAction,
  type Change,
  type PackageJson,
  type Skip,
  type StepResult,
  type Workspace,
} from "@react-native-node-api/cli-utils";

const PACKAGE_ROOT = path.join(import.meta.dirname, "..");
const TEMPLATES_PATH = path.join(PACKAGE_ROOT, "templates");

/** Where `cmake-rn build` emits a target's prebuilds by default. */
const OUTPUT_DIRECTORY = "build/Release";

export type InitPlan = {
  packagePath: string;
  packageName: string;
  libraryName: string;
  changes: Change[];
  skips: Skip[];
  notices: string[];
};

export type InitOptions = {
  /** Directory of the package to initialize. */
  packagePath: string;
  /** Name of the CMake target and library, derived from the package name when omitted. */
  libraryName?: string;
  /** Overwrite entrypoints, the CMake project and source files instead of skipping them. */
  force?: boolean;
};

type InitContext = {
  packagePath: string;
  packageName: string;
  libraryName: string;
  /** The package.json of an existing package, as read from disk. */
  existingPackageJson: string | undefined;
  packageJson: PackageJson | undefined;
  workspace: Workspace | undefined;
  force: boolean;
};

/** Plans a part of the initialization, without writing anything. */
type InitStep = (context: InitContext) => StepResult | Promise<StepResult>;

/**
 * Determine the changes needed to make a package build a CMake Node-API
 * module, without applying any of them.
 */
export async function planInit({
  packagePath,
  libraryName: libraryNameOption,
  force = false,
}: InitOptions): Promise<InitPlan> {
  const resolvedPath = path.resolve(packagePath);
  const { existingPackageJson, packageJson, packageName } =
    await readPackage(resolvedPath);
  const libraryName = libraryNameOption ?? stripPackageScope(packageName);
  assertFixable(
    /^[a-zA-Z][a-zA-Z0-9_-]*$/.test(libraryName),
    `Cannot use ${chalk.blue(libraryName)} as a library name`,
    {
      instructions:
        "Pass --name with a name starting with a letter, followed by letters, digits, dashes or underscores",
    },
  );

  const context: InitContext = {
    packagePath: resolvedPath,
    packageName,
    libraryName,
    existingPackageJson,
    packageJson,
    workspace: findWorkspace(resolvedPath),
    force,
  };
  const { changes, skips, notices } = mergeStepResults(
    await Promise.all(INIT_STEPS.map(async (step) => step(context))),
  );
  assertDistinctChanges(changes);

  return {
    packagePath: resolvedPath,
    packageName,
    libraryName,
    changes,
    skips,
    notices,
  };
}

const planPackageJsonStep: InitStep = (context) =>
  planPackageJson({
    packagePath: context.packagePath,
    packageJson: context.packageJson,
    existingPackageJson: context.existingPackageJson,
    updates: getPackageJsonUpdates(context),
    entrypoints: getEntrypoints(context.libraryName),
    force: context.force,
  });

const planEntrypoints: InitStep = async ({
  packagePath,
  libraryName,
  force,
}) => {
  const { main, types } = getEntrypoints(libraryName);
  return mergeStepResults(
    await Promise.all([
      planTemplateFile({
        outputPath: path.join(packagePath, main),
        contents: await readTemplate("entrypoint.js.template", { libraryName }),
        force,
      }),
      planTemplateFile({
        outputPath: path.join(packagePath, types),
        contents: await readTemplate("entrypoint.d.ts.template", {
          libraryName,
        }),
        force,
      }),
    ]),
  );
};

/**
 * An existing CMake project is the package's own: rather than diffing it with
 * the template, it's inspected for what `cmake-rn build` needs from it. The
 * source file is only written along with the project that builds it.
 */
const planCmakeProject: InitStep = async ({
  packagePath,
  libraryName,
  force,
}) => {
  const cmakeListsPath = path.join(packagePath, "CMakeLists.txt");
  const contents = await readTemplate("CMakeLists.txt", { libraryName });
  const previous = await readFileIfExists(cmakeListsPath);
  if (previous !== undefined && previous !== contents && !force) {
    return { notices: inspectCmakeProject(previous, libraryName) };
  }
  return mergeStepResults(
    await Promise.all([
      planTemplateFile({ outputPath: cmakeListsPath, contents, force }),
      planTemplateFile({
        outputPath: path.join(packagePath, "src", "addon.c"),
        contents: await readTemplate("addon.c", { libraryName }),
        force,
      }),
    ]),
  );
};

const planGitignoreStep: InitStep = async ({ packagePath, libraryName }) =>
  planGitignore({
    packagePath,
    // The template is named without a leading dot, as npm won't publish a
    // .gitignore file inside a package
    template: await readTemplate("gitignore", { libraryName }),
  });

const INIT_STEPS: InitStep[] = [
  planPackageJsonStep,
  planEntrypoints,
  planCmakeProject,
  planGitignoreStep,
  planWorkspace,
];

/**
 * Point out what an existing CMakeLists.txt lacks to build a Node-API module
 * with `cmake-rn build`.
 */
export function inspectCmakeProject(contents: string, libraryName: string) {
  const code = contents.replace(/#.*$/gm, "");
  const cmakeListsName = chalk.blue("CMakeLists.txt");
  const notices: string[] = [];
  const usesCmakeJs = /\bCMAKE_JS_(INC|LIB|SRC)\b/.test(code);
  const importsWeakNodeApi =
    /\$\{WEAK_NODE_API_CONFIG\}/.test(code) ||
    /find_package\s*\(\s*weak-node-api\b/.test(code);
  const linksWeakNodeApi =
    /target_link_libraries\s*\([^)]*\bweak-node-api\b/.test(code);
  if (usesCmakeJs && !importsWeakNodeApi) {
    notices.push(
      `${cmakeListsName} uses the cmake-js variables: pass ${chalk.blue("--cmake-js")} when building, or link the ${chalk.blue("weak-node-api")} target instead`,
    );
  } else {
    if (!importsWeakNodeApi) {
      notices.push(
        `${cmakeListsName} doesn't define the ${chalk.blue("weak-node-api")} target: add ${chalk.blue("include(${WEAK_NODE_API_CONFIG})")}`,
      );
    }
    if (!linksWeakNodeApi) {
      notices.push(
        `${cmakeListsName} doesn't link against Node-API: add ${chalk.blue("weak-node-api")} to the ${chalk.blue("target_link_libraries")} of the addon`,
      );
    }
  }
  if (!code.includes(libraryName)) {
    notices.push(
      `${cmakeListsName} doesn't mention ${chalk.blue(libraryName)}, the library the entrypoint loads: pass ${chalk.blue("--name")} with the name of the addon's ${chalk.blue(".node")} file`,
    );
  }
  return notices;
}

function getEntrypoints(libraryName: string) {
  return { main: `${libraryName}.js`, types: `${libraryName}.d.ts` };
}

/**
 * What a package needs to build a CMake Node-API module, leaving any value it
 * already declares alone besides outdated dependencies.
 */
function getPackageJsonUpdates({
  packageJson,
  packageName,
  libraryName,
  workspace,
}: InitContext) {
  const { hostSpecifier, cliSpecifier } = determineDependencySpecifiers({
    cliPackagePath: PACKAGE_ROOT,
    workspace,
  });
  return [
    withMissing({
      name: packageName,
      version: "0.1.0",
      type: "commonjs",
      ...getEntrypoints(libraryName),
    }),
    withFiles(
      [
        `${libraryName}.js`,
        `${libraryName}.d.ts`,
        `${OUTPUT_DIRECTORY}/${libraryName}.apple.node`,
        `${OUTPUT_DIRECTORY}/${libraryName}.android.node`,
      ],
      packageJson === undefined,
    ),
    withMissingScripts({ build: "cmake-rn" }),
    withDependency({
      name: "react-native-node-api",
      specifier: hostSpecifier,
      keys: ["dependencies", "devDependencies", "peerDependencies"],
    }),
    withDependency({
      name: "cmake-rn",
      specifier: cliSpecifier,
      keys: ["devDependencies", "dependencies", "peerDependencies"],
    }),
  ];
}

async function readTemplate(
  filename: string,
  { libraryName }: { libraryName: string },
) {
  const template = await fs.promises.readFile(
    path.join(TEMPLATES_PATH, filename),
    "utf8",
  );
  return template.replaceAll("{{name}}", libraryName);
}

const nameOption = new Option(
  "--name <name>",
  "Name of the CMake target and the library it builds",
).default(undefined, "derived from the package name");

const dryRunOption = new Option(
  "--dry-run",
  "Print the changes instead of applying them",
).default(false);

const forceOption = new Option(
  "--force",
  "Overwrite entrypoints, the CMake project and source files which differ, instead of skipping them",
).default(false);

export const initCommand = new Command("init")
  .description("Scaffold a package building a CMake Node-API module")
  .argument("[path]", "Path of the package directory", ".")
  .addOption(nameOption)
  .addOption(dryRunOption)
  .addOption(forceOption)
  .action(
    wrapAction(async (packagePath: string, { name, dryRun, force }) => {
      const plan = await planInit({
        packagePath,
        libraryName: name,
        force,
      });
      if (!dryRun) {
        await applyChanges(plan.changes);
      }
      printPlan({
        plan,
        dryRun,
        command: "cmake-rn init",
        packagePath: plan.packagePath,
        targetName: plan.libraryName,
      });
    }),
  );
