import fs from "node:fs";
import path from "node:path";

import {
  detectJsonIndentation,
  getStringArrayProperty,
  getObjectProperty,
  parseJsonObject,
  stringifyJson,
} from "./json.js";

export type Workspace = {
  kind: "pnpm" | "npm";
  /** Directory declaring the workspace. */
  rootPath: string;
  /** File declaring the package patterns. */
  configPath: string;
  /**
   * Patterns of the workspace, or undefined if the file declares them in a form
   * this can't read (such as a YAML flow sequence).
   */
  patterns: string[] | undefined;
};

/**
 * Find the workspace containing a package, by looking for a pnpm workspace file
 * or a package.json declaring "workspaces" in the ancestor directories.
 */
export function findWorkspace(packagePath: string): Workspace | undefined {
  let currentPath = path.dirname(path.resolve(packagePath));
  for (;;) {
    const pnpmConfigPath = path.join(currentPath, "pnpm-workspace.yaml");
    if (fs.existsSync(pnpmConfigPath)) {
      return {
        kind: "pnpm",
        rootPath: currentPath,
        configPath: pnpmConfigPath,
        patterns: parsePnpmWorkspacePatterns(
          fs.readFileSync(pnpmConfigPath, "utf8"),
        ),
      };
    }
    const packageJsonPath = path.join(currentPath, "package.json");
    if (fs.existsSync(packageJsonPath)) {
      const patterns = parseNpmWorkspacePatterns(
        fs.readFileSync(packageJsonPath, "utf8"),
      );
      if (patterns) {
        return {
          kind: "npm",
          rootPath: currentPath,
          configPath: packageJsonPath,
          patterns,
        };
      }
    }
    const parentPath = path.dirname(currentPath);
    if (parentPath === currentPath) {
      return undefined;
    }
    currentPath = parentPath;
  }
}

const PNPM_PACKAGES_KEY = /^packages:(.*)$/;
const YAML_SEQUENCE_ITEM = /^(\s+)-\s*(.*)$/;

export function parsePnpmWorkspacePatterns(contents: string) {
  const lines = contents.split(/\r?\n/);
  const keyIndex = lines.findIndex((line) => PNPM_PACKAGES_KEY.test(line));
  if (keyIndex < 0) {
    return undefined;
  }
  const [, rest] = lines[keyIndex].match(PNPM_PACKAGES_KEY) ?? [];
  if (stripComment(rest ?? "").trim().length > 0) {
    // A flow sequence (or an anchor / alias) rather than a block sequence
    return undefined;
  }
  const result: string[] = [];
  for (const line of lines.slice(keyIndex + 1)) {
    if (line.trim().length === 0 || line.trimStart().startsWith("#")) {
      continue;
    }
    const match = line.match(YAML_SEQUENCE_ITEM);
    if (!match) {
      break;
    }
    result.push(parseYamlScalar(match[2]));
  }
  return result;
}

export function parseNpmWorkspacePatterns(contents: string) {
  const packageJson = parseJsonObject(contents);
  const workspaces = packageJson["workspaces"];
  if (Array.isArray(workspaces)) {
    return getStringArrayProperty(packageJson, "workspaces");
  } else if (typeof workspaces === "object" && workspaces !== null) {
    // Yarn allows an object with "packages" (and "nohoist")
    const object = getObjectProperty(packageJson, "workspaces");
    return object && getStringArrayProperty(object, "packages");
  } else {
    return undefined;
  }
}

function stripComment(value: string) {
  const match = value.match(/(^|\s)#/);
  return match ? value.slice(0, match.index) : value;
}

function parseYamlScalar(value: string) {
  const quoted = value.match(/^(["'])(.*)\1/);
  return quoted ? quoted[2] : stripComment(value).trim();
}

/**
 * Turn a workspace package pattern into an anchored regular expression.
 * Only the subset of globbing used by workspace patterns is supported: "*"
 * matching within a path component and "**" matching across components.
 */
export function patternToRegExp(pattern: string) {
  const trimmed = pattern.replace(/^\.\//, "").replace(/\/$/, "");
  const source = trimmed.replace(/\*\*|\*|\?|[.+^${}()|[\]\\]/g, (match) => {
    if (match === "**") {
      return ".*";
    } else if (match === "*") {
      return "[^/]*";
    } else if (match === "?") {
      return "[^/]";
    } else {
      return `\\${match}`;
    }
  });
  return new RegExp(`^${source}$`);
}

/**
 * Determine if a path (relative to the workspace root, using forward slashes)
 * is matched by the workspace patterns.
 */
export function isPathCovered(patterns: string[], relativePath: string) {
  let result = false;
  for (const pattern of patterns) {
    const negated = pattern.startsWith("!");
    const matches = patternToRegExp(negated ? pattern.slice(1) : pattern).test(
      relativePath,
    );
    if (matches) {
      result = !negated;
    }
  }
  return result;
}

export function relativeWorkspacePath(
  workspace: Workspace,
  packagePath: string,
) {
  return path
    .relative(workspace.rootPath, path.resolve(packagePath))
    .split(path.sep)
    .join("/");
}

/**
 * Produce the contents of the workspace configuration file with a package
 * pattern added, or undefined if the file declares its packages in a form this
 * can't safely edit.
 */
export function addWorkspacePattern(
  workspace: Workspace,
  contents: string,
  pattern: string,
) {
  return workspace.kind === "pnpm"
    ? addPnpmWorkspacePattern(contents, pattern)
    : addNpmWorkspacePattern(contents, pattern);
}

function addPnpmWorkspacePattern(contents: string, pattern: string) {
  const newline = contents.includes("\r\n") ? "\r\n" : "\n";
  const lines = contents.split(/\r?\n/);
  const keyIndex = lines.findIndex((line) => PNPM_PACKAGES_KEY.test(line));
  if (keyIndex < 0) {
    return undefined;
  }
  let insertIndex = -1;
  let indentation = "  ";
  for (const [offset, line] of lines.slice(keyIndex + 1).entries()) {
    if (line.trim().length === 0 || line.trimStart().startsWith("#")) {
      continue;
    }
    const match = line.match(YAML_SEQUENCE_ITEM);
    if (!match) {
      break;
    }
    insertIndex = keyIndex + 1 + offset;
    indentation = match[1];
  }
  if (insertIndex < 0) {
    // An empty (or flow) sequence: the block sequence we'd append to is missing
    return undefined;
  }
  lines.splice(insertIndex + 1, 0, `${indentation}- ${pattern}`);
  return lines.join(newline);
}

function addNpmWorkspacePattern(contents: string, pattern: string) {
  const packageJson = parseJsonObject(contents);
  const indentation = detectJsonIndentation(contents);
  const workspaces = packageJson["workspaces"];
  if (Array.isArray(workspaces)) {
    const patterns = getStringArrayProperty(packageJson, "workspaces") ?? [];
    return stringifyJson(
      { ...packageJson, workspaces: [...patterns, pattern] },
      indentation,
    );
  }
  const object = getObjectProperty(packageJson, "workspaces");
  if (!object || !Array.isArray(object["packages"])) {
    return undefined;
  }
  const patterns = getStringArrayProperty(object, "packages") ?? [];
  return stringifyJson(
    {
      ...packageJson,
      workspaces: { ...object, packages: [...patterns, pattern] },
    },
    indentation,
  );
}
