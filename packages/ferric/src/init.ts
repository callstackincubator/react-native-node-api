import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";

import {
  chalk,
  Command,
  Option,
  assertFixable,
  prettyPath,
  wrapAction,
} from "@react-native-node-api/cli-utils";
import { structuredPatch } from "diff";

import {
  isCrateVersion,
  isOutdated,
  updateCargoManifest,
  type CrateVersions,
} from "./cargo-manifest.js";
import { MAX_NODE_API_VERSION } from "./features.js";
import {
  detectJsonIndentation,
  getObjectProperty,
  getStringArrayProperty,
  parseJsonObject,
  stringifyJson,
} from "./json.js";
import {
  addWorkspacePattern,
  findWorkspace,
  isPathCovered,
  relativeWorkspacePath,
  type Workspace,
} from "./workspaces.js";

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

export type Change =
  | { kind: "create"; path: string; contents: string }
  | {
      kind: "update";
      path: string;
      contents: string;
      previous: string;
      forced?: boolean;
    };

/** A difference left alone, unless the caller forces the overwrite. */
export type Skip = {
  path: string;
  contents: string;
  previous: string;
  hint?: string;
};

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

type PackageJson = Record<string, unknown>;

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

type StepResult = { changes?: Change[]; skips?: Skip[]; notices?: string[] };

/** Plans a part of the initialization, without writing anything. */
type InitStep = (context: InitContext) => StepResult | Promise<StepResult>;

function mergeStepResults(results: StepResult[]) {
  return {
    changes: results.flatMap(({ changes = [] }) => changes),
    skips: results.flatMap(({ skips = [] }) => skips),
    notices: results.flatMap(({ notices = [] }) => notices),
  };
}

/**
 * Applying a later change to a file would silently discard an earlier one.
 */
export function assertDistinctChanges(changes: Pick<Change, "path">[]) {
  const paths = changes.map(({ path: filePath }) => filePath);
  assert.deepEqual(
    paths.filter((filePath, index) => paths.indexOf(filePath) !== index),
    [],
    "Expected every init step to change distinct files",
  );
}

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

  const existingPackageJson = await readFileIfExists(
    path.join(resolvedPath, "package.json"),
  );
  const packageJson = existingPackageJson
    ? parseJsonObject(existingPackageJson)
    : undefined;
  const packageNameValue = packageJson?.["name"];
  const packageName =
    typeof packageNameValue === "string"
      ? packageNameValue
      : path.basename(resolvedPath);
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

const planPackageJson: InitStep = (context) => {
  const { packageJson, existingPackageJson, libraryName, force } = context;
  const packageJsonPath = path.join(context.packagePath, "package.json");
  const updated = getPackageJsonUpdates(context).reduce<PackageJson>(
    (result, update) => update(result),
    packageJson ?? {},
  );
  const stringify = (value: PackageJson) =>
    stringifyJson(
      value,
      existingPackageJson
        ? detectJsonIndentation(existingPackageJson)
        : undefined,
    );

  if (existingPackageJson === undefined) {
    return {
      changes: [
        { kind: "create", path: packageJsonPath, contents: stringify(updated) },
      ],
    };
  }

  const conflicts = Object.fromEntries(
    Object.entries(getEntrypoints(libraryName)).filter(
      ([key, value]) => updated[key] !== value,
    ),
  );
  const overwritten = { ...updated, ...conflicts };
  const hasConflicts = Object.keys(conflicts).length > 0;
  const result = force ? overwritten : updated;
  return {
    changes: isDeepStrictEqual(result, packageJson)
      ? []
      : [
          {
            kind: "update",
            path: packageJsonPath,
            contents: stringify(result),
            previous: existingPackageJson,
            forced: force && hasConflicts,
          },
        ],
    skips:
      hasConflicts && !force
        ? [
            {
              path: packageJsonPath,
              previous: stringify(updated),
              contents: stringify(overwritten),
              hint: conflicts["main"]
                ? `To keep ${chalk.blue(String(updated["main"]))} as the entrypoint, re-export the addon from it: ${chalk.blue(reExportStatement(updated, conflicts["main"]))}`
                : undefined,
            },
          ]
        : [],
  };
};

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
  const outputPath = path.join(packagePath, relativePath);
  const contents = await readTemplate(template);
  const previous = await readFileIfExists(outputPath);
  if (previous === undefined) {
    return { changes: [{ kind: "create", path: outputPath, contents }] };
  } else if (previous === contents) {
    return {};
  } else if (force) {
    return {
      changes: [
        { kind: "update", path: outputPath, contents, previous, forced: true },
      ],
    };
  }
  return { skips: [{ path: outputPath, contents, previous }] };
}

const planSourceFiles: InitStep = async (context) =>
  mergeStepResults(
    await Promise.all([
      planSourceFile(context, "build.rs", "build.rs"),
      planSourceFile(context, "lib.rs", path.join("src", "lib.rs")),
    ]),
  );

const planGitignore: InitStep = async ({ packagePath }) => {
  const gitignorePath = path.join(packagePath, ".gitignore");
  // The template is named without a leading dot, as npm won't publish a
  // .gitignore file inside a package
  const template = await readTemplate("gitignore");
  const previous = await readFileIfExists(gitignorePath);
  if (previous === undefined) {
    return {
      changes: [{ kind: "create", path: gitignorePath, contents: template }],
    };
  }
  const contents = appendMissingLines(previous, template);
  return contents
    ? { changes: [{ kind: "update", path: gitignorePath, contents, previous }] }
    : {};
};

const planWorkspace: InitStep = async ({ workspace, packagePath }) => {
  if (!workspace) {
    return {};
  }
  const relativePath = relativeWorkspacePath(workspace, packagePath);
  const { patterns, configPath } = workspace;
  if (patterns && isPathCovered(patterns, relativePath)) {
    return {};
  }
  const previous = await readFileIfExists(configPath);
  const contents =
    patterns && previous
      ? addWorkspacePattern(workspace, previous, relativePath)
      : undefined;
  if (!contents || previous === undefined) {
    return {
      notices: [
        `Add ${chalk.blue(relativePath)} to the workspace packages declared by ${prettyPath(configPath)}`,
      ],
    };
  }
  return {
    changes: [{ kind: "update", path: configPath, contents, previous }],
  };
};

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

function reExportStatement(
  packageJson: Record<string, unknown>,
  entrypoint: string,
) {
  return packageJson["type"] === "module"
    ? `export { default } from "./${entrypoint}";`
    : `module.exports = require("./${entrypoint}");`;
}

export async function applyChanges(changes: Change[]) {
  for (const { path: filePath, contents } of changes) {
    await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
    await fs.promises.writeFile(filePath, contents, "utf8");
  }
}

/**
 * Strip any npm scope from a package name, to use it as a Cargo crate name.
 */
export function crateNameFromPackageName(packageName: string) {
  return packageName.replace(/^@[^/]+\//, "");
}

function getEntrypoints(libraryName: string) {
  return { main: `${libraryName}.js`, types: `${libraryName}.d.ts` };
}

type PackageJsonUpdate = (packageJson: PackageJson) => PackageJson;

/**
 * Add the entries a package.json lacks, keeping any value it already declares.
 */
function withMissing(entries: Record<string, unknown>): PackageJsonUpdate {
  return (packageJson) => ({
    ...packageJson,
    ...Object.fromEntries(
      Object.entries(entries).filter(([key]) => packageJson[key] === undefined),
    ),
  });
}

function withMissingScripts(
  scripts: Record<string, string>,
): PackageJsonUpdate {
  return (packageJson) => ({
    ...packageJson,
    scripts: withMissing(scripts)(
      getObjectProperty(packageJson, "scripts") ?? {},
    ),
  });
}

/**
 * Only extends an existing "files" array, unless asked to create one: adding one
 * to a package without it would suddenly narrow down what that package publishes.
 */
function withFiles(files: string[], create: boolean): PackageJsonUpdate {
  return (packageJson) => {
    const existing = getStringArrayProperty(packageJson, "files");
    if (existing === undefined && !create) {
      return packageJson;
    }
    const declared = existing ?? [];
    return {
      ...packageJson,
      files: [...declared, ...files.filter((file) => !declared.includes(file))],
    };
  };
}

/**
 * Add a dependency to the first of the keys, unless one of them declares it
 * already, in which case it's bumped if outdated.
 */
function withDependency({
  name,
  specifier,
  keys,
}: {
  name: string;
  specifier: string;
  keys: string[];
}): PackageJsonUpdate {
  return (packageJson) => {
    const declaredIn = keys.find(
      (key) => getObjectProperty(packageJson, key)?.[name] !== undefined,
    );
    const key = declaredIn ?? keys[0];
    const dependencies = getObjectProperty(packageJson, key) ?? {};
    const declared = dependencies[name];
    return declaredIn === undefined ||
      (typeof declared === "string" && isOutdated(declared, specifier))
      ? { ...packageJson, [key]: { ...dependencies, [name]: specifier } }
      : packageJson;
  };
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
  const { hostSpecifier, ferricSpecifier } =
    determineDependencySpecifiers(workspace);
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

/**
 * The specifiers to declare dependencies on this CLI and the host package with.
 * A package initialized into the very workspace this CLI is linked from gets
 * the workspace protocol, everything else the released versions. Publishing
 * replaces the workspace protocol in our own manifest with a version, which is
 * what makes it a reliable signal of running from a checkout of the mono-repo.
 */
export function determineDependencySpecifiers(
  workspace: Workspace | undefined,
) {
  const ownPackageJson = parseJsonObject(
    fs.readFileSync(path.join(PACKAGE_ROOT, "package.json"), "utf8"),
  );
  const dependencies = getObjectProperty(ownPackageJson, "dependencies") ?? {};
  const hostDependency = dependencies["react-native-node-api"];
  const ownVersion = ownPackageJson["version"];
  const linkedFromWorkspace =
    typeof hostDependency === "string" &&
    hostDependency.startsWith("workspace:");
  if (
    linkedFromWorkspace &&
    workspace?.rootPath === findWorkspace(PACKAGE_ROOT)?.rootPath
  ) {
    return { hostSpecifier: "workspace:*", ferricSpecifier: "workspace:*" };
  }
  return {
    hostSpecifier:
      typeof hostDependency === "string" && !linkedFromWorkspace
        ? `^${hostDependency.replace(/^[=^~]/, "")}`
        : "latest",
    ferricSpecifier:
      typeof ownVersion === "string" ? `^${ownVersion}` : "latest",
  };
}

/**
 * Append the lines of a template missing from an existing file, or undefined if
 * it already has them all.
 */
function appendMissingLines(contents: string, template: string) {
  const existing = new Set(contents.split(/\r?\n/).map((line) => line.trim()));
  const missing = template
    .split("\n")
    .filter((line) => line.trim().length > 0 && !existing.has(line.trim()));
  if (missing.length === 0) {
    return undefined;
  }
  const separator = contents.endsWith("\n") ? "" : "\n";
  return contents + separator + missing.join("\n") + "\n";
}

function readTemplate(filename: string) {
  return fs.promises.readFile(path.join(TEMPLATES_PATH, filename), "utf8");
}

async function readFileIfExists(filePath: string) {
  try {
    return await fs.promises.readFile(filePath, "utf8");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
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
        printPlan(plan, dryRun);
      },
    ),
  );

/**
 * The hunks of a unified diff, colored like `git diff` prints them.
 */
export function formatDiff(previous: string, contents: string, context = 2) {
  const { hunks } = structuredPatch(
    "previous",
    "contents",
    previous,
    contents,
    undefined,
    undefined,
    { context },
  );
  return hunks.flatMap(({ oldStart, oldLines, newStart, newLines, lines }) => [
    chalk.cyan(`@@ -${oldStart},${oldLines} +${newStart},${newLines} @@`),
    ...lines.map((line) => {
      if (line.startsWith("+")) {
        return chalk.green(line);
      } else if (line.startsWith("-")) {
        return chalk.red(line);
      } else {
        return chalk.dim(line);
      }
    }),
  ]);
}

function printDiff(previous: string, contents: string) {
  for (const line of formatDiff(previous, contents)) {
    console.log(chalk.dim("│ ") + line);
  }
}

function changeLabel(change: Change) {
  if (change.kind === "create") {
    return chalk.green("create");
  }
  return change.forced ? chalk.red("overwrite") : chalk.yellow("update");
}

function printPlan(plan: InitPlan, dryRun: boolean) {
  for (const change of plan.changes) {
    console.log(
      `${dryRun ? chalk.dim("would ") : ""}${changeLabel(change)} ${prettyPath(change.path)}`,
    );
    // Creating writes a template verbatim, printing it would drown the diffs of
    // the files being changed around it
    if (change.kind === "update") {
      printDiff(change.previous, change.contents);
    }
  }
  for (const skip of plan.skips) {
    console.log(
      `${chalk.yellow("skip")} ${prettyPath(skip.path)} ${chalk.dim("differs from what ferric init would write, merge this in by hand:")}`,
    );
    printDiff(skip.previous, skip.contents);
    if (skip.hint) {
      console.log(`${chalk.yellow("ℹ︎")} ${skip.hint}`);
    }
  }
  for (const notice of plan.notices) {
    console.log(`${chalk.yellow("ℹ︎")} ${notice}`);
  }
  if (plan.skips.length > 0) {
    console.log(
      `${chalk.yellow("ℹ︎")} Pass ${chalk.blue("--force")} to overwrite the skipped entrypoints and source files`,
    );
  }
  if (plan.changes.length === 0 && plan.skips.length === 0) {
    console.log(
      `${chalk.green("✔")} ${prettyPath(plan.packagePath)} is already set up to build ${chalk.blue(plan.crateName)}`,
    );
  } else if (dryRun) {
    console.log(
      `${chalk.dim("Nothing was written, drop")} ${chalk.blue("--dry-run")} ${chalk.dim("to apply the changes above")}`,
    );
  } else {
    console.log(
      `${chalk.green("✔")} Initialized ${chalk.blue(plan.crateName)} in ${prettyPath(plan.packagePath)}`,
    );
  }
}
