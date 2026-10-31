import fs from "node:fs";
import path from "node:path";

import {
  chalk,
  Command,
  Option,
  applyChanges,
  assertFixable,
  determineDependencySpecifiers,
  findWorkspace,
  mergeStepResults,
  planGitignore as planGitignoreFromTemplate,
  planPackageJson as planPackageJsonUpdates,
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
  assertDistinctChanges,
  type Change,
  type PackageJson,
  type PackageJsonUpdate,
  type Skip,
  type StepResult,
  type Workspace,
} from "@react-native-node-api/cli-utils";

import {
  isCrateVersion,
  updateCargoManifest,
  type CrateVersions,
} from "./cargo-manifest.js";
import { MAX_NODE_API_VERSION } from "./features.js";

const PACKAGE_ROOT = path.join(import.meta.dirname, "..");
const TEMPLATES_PATH = path.join(PACKAGE_ROOT, "templates");

export const DEFAULT_NODE_API_VERSION = 3;

export const DEFAULT_CRATE_VERSIONS: CrateVersions = {
  napi: "3.14.2",
  "napi-derive": "3.6.12",
  "napi-build": "2.6.0",
};

const SPEED_PROFILE = ["lto = true", "codegen-units = 1"];

const RELEASE_PROFILES = {
  speed: SPEED_PROFILE,
  size: [...SPEED_PROFILE, 'opt-level = "z"', "strip = true"],
  none: [],
} satisfies Record<string, string[]>;

export type ReleaseProfile = keyof typeof RELEASE_PROFILES;

export type InitPlan = {
  packagePath: string;
  packageName: string;
  crateName: string;
  libraryName: string;
  changes: Change[];
  skips: Skip[];
  notices: string[];
};

export type InitOptions = {
  /** Directory of the package to initialize. */
  packagePath: string;
  /** Name of the Cargo crate, derived from the package name when omitted. */
  crateName?: string;
  /** Node-API version enabled when creating a Cargo manifest. */
  nodeApiVersion?: number;
  /** Versions of the napi crates, overriding the defaults. */
  crateVersions?: Partial<CrateVersions>;
  /** Release profile written when creating a Cargo manifest. */
  releaseProfile?: ReleaseProfile;
  /** Overwrite entrypoints and source files instead of skipping them. */
  force?: boolean;
};

type InitContext = {
  packagePath: string;
  packageName: string;
  crateName: string;
  libraryName: string;
  /** The package.json of an existing package, as read from disk. */
  existingPackageJson: string | undefined;
  packageJson: PackageJson | undefined;
  workspace: Workspace | undefined;
  crateVersions: CrateVersions;
  nodeApiVersion: number | undefined;
  releaseProfile: ReleaseProfile | undefined;
  force: boolean;
};

/** Plans a part of the initialization, without writing anything. */
type InitStep = (context: InitContext) => StepResult | Promise<StepResult>;

/**
 * Determine the changes needed to make a package build a Rust Node-API module,
 * without applying any of them.
 */
export async function planInit({
  packagePath,
  crateName: crateNameOption,
  nodeApiVersion,
  crateVersions: crateVersionsOption,
  releaseProfile,
  force = false,
}: InitOptions): Promise<InitPlan> {
  const resolvedPath = path.resolve(packagePath);
  const crateVersions = { ...DEFAULT_CRATE_VERSIONS, ...crateVersionsOption };
  for (const [crate, version] of Object.entries(crateVersions)) {
    assertFixable(
      isCrateVersion(version),
      `Cannot use ${chalk.blue(version)} as the version of ${chalk.blue(crate)}`,
      { instructions: "Pass a Cargo version requirement, such as 3.14.2" },
    );
  }
  assertFixable(
    nodeApiVersion === undefined ||
      (Number.isInteger(nodeApiVersion) &&
        nodeApiVersion >= 1 &&
        nodeApiVersion <= MAX_NODE_API_VERSION),
    `Cannot use ${chalk.blue(String(nodeApiVersion))} as the Node-API version`,
    {
      instructions: `Pass a version between 1 and ${MAX_NODE_API_VERSION}, the highest one implemented by the host`,
    },
  );

  const { existingPackageJson, packageJson, packageName } =
    await readPackage(resolvedPath);
  const crateName = crateNameOption ?? crateNameFromPackageName(packageName);
  assertFixable(
    /^[a-zA-Z][a-zA-Z0-9_-]*$/.test(crateName),
    `Cannot use ${chalk.blue(crateName)} as a crate name`,
    {
      instructions:
        "Pass --name with a crate name starting with a letter, followed by letters, digits, dashes or underscores",
    },
  );
  // Cargo normalizes dashes to underscores for the artifact it produces, which
  // is the basename `ferric build` writes its outputs and entrypoint with.
  const libraryName = crateName.replaceAll("-", "_");

  const context: InitContext = {
    packagePath: resolvedPath,
    packageName,
    crateName,
    libraryName,
    existingPackageJson,
    packageJson,
    workspace: findWorkspace(resolvedPath),
    crateVersions,
    nodeApiVersion,
    releaseProfile,
    force,
  };
  const { changes, skips, notices } = mergeStepResults(
    await Promise.all(INIT_STEPS.map(async (step) => step(context))),
  );
  assertDistinctChanges(changes);

  return {
    packagePath: resolvedPath,
    packageName,
    crateName,
    libraryName,
    changes,
    skips,
    notices,
  };
}

const planPackageJson: InitStep = (context) =>
  planPackageJsonUpdates({
    packagePath: context.packagePath,
    packageJson: context.packageJson,
    existingPackageJson: context.existingPackageJson,
    updates: getPackageJsonUpdates(context),
    entrypoints: getEntrypoints(context.libraryName),
    force: context.force,
  });

const planCargoManifest: InitStep = async ({
  packagePath,
  crateName,
  crateVersions,
  nodeApiVersion,
  releaseProfile,
}) => {
  const cargoTomlPath = path.join(packagePath, "Cargo.toml");
  const previous = await readFileIfExists(cargoTomlPath);
  if (previous === undefined) {
    return {
      changes: [
        {
          kind: "create",
          path: cargoTomlPath,
          contents: renderCargoManifest(await readTemplate("Cargo.toml"), {
            crateName,
            nodeApiVersion: nodeApiVersion ?? DEFAULT_NODE_API_VERSION,
            crateVersions,
            releaseProfile: releaseProfile ?? "speed",
          }),
        },
      ],
    };
  }
  const { contents, notices } = updateCargoManifest(previous, crateVersions);
  const ignoredOptions = Object.entries({
    "--node-api-version": nodeApiVersion,
    "--release-profile": releaseProfile,
  }).filter(([, value]) => value !== undefined);
  return {
    changes:
      contents === previous
        ? []
        : [{ kind: "update", path: cargoTomlPath, contents, previous }],
    notices: [
      ...notices,
      ...ignoredOptions.map(
        ([option]) =>
          `Ignored ${chalk.blue(option)}, which only applies when creating a Cargo.toml`,
      ),
    ],
  };
};

async function planSourceFile(
  { packagePath, force }: InitContext,
  template: string,
  relativePath: string,
): Promise<StepResult> {
  return planTemplateFile({
    outputPath: path.join(packagePath, relativePath),
    contents: await readTemplate(template),
    force,
  });
}

const planSourceFiles: InitStep = async (context) =>
  mergeStepResults(
    await Promise.all([
      planSourceFile(context, "build.rs", "build.rs"),
      planSourceFile(context, "lib.rs", path.join("src", "lib.rs")),
    ]),
  );

const planGitignore: InitStep = async ({ packagePath }) =>
  planGitignoreFromTemplate({
    packagePath,
    // The template is named without a leading dot, as npm won't publish a
    // .gitignore file inside a package
    template: await readTemplate("gitignore"),
  });

const INIT_STEPS: InitStep[] = [
  planPackageJson,
  planCargoManifest,
  planSourceFiles,
  planGitignore,
  planWorkspace,
];

function renderCargoManifest(
  template: string,
  {
    crateName,
    nodeApiVersion,
    crateVersions,
    releaseProfile,
  }: {
    crateName: string;
    nodeApiVersion: number;
    crateVersions: CrateVersions;
    releaseProfile: ReleaseProfile;
  },
) {
  const profile = RELEASE_PROFILES[releaseProfile];
  return template
    .replaceAll("{{name}}", crateName)
    .replaceAll("{{nodeApiVersion}}", String(nodeApiVersion))
    .replaceAll("{{napiCrateVersion}}", crateVersions.napi)
    .replaceAll("{{napiDeriveCrateVersion}}", crateVersions["napi-derive"])
    .replaceAll("{{napiBuildCrateVersion}}", crateVersions["napi-build"])
    .replace(
      /\{\{releaseProfile\}\}\r?\n/,
      profile.length > 0
        ? ["", "[profile.release]", ...profile, ""].join("\n")
        : "",
    );
}

/**
 * Strip any npm scope from a package name, to use it as a Cargo crate name.
 */
export function crateNameFromPackageName(packageName: string) {
  return stripPackageScope(packageName);
}

function getEntrypoints(libraryName: string) {
  return { main: `${libraryName}.js`, types: `${libraryName}.d.ts` };
}

/**
 * What a package needs to build a Rust Node-API module, leaving any value it
 * already declares alone besides outdated dependencies.
 */
function getPackageJsonUpdates({
  packageJson,
  packageName,
  libraryName,
  workspace,
}: InitContext): PackageJsonUpdate[] {
  const { hostSpecifier, cliSpecifier: ferricSpecifier } =
    determineDependencySpecifiers({ cliPackagePath: PACKAGE_ROOT, workspace });
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
        `${libraryName}.apple.node`,
        `${libraryName}.android.node`,
      ],
      packageJson === undefined,
    ),
    withMissingScripts({
      build: "ferric build",
      "build:types": "ferric build --dts-only",
    }),
    withDependency({
      name: "react-native-node-api",
      specifier: hostSpecifier,
      keys: ["dependencies", "devDependencies", "peerDependencies"],
    }),
    withDependency({
      name: "ferric-cli",
      specifier: ferricSpecifier,
      keys: ["devDependencies", "dependencies", "peerDependencies"],
    }),
  ];
}

function readTemplate(filename: string) {
  return fs.promises.readFile(path.join(TEMPLATES_PATH, filename), "utf8");
}

const nameOption = new Option(
  "--name <name>",
  "Name of the Cargo crate",
).default(undefined, "derived from the package name");

const dryRunOption = new Option(
  "--dry-run",
  "Print the changes instead of applying them",
).default(false);

const nodeApiVersionOption = new Option(
  "--node-api-version <version>",
  "Node-API version enabled when creating a Cargo.toml",
)
  .argParser((value) => parseInt(value, 10))
  .default(undefined, String(DEFAULT_NODE_API_VERSION));

const napiCrateVersionOption = new Option(
  "--napi-crate-version <version>",
  "Version of the napi crate",
).default(undefined, DEFAULT_CRATE_VERSIONS.napi);

const napiDeriveCrateVersionOption = new Option(
  "--napi-derive-crate-version <version>",
  "Version of the napi-derive crate",
).default(undefined, DEFAULT_CRATE_VERSIONS["napi-derive"]);

const napiBuildCrateVersionOption = new Option(
  "--napi-build-crate-version <version>",
  "Version of the napi-build crate",
).default(undefined, DEFAULT_CRATE_VERSIONS["napi-build"]);

const releaseProfileOption = new Option(
  "--release-profile <profile>",
  "Release profile written when creating a Cargo.toml",
)
  .choices(["speed", "size", "none"] satisfies ReleaseProfile[])
  .default(undefined, "speed");

const forceOption = new Option(
  "--force",
  "Overwrite entrypoints and source files which differ, instead of skipping them",
).default(false);

export const initCommand = new Command("init")
  .description("Scaffold a package building a Rust Node-API module")
  .argument("[path]", "Path of the package directory", ".")
  .addOption(nameOption)
  .addOption(dryRunOption)
  .addOption(nodeApiVersionOption)
  .addOption(napiCrateVersionOption)
  .addOption(napiDeriveCrateVersionOption)
  .addOption(napiBuildCrateVersionOption)
  .addOption(releaseProfileOption)
  .addOption(forceOption)
  .action(
    wrapAction(
      async (
        packagePath: string,
        {
          name,
          dryRun,
          nodeApiVersion,
          napiCrateVersion,
          napiDeriveCrateVersion,
          napiBuildCrateVersion,
          releaseProfile,
          force,
        },
      ) => {
        const plan = await planInit({
          packagePath,
          crateName: name,
          nodeApiVersion,
          crateVersions: Object.fromEntries(
            Object.entries({
              napi: napiCrateVersion,
              "napi-derive": napiDeriveCrateVersion,
              "napi-build": napiBuildCrateVersion,
            }).filter(([, version]) => version !== undefined),
          ),
          releaseProfile,
          force,
        });
        if (!dryRun) {
          await applyChanges(plan.changes);
        }
        printPlan({
          plan,
          dryRun,
          command: "ferric init",
          packagePath: plan.packagePath,
          targetName: plan.crateName,
        });
      },
    ),
  );
