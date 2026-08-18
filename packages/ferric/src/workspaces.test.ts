import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  addWorkspacePattern,
  isPathCovered,
  parseNpmWorkspacePatterns,
  parsePnpmWorkspacePatterns,
  type Workspace,
} from "./workspaces.js";

const PNPM_WORKSPACE: Workspace = {
  kind: "pnpm",
  rootPath: "/repo",
  configPath: "/repo/pnpm-workspace.yaml",
  patterns: [],
};

const NPM_WORKSPACE: Workspace = {
  kind: "npm",
  rootPath: "/repo",
  configPath: "/repo/package.json",
  patterns: [],
};

describe("parsePnpmWorkspacePatterns", () => {
  it("reads a block sequence", () => {
    assert.deepEqual(
      parsePnpmWorkspacePatterns(
        [
          "packages:",
          "  - packages/*",
          '  - "apps/test-app" # quoted',
          "  - '!packages/excluded'",
          "",
          "onlyBuiltDependencies:",
          "  - esbuild",
        ].join("\n"),
      ),
      ["packages/*", "apps/test-app", "!packages/excluded"],
    );
  });

  it("returns undefined for a flow sequence", () => {
    assert.equal(
      parsePnpmWorkspacePatterns('packages: ["packages/*"]'),
      undefined,
    );
  });

  it("returns undefined without a packages key", () => {
    assert.equal(
      parsePnpmWorkspacePatterns("onlyBuiltDependencies:\n"),
      undefined,
    );
  });
});

describe("parseNpmWorkspacePatterns", () => {
  it("reads an array", () => {
    assert.deepEqual(
      parseNpmWorkspacePatterns('{ "workspaces": ["packages/*"] }'),
      ["packages/*"],
    );
  });

  it("reads the yarn object form", () => {
    assert.deepEqual(
      parseNpmWorkspacePatterns(
        '{ "workspaces": { "packages": ["packages/*"], "nohoist": [] } }',
      ),
      ["packages/*"],
    );
  });

  it("returns undefined without workspaces", () => {
    assert.equal(parseNpmWorkspacePatterns('{ "name": "my-app" }'), undefined);
  });
});

describe("isPathCovered", () => {
  it("matches a single path component per star", () => {
    assert.equal(isPathCovered(["packages/*"], "packages/my-addon"), true);
    assert.equal(
      isPathCovered(["packages/*"], "packages/nested/my-addon"),
      false,
    );
  });

  it("matches any depth per double star", () => {
    assert.equal(
      isPathCovered(["packages/**"], "packages/nested/my-addon"),
      true,
    );
  });

  it("matches an exact path", () => {
    assert.equal(isPathCovered(["apps/test-app"], "apps/test-app"), true);
    assert.equal(isPathCovered(["apps/test-app"], "apps/test-apple"), false);
  });

  it("applies negations after matches", () => {
    assert.equal(
      isPathCovered(["packages/*", "!packages/my-addon"], "packages/my-addon"),
      false,
    );
    assert.equal(isPathCovered([], "packages/my-addon"), false);
  });
});

describe("addWorkspacePattern", () => {
  it("appends to a pnpm block sequence", () => {
    assert.equal(
      addWorkspacePattern(
        PNPM_WORKSPACE,
        [
          "packages:",
          "  - apps/*",
          "",
          "onlyBuiltDependencies:",
          "  - esbuild",
          "",
        ].join("\n"),
        "packages/my-addon",
      ),
      [
        "packages:",
        "  - apps/*",
        "  - packages/my-addon",
        "",
        "onlyBuiltDependencies:",
        "  - esbuild",
        "",
      ].join("\n"),
    );
  });

  it("gives up on a pnpm flow sequence", () => {
    assert.equal(
      addWorkspacePattern(
        PNPM_WORKSPACE,
        'packages: ["apps/*"]\n',
        "packages/my-addon",
      ),
      undefined,
    );
  });

  it("appends to a package.json array", () => {
    assert.equal(
      addWorkspacePattern(
        NPM_WORKSPACE,
        '{\n  "workspaces": [\n    "apps/*"\n  ]\n}\n',
        "packages/my-addon",
      ),
      '{\n  "workspaces": [\n    "apps/*",\n    "packages/my-addon"\n  ]\n}\n',
    );
  });

  it("appends to the yarn object form", () => {
    assert.equal(
      addWorkspacePattern(
        NPM_WORKSPACE,
        '{\n  "workspaces": {\n    "packages": [\n      "apps/*"\n    ]\n  }\n}\n',
        "packages/my-addon",
      ),
      '{\n  "workspaces": {\n    "packages": [\n      "apps/*",\n      "packages/my-addon"\n    ]\n  }\n}\n',
    );
  });
});
