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
import { parse as parseToml } from "smol-toml";

import {
  detectJsonIndentation,
  getObjectProperty,
  getStringArrayProperty,
  isRecord,
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

export type Change =
  | { kind: "create"; path: string; contents: string }
  | { kind: "update"; path: string; contents: string; previous: string };

export type InitPlan = {
  packagePath: string;
  packageName: string;
  crateName: string;
  libraryName: string;
  changes: Change[];
  notices: string[];
};

export type InitOptions = {
  /** Directory of the package to initialize. */
  packagePath: string;
  /** Name of the Cargo crate, derived from the package name when omitted. */
  crateName?: string;
};

/**
 * Determine the changes needed to make a package build a Rust Node-API module,
 * without applying any of them.
 */
export async function planInit({
  packagePath,
  crateName: crateNameOption,
}: InitOptions): Promise<InitPlan> {
  const resolvedPath = path.resolve(packagePath);
  const changes: Change[] = [];
  const notices: string[] = [];

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
  const updatedPackageJson = updatePackageJson({
    packageJson,
    packageName,
    libraryName,
    workspace,
  });
  if (updatedPackageJson) {
    const contents = stringifyJson(
      updatedPackageJson,
      existingPackageJson
        ? detectJsonIndentation(existingPackageJson)
        : undefined,
    );
    changes.push(
      existingPackageJson
        ? {
            kind: "update",
            path: packageJsonPath,
            contents,
            previous: existingPackageJson,
          }
        : { kind: "create", path: packageJsonPath, contents },
    );
  }

  const cargoTomlPath = path.join(resolvedPath, "Cargo.toml");
  const existingCargoToml = await readFileIfExists(cargoTomlPath);
  if (existingCargoToml) {
    notices.push(...inspectCargoToml(existingCargoToml));
  } else {
    changes.push({
      kind: "create",
      path: cargoTomlPath,
      contents: (await readTemplate("Cargo.toml")).replaceAll(
        "{{name}}",
        crateName,
      ),
    });
  }

  for (const [template, relativePath] of [
    ["build.rs", "build.rs"],
    ["lib.rs", path.join("src", "lib.rs")],
  ]) {
    const outputPath = path.join(resolvedPath, relativePath);
    if (!(await readFileIfExists(outputPath))) {
      changes.push({
        kind: "create",
        path: outputPath,
        contents: await readTemplate(template),
      });
    }
  }

  const gitignorePath = path.join(resolvedPath, ".gitignore");
  // The template is named without a leading dot, as npm won't publish a
  // .gitignore file inside a package
  const gitignoreTemplate = await readTemplate("gitignore");
  const existingGitignore = await readFileIfExists(gitignorePath);
  if (existingGitignore) {
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
    notices,
  };
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
 * package.json, leaving any value it already declares alone. Returns undefined
 * if it already declares everything.
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
    main: `${libraryName}.js`,
    types: `${libraryName}.d.ts`,
  })) {
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

  changed =
    addMissingEntries(result, "scripts", {
      build: "ferric build",
      "build:types": "ferric build --dts-only",
    }) || changed;
  changed =
    addMissingEntries(
      result,
      "dependencies",
      { "react-native-node-api": hostSpecifier },
      ["devDependencies", "peerDependencies"],
    ) || changed;
  changed =
    addMissingEntries(
      result,
      "devDependencies",
      { "ferric-cli": ferricSpecifier },
      ["dependencies", "peerDependencies"],
    ) || changed;

  return changed ? result : undefined;
}

/**
 * Add entries to an object valued property, keeping any entry already declared
 * by it (or by one of the other properties it can be declared in).
 */
function addMissingEntries(
  packageJson: Record<string, unknown>,
  key: string,
  entries: Record<string, string>,
  alternativeKeys: string[] = [],
) {
  const existing = getObjectProperty(packageJson, key) ?? {};
  const declaredElsewhere = alternativeKeys.flatMap((alternativeKey) =>
    Object.keys(getObjectProperty(packageJson, alternativeKey) ?? {}),
  );
  const missing = Object.entries(entries).filter(
    ([name]) =>
      existing[name] === undefined && !declaredElsewhere.includes(name),
  );
  if (missing.length === 0) {
    return false;
  }
  packageJson[key] = { ...existing, ...Object.fromEntries(missing) };
  return true;
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
 * Notices about anything an existing Cargo manifest needs to build into a
 * Node-API module. It is left untouched: it is likely to carry pinned versions,
 * comments and features which are more valuable than a mechanical update.
 */
function inspectCargoToml(contents: string) {
  let manifest: unknown;
  try {
    manifest = parseToml(contents);
  } catch (error) {
    return [
      `Cargo.toml could not be parsed: ${error instanceof Error ? error.message : String(error)}`,
    ];
  }
  if (!isRecord(manifest)) {
    return ["Cargo.toml doesn't declare a package"];
  }
  const result: string[] = [];
  const lib = manifest["lib"];
  const crateType = isRecord(lib) ? lib["crate-type"] : undefined;
  if (!Array.isArray(crateType) || !crateType.includes("cdylib")) {
    result.push(
      `Cargo.toml doesn't declare ${chalk.blue('crate-type = ["cdylib"]')} in its ${chalk.blue("[lib]")} section, which Node-API modules are built as`,
    );
  }
  for (const [table, dependency] of [
    ["dependencies", "napi"],
    ["dependencies", "napi-derive"],
    ["build-dependencies", "napi-build"],
  ]) {
    const dependencies = manifest[table];
    if (!isRecord(dependencies) || dependencies[dependency] === undefined) {
      result.push(
        `Cargo.toml is missing ${chalk.blue(dependency)} from its ${chalk.blue(`[${table}]`)}`,
      );
    }
  }
  return result;
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

export const initCommand = new Command("init")
  .description("Scaffold a package building a Rust Node-API module")
  .argument("[path]", "Path of the package directory", ".")
  .addOption(nameOption)
  .addOption(dryRunOption)
  .action(
    wrapAction(async (packagePath: string, { name, dryRun }) => {
      const plan = await planInit({ packagePath, crateName: name });
      if (!dryRun) {
        await applyChanges(plan.changes);
      }
      printPlan(plan, dryRun);
    }),
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

function printPlan(plan: InitPlan, dryRun: boolean) {
  for (const change of plan.changes) {
    const label =
      change.kind === "create" ? chalk.green("create") : chalk.yellow("update");
    console.log(
      `${dryRun ? chalk.dim("would ") : ""}${label} ${prettyPath(change.path)}`,
    );
    // Creating writes a template verbatim, printing it would drown the diffs of
    // the files being changed around it
    if (change.kind === "update") {
      for (const line of formatDiff(change.previous, change.contents)) {
        console.log(chalk.dim("│ ") + line);
      }
    }
  }
  for (const notice of plan.notices) {
    console.log(`${chalk.yellow("ℹ︎")} ${notice}`);
  }
  if (plan.changes.length === 0) {
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
