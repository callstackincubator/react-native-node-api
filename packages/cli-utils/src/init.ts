import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";

import chalk from "chalk";
import { structuredPatch } from "diff";
import semver from "semver";

import {
  detectJsonIndentation,
  getObjectProperty,
  getStringArrayProperty,
  parseJsonObject,
  stringifyJson,
} from "./json.js";
import { prettyPath } from "./paths.js";
import {
  addWorkspacePattern,
  findWorkspace,
  isPathCovered,
  relativeWorkspacePath,
  type Workspace,
} from "./workspaces.js";

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

export type StepResult = {
  changes?: Change[];
  skips?: Skip[];
  notices?: string[];
};

export type PlanResult = Required<StepResult>;

export type PackageJson = Record<string, unknown>;

export function mergeStepResults(results: StepResult[]): PlanResult {
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

export async function applyChanges(changes: Change[]) {
  for (const { path: filePath, contents } of changes) {
    await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
    await fs.promises.writeFile(filePath, contents, "utf8");
  }
}

export async function readFileIfExists(filePath: string) {
  try {
    return await fs.promises.readFile(filePath, "utf8");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
}

/**
 * Strip any npm scope from a package name.
 */
export function stripPackageScope(packageName: string) {
  return packageName.replace(/^@[^/]+\//, "");
}

/**
 * Read the package.json of a package which may not exist yet, deriving its
 * name from the directory when it doesn't declare one.
 */
export async function readPackage(packagePath: string) {
  const existingPackageJson = await readFileIfExists(
    path.join(packagePath, "package.json"),
  );
  const packageJson = existingPackageJson
    ? parseJsonObject(existingPackageJson)
    : undefined;
  const name = packageJson?.["name"];
  return {
    existingPackageJson,
    packageJson,
    packageName: typeof name === "string" ? name : path.basename(packagePath),
  };
}

/**
 * Plan a file which should match a template: created when missing, skipped
 * with a diff when it differs, unless forced.
 */
export async function planTemplateFile({
  outputPath,
  contents,
  force,
}: {
  outputPath: string;
  contents: string;
  force: boolean;
}): Promise<StepResult> {
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

/**
 * Plan a .gitignore with the lines of a template, appending those an existing
 * one lacks.
 */
export async function planGitignore({
  packagePath,
  template,
}: {
  packagePath: string;
  template: string;
}): Promise<StepResult> {
  const gitignorePath = path.join(packagePath, ".gitignore");
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
}

/**
 * Plan adding a package to the workspace of the mono-repo containing it.
 */
export async function planWorkspace({
  workspace,
  packagePath,
}: {
  workspace: Workspace | undefined;
  packagePath: string;
}): Promise<StepResult> {
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
}

export type PackageJsonUpdate = (packageJson: PackageJson) => PackageJson;

/**
 * Plan a package.json with updates applied. The updates are expected to add
 * the entrypoints only when missing: a differing value is skipped with a diff,
 * unless forced.
 */
export function planPackageJson({
  packagePath,
  packageJson,
  existingPackageJson,
  updates,
  entrypoints,
  force,
}: {
  packagePath: string;
  packageJson: PackageJson | undefined;
  existingPackageJson: string | undefined;
  updates: PackageJsonUpdate[];
  entrypoints: { main: string; types: string };
  force: boolean;
}): StepResult {
  const packageJsonPath = path.join(packagePath, "package.json");
  const updated = updates.reduce<PackageJson>(
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
    Object.entries(entrypoints).filter(
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
}

function reExportStatement(packageJson: PackageJson, entrypoint: string) {
  return packageJson["type"] === "module"
    ? `export { default } from "./${entrypoint}";`
    : `module.exports = require("./${entrypoint}");`;
}

/**
 * Add the entries a package.json lacks, keeping any value it already declares.
 */
export function withMissing(
  entries: Record<string, unknown>,
): PackageJsonUpdate {
  return (packageJson) => ({
    ...packageJson,
    ...Object.fromEntries(
      Object.entries(entries).filter(([key]) => packageJson[key] === undefined),
    ),
  });
}

export function withMissingScripts(
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
export function withFiles(files: string[], create: boolean): PackageJsonUpdate {
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
 * Whether a declared version range allows only versions below the wanted one.
 * Ranges which aren't versions at all (such as the workspace protocol) are never
 * considered outdated.
 */
export function isOutdatedRange(declared: string, wanted: string) {
  const declaredRange = semver.validRange(declared);
  const wantedRange = semver.validRange(wanted);
  if (!declaredRange || !wantedRange || declaredRange === "*") {
    return false;
  }
  return semver.gt(
    semver.minVersion(wantedRange) ?? "0.0.0",
    semver.minVersion(declaredRange) ?? "0.0.0",
  );
}

/**
 * Add a dependency to the first of the keys, unless one of them declares it
 * already, in which case it's bumped if outdated.
 */
export function withDependency({
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
      (typeof declared === "string" && isOutdatedRange(declared, specifier))
      ? { ...packageJson, [key]: { ...dependencies, [name]: specifier } }
      : packageJson;
  };
}

/**
 * The specifiers to declare dependencies on a CLI and the host package with.
 * A package initialized into the very workspace the CLI is linked from gets
 * the workspace protocol, everything else the released versions. Publishing
 * replaces the workspace protocol in the CLI's manifest with a version, which
 * is what makes it a reliable signal of running from a checkout of the
 * mono-repo.
 */
export function determineDependencySpecifiers({
  cliPackagePath,
  workspace,
}: {
  /** Directory of the package declaring the CLI. */
  cliPackagePath: string;
  /** Workspace of the package being initialized. */
  workspace: Workspace | undefined;
}) {
  const cliPackageJson = parseJsonObject(
    fs.readFileSync(path.join(cliPackagePath, "package.json"), "utf8"),
  );
  const dependencies = getObjectProperty(cliPackageJson, "dependencies") ?? {};
  const hostDependency = dependencies["react-native-node-api"];
  const cliVersion = cliPackageJson["version"];
  const linkedFromWorkspace =
    typeof hostDependency === "string" &&
    hostDependency.startsWith("workspace:");
  if (
    linkedFromWorkspace &&
    workspace !== undefined &&
    workspace.rootPath === findWorkspace(cliPackagePath)?.rootPath
  ) {
    return { hostSpecifier: "workspace:*", cliSpecifier: "workspace:*" };
  }
  return {
    hostSpecifier:
      typeof hostDependency === "string" && !linkedFromWorkspace
        ? `^${hostDependency.replace(/^[=^~]/, "")}`
        : "latest",
    cliSpecifier: typeof cliVersion === "string" ? `^${cliVersion}` : "latest",
  };
}

/**
 * Append the lines of a template missing from an existing file, or undefined if
 * it already has them all.
 */
export function appendMissingLines(contents: string, template: string) {
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

export function printPlan({
  plan,
  dryRun,
  command,
  packagePath,
  targetName,
}: {
  plan: PlanResult;
  dryRun: boolean;
  /** The command which planned it, such as "ferric init". */
  command: string;
  packagePath: string;
  /** What the package is being set up to build. */
  targetName: string;
}) {
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
      `${chalk.yellow("skip")} ${prettyPath(skip.path)} ${chalk.dim(`differs from what ${command} would write, merge this in by hand:`)}`,
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
      `${chalk.green("✔")} ${prettyPath(packagePath)} is already set up to build ${chalk.blue(targetName)}`,
    );
  } else if (dryRun) {
    console.log(
      `${chalk.dim("Nothing was written, drop")} ${chalk.blue("--dry-run")} ${chalk.dim("to apply the changes above")}`,
    );
  } else {
    console.log(
      `${chalk.green("✔")} Initialized ${chalk.blue(targetName)} in ${prettyPath(packagePath)}`,
    );
  }
}
