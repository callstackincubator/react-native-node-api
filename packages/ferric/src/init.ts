import fs from "node:fs";
import path from "node:path";

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
  const changes: Change[] = [];
  const skips: Skip[] = [];
  const notices: string[] = [];
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

  const packageJsonPath = path.join(resolvedPath, "package.json");
  const existingPackageJson = await readFileIfExists(packageJsonPath);
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

  const workspace = findWorkspace(resolvedPath);
  const { updated: updatedPackageJson, conflicts } = updatePackageJson({
    packageJson,
    packageName,
    libraryName,
    workspace,
  });
  const indentation = existingPackageJson
    ? detectJsonIndentation(existingPackageJson)
    : undefined;
  const hasConflicts = Object.keys(conflicts).length > 0;
  const keptPackageJson = updatedPackageJson ?? packageJson;
  const overwritten =
    hasConflicts && keptPackageJson
      ? stringifyJson({ ...keptPackageJson, ...conflicts }, indentation)
      : undefined;
  if (overwritten && keptPackageJson && !force) {
    skips.push({
      path: packageJsonPath,
      previous: stringifyJson(keptPackageJson, indentation),
      contents: overwritten,
      hint: conflicts["main"]
        ? `To keep ${chalk.blue(String(keptPackageJson["main"]))} as the entrypoint, re-export the addon from it: ${chalk.blue(reExportStatement(keptPackageJson, conflicts["main"]))}`
        : undefined,
    });
  }
  const packageJsonContents =
    force && overwritten
      ? overwritten
      : updatedPackageJson && stringifyJson(updatedPackageJson, indentation);
  if (packageJsonContents) {
    changes.push(
      existingPackageJson
        ? {
            kind: "update",
            path: packageJsonPath,
            contents: packageJsonContents,
            previous: existingPackageJson,
            forced: force && hasConflicts,
          }
        : {
            kind: "create",
            path: packageJsonPath,
            contents: packageJsonContents,
          },
    );
  }

  const cargoTomlPath = path.join(resolvedPath, "Cargo.toml");
  const existingCargoToml = await readFileIfExists(cargoTomlPath);
  if (existingCargoToml !== undefined) {
    const manifest = updateCargoManifest(existingCargoToml, crateVersions);
    notices.push(...manifest.notices);
    if (manifest.contents !== existingCargoToml) {
      changes.push({
        kind: "update",
        path: cargoTomlPath,
        contents: manifest.contents,
        previous: existingCargoToml,
      });
    }
    for (const [option, value] of Object.entries({
      "--node-api-version": nodeApiVersion,
      "--release-profile": releaseProfile,
    })) {
      if (value !== undefined) {
        notices.push(
          `Ignored ${chalk.blue(option)}, which only applies when creating a Cargo.toml`,
        );
      }
    }
  } else {
    const template = await readTemplate("Cargo.toml");
    changes.push({
      kind: "create",
      path: cargoTomlPath,
      contents: renderCargoManifest(template, {
        crateName,
        nodeApiVersion: nodeApiVersion ?? DEFAULT_NODE_API_VERSION,
        crateVersions,
        releaseProfile: releaseProfile ?? "speed",
      }),
    });
  }

  for (const [template, relativePath] of [
    ["build.rs", "build.rs"],
    ["lib.rs", path.join("src", "lib.rs")],
  ]) {
    const outputPath = path.join(resolvedPath, relativePath);
    const contents = await readTemplate(template);
    const previous = await readFileIfExists(outputPath);
    if (previous === undefined) {
      changes.push({ kind: "create", path: outputPath, contents });
    } else if (previous !== contents) {
      if (force) {
        changes.push({
          kind: "update",
          path: outputPath,
          contents,
          previous,
          forced: true,
        });
      } else {
        skips.push({ path: outputPath, contents, previous });
      }
    }
  }

  const gitignorePath = path.join(resolvedPath, ".gitignore");
  // The template is named without a leading dot, as npm won't publish a
  // .gitignore file inside a package
  const gitignoreTemplate = await readTemplate("gitignore");
  const existingGitignore = await readFileIfExists(gitignorePath);
  if (existingGitignore !== undefined) {
    const updatedGitignore = appendMissingLines(
      existingGitignore,
      gitignoreTemplate,
    );
    if (updatedGitignore) {
      changes.push({
        kind: "update",
        path: gitignorePath,
        contents: updatedGitignore,
        previous: existingGitignore,
      });
    }
  } else {
    changes.push({
      kind: "create",
      path: gitignorePath,
      contents: gitignoreTemplate,
    });
  }

  const workspaceChange = await planWorkspaceChange(
    workspace,
    resolvedPath,
    notices,
  );
  if (workspaceChange) {
    changes.push(workspaceChange);
  }

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

type PackageJsonOptions = {
  packageJson: Record<string, unknown> | undefined;
  packageName: string;
  libraryName: string;
  workspace: Workspace | undefined;
};

/**
 * Add whatever a package needs to build a Rust Node-API module to its
 * package.json and bump outdated dependencies, leaving any other value it already
 * declares alone. `updated` is undefined if there is nothing to change, and
 * `conflicts` holds the entrypoints it declares differently.
 */
function updatePackageJson({
  packageJson,
  packageName,
  libraryName,
  workspace,
}: PackageJsonOptions) {
  const { hostSpecifier, ferricSpecifier } =
    determineDependencySpecifiers(workspace);
  const result: Record<string, unknown> = { ...packageJson };
  let changed = false;

  for (const [key, value] of Object.entries({
    name: packageName,
    version: "0.1.0",
    type: "commonjs",
  })) {
    if (result[key] === undefined) {
      result[key] = value;
      changed = true;
    }
  }

  const entrypoints = {
    main: `${libraryName}.js`,
    types: `${libraryName}.d.ts`,
  };
  const conflicts = Object.fromEntries(
    Object.entries(entrypoints).filter(
      ([key, value]) => result[key] !== undefined && result[key] !== value,
    ),
  );
  for (const [key, value] of Object.entries(entrypoints)) {
    if (result[key] === undefined) {
      result[key] = value;
      changed = true;
    }
  }

  // Only extend an existing "files" array: adding one to a package without it
  // would suddenly narrow down what that package publishes.
  const artifactFiles = [
    `${libraryName}.js`,
    `${libraryName}.d.ts`,
    `${libraryName}.apple.node`,
    `${libraryName}.android.node`,
  ];
  const files = getStringArrayProperty(result, "files");
  if (packageJson === undefined) {
    result["files"] = artifactFiles;
    changed = true;
  } else if (files) {
    const missing = artifactFiles.filter((file) => !files.includes(file));
    if (missing.length > 0) {
      result["files"] = [...files, ...missing];
      changed = true;
    }
  }

  const scripts = getObjectProperty(result, "scripts") ?? {};
  const missingScripts = Object.entries({
    build: "ferric build",
    "build:types": "ferric build --dts-only",
  }).filter(([name]) => scripts[name] === undefined);
  if (missingScripts.length > 0) {
    result["scripts"] = { ...scripts, ...Object.fromEntries(missingScripts) };
    changed = true;
  }

  changed =
    updateDependency(result, {
      name: "react-native-node-api",
      specifier: hostSpecifier,
      keys: ["dependencies", "devDependencies", "peerDependencies"],
    }) || changed;
  changed =
    updateDependency(result, {
      name: "ferric-cli",
      specifier: ferricSpecifier,
      keys: ["devDependencies", "dependencies", "peerDependencies"],
    }) || changed;

  return { updated: changed ? result : undefined, conflicts };
}

/**
 * Add a dependency to the first of the keys, unless one of them declares it
 * already, in which case it's bumped if outdated.
 */
function updateDependency(
  packageJson: Record<string, unknown>,
  {
    name,
    specifier,
    keys,
  }: { name: string; specifier: string; keys: string[] },
) {
  const declaredIn = keys.find(
    (key) => getObjectProperty(packageJson, key)?.[name] !== undefined,
  );
  const key = declaredIn ?? keys[0];
  const dependencies = getObjectProperty(packageJson, key) ?? {};
  const declared = dependencies[name];
  if (
    declaredIn === undefined ||
    (typeof declared === "string" && isOutdated(declared, specifier))
  ) {
    packageJson[key] = { ...dependencies, [name]: specifier };
    return true;
  }
  return false;
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

async function planWorkspaceChange(
  workspace: Workspace | undefined,
  packagePath: string,
  notices: string[],
): Promise<Change | undefined> {
  if (!workspace) {
    return undefined;
  }
  const relativePath = relativeWorkspacePath(workspace, packagePath);
  const { patterns, configPath } = workspace;
  if (patterns && isPathCovered(patterns, relativePath)) {
    return undefined;
  }
  const contents = await readFileIfExists(configPath);
  const updated =
    patterns && contents
      ? addWorkspacePattern(workspace, contents, relativePath)
      : undefined;
  if (!updated || contents === undefined) {
    notices.push(
      `Add ${chalk.blue(relativePath)} to the workspace packages declared by ${prettyPath(configPath)}`,
    );
    return undefined;
  }
  return {
    kind: "update",
    path: configPath,
    contents: updated,
    previous: contents,
  };
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
