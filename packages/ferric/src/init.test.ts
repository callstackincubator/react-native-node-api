import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, TestContext } from "node:test";

import {
  applyChanges,
  crateNameFromPackageName,
  determineDependencySpecifiers,
  planInit,
  type InitPlan,
} from "./init.js";
import { findWorkspace } from "./workspaces.js";

interface FileMap {
  [filePath: string]: string;
}

function setupTempDirectory(context: TestContext, files: FileMap = {}) {
  const tempPath = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "ferric-init-test-")),
  );
  context.after(() => {
    if (!process.env.KEEP_TEMP_DIRS) {
      fs.rmSync(tempPath, { recursive: true, force: true });
    }
  });
  for (const [filePath, contents] of Object.entries(files)) {
    const fullPath = path.join(tempPath, filePath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, contents, "utf8");
  }
  return tempPath;
}

function readPackageJson(packagePath: string) {
  const contents = fs.readFileSync(
    path.join(packagePath, "package.json"),
    "utf8",
  );
  return JSON.parse(contents) as Record<string, unknown>;
}

function keysOf(value: unknown) {
  assert.ok(typeof value === "object" && value !== null);
  return Object.keys(value);
}

function changedPaths(plan: InitPlan, packagePath: string) {
  return plan.changes
    .map(({ path: filePath }) => path.relative(packagePath, filePath))
    .map((filePath) => filePath.split(path.sep).join("/"))
    .sort();
}

describe("crateNameFromPackageName", () => {
  it("strips the scope", () => {
    assert.equal(crateNameFromPackageName("@my-org/my-addon"), "my-addon");
    assert.equal(crateNameFromPackageName("my-addon"), "my-addon");
  });
});

describe("determineDependencySpecifiers", () => {
  it("uses the workspace protocol inside the mono-repo", () => {
    const workspace = findWorkspace(path.resolve(import.meta.dirname, ".."));
    assert.deepEqual(determineDependencySpecifiers(workspace), {
      hostSpecifier: "workspace:*",
      ferricSpecifier: "workspace:*",
    });
  });

  it("uses released versions elsewhere", () => {
    const { ferricSpecifier } = determineDependencySpecifiers(undefined);
    assert.match(ferricSpecifier, /^\^\d+\.\d+\.\d+/);
  });
});

describe("planInit", () => {
  it("scaffolds a package from scratch", async (context) => {
    const tempPath = setupTempDirectory(context);
    const packagePath = path.join(tempPath, "my-addon");
    const plan = await planInit({ packagePath });

    assert.equal(plan.crateName, "my-addon");
    assert.equal(plan.libraryName, "my_addon");
    assert.deepEqual(changedPaths(plan, packagePath), [
      ".gitignore",
      "Cargo.toml",
      "build.rs",
      "package.json",
      "src/lib.rs",
    ]);

    await applyChanges(plan.changes);

    const packageJson = readPackageJson(packagePath);
    assert.equal(packageJson["name"], "my-addon");
    assert.equal(packageJson["main"], "my_addon.js");
    assert.equal(packageJson["types"], "my_addon.d.ts");
    assert.deepEqual(packageJson["files"], [
      "my_addon.js",
      "my_addon.d.ts",
      "my_addon.apple.node",
      "my_addon.android.node",
    ]);
    assert.deepEqual(packageJson["scripts"], {
      build: "ferric build",
      "build:types": "ferric build --dts-only",
    });
    assert.deepEqual(keysOf(packageJson["dependencies"]), [
      "react-native-node-api",
    ]);
    assert.deepEqual(keysOf(packageJson["devDependencies"]), ["ferric-cli"]);

    const cargoToml = fs.readFileSync(
      path.join(packagePath, "Cargo.toml"),
      "utf8",
    );
    assert.match(cargoToml, /^name = "my-addon"$/m);
    assert.doesNotMatch(cargoToml, /{{name}}/);
    assert.match(cargoToml, /crate-type = \["cdylib"\]/);

    assert.ok(fs.existsSync(path.join(packagePath, "src", "lib.rs")));
    assert.ok(fs.existsSync(path.join(packagePath, "build.rs")));
  });

  it("is a no-op when run again", async (context) => {
    const tempPath = setupTempDirectory(context);
    const packagePath = path.join(tempPath, "my-addon");
    await applyChanges((await planInit({ packagePath })).changes);

    const plan = await planInit({ packagePath });
    assert.deepEqual(plan.changes, []);
    assert.deepEqual(plan.notices, []);
  });

  it("writes nothing while planning", async (context) => {
    const tempPath = setupTempDirectory(context);
    const packagePath = path.join(tempPath, "my-addon");
    const plan = await planInit({ packagePath });
    assert.ok(plan.changes.length > 0);
    assert.equal(fs.existsSync(packagePath), false);
  });

  it("derives the crate name from a scoped package name", async (context) => {
    const packagePath = setupTempDirectory(context, {
      "package.json": JSON.stringify({ name: "@my-org/my-addon" }, null, 2),
    });
    const plan = await planInit({ packagePath });
    assert.equal(plan.crateName, "my-addon");
    assert.equal(plan.libraryName, "my_addon");
    await applyChanges(plan.changes);
    assert.equal(readPackageJson(packagePath)["name"], "@my-org/my-addon");
    assert.equal(readPackageJson(packagePath)["main"], "my_addon.js");
  });

  it("uses the crate name passed by the caller", async (context) => {
    const packagePath = setupTempDirectory(context, {
      "package.json": JSON.stringify({ name: "my-addon" }, null, 2),
    });
    const plan = await planInit({ packagePath, crateName: "other_name" });
    assert.equal(plan.libraryName, "other_name");
  });

  it("rejects a crate name Cargo won't accept", async (context) => {
    const packagePath = setupTempDirectory(context, {
      "package.json": JSON.stringify({ name: "@my-org/123" }, null, 2),
    });
    await assert.rejects(() => planInit({ packagePath }), /crate name/);
  });

  it("keeps the values an existing package declares", async (context) => {
    const packagePath = setupTempDirectory(context, {
      "package.json": JSON.stringify(
        {
          name: "my-addon",
          version: "2.1.0",
          main: "index.js",
          files: ["index.js"],
          scripts: { build: "make" },
          devDependencies: { "ferric-cli": "0.1.0" },
        },
        null,
        2,
      ),
    });
    await applyChanges((await planInit({ packagePath })).changes);

    const packageJson = readPackageJson(packagePath);
    assert.equal(packageJson["version"], "2.1.0");
    assert.equal(packageJson["main"], "index.js");
    assert.deepEqual(packageJson["scripts"], {
      build: "make",
      "build:types": "ferric build --dts-only",
    });
    assert.deepEqual(packageJson["devDependencies"], {
      "ferric-cli": "0.1.0",
    });
    // The artifacts are added to an existing "files", which would otherwise
    // keep them out of the published package
    assert.deepEqual(packageJson["files"], [
      "index.js",
      "my_addon.js",
      "my_addon.d.ts",
      "my_addon.apple.node",
      "my_addon.android.node",
    ]);
  });

  it("leaves an existing Cargo manifest alone, noticing what it lacks", async (context) => {
    const packagePath = setupTempDirectory(context, {
      "Cargo.toml": [
        "[package]",
        'name = "renamed-by-hand"',
        "",
        "[dependencies]",
        'napi = "=3.4.0"',
        "",
      ].join("\n"),
    });
    const plan = await planInit({ packagePath });
    assert.equal(
      plan.changes.some(({ path: filePath }) =>
        filePath.endsWith("Cargo.toml"),
      ),
      false,
    );
    assert.equal(plan.notices.length, 3);
    assert.match(plan.notices.join("\n"), /cdylib/);
    assert.match(plan.notices.join("\n"), /napi-derive/);
    assert.match(plan.notices.join("\n"), /napi-build/);
  });

  it("adds the package to a pnpm workspace", async (context) => {
    const tempPath = setupTempDirectory(context, {
      "pnpm-workspace.yaml": ["packages:", "  - apps/*", ""].join("\n"),
    });
    const packagePath = path.join(tempPath, "packages", "my-addon");
    const plan = await planInit({ packagePath });
    await applyChanges(plan.changes);

    assert.equal(
      fs.readFileSync(path.join(tempPath, "pnpm-workspace.yaml"), "utf8"),
      ["packages:", "  - apps/*", "  - packages/my-addon", ""].join("\n"),
    );
  });

  it("leaves a workspace already covering the package alone", async (context) => {
    const tempPath = setupTempDirectory(context, {
      "pnpm-workspace.yaml": ["packages:", "  - packages/*", ""].join("\n"),
    });
    const packagePath = path.join(tempPath, "packages", "my-addon");
    const plan = await planInit({ packagePath });
    assert.deepEqual(
      plan.changes.filter(({ path: filePath }) =>
        filePath.startsWith(path.join(tempPath, "pnpm-workspace.yaml")),
      ),
      [],
    );
  });

  it("notices a workspace it cannot edit", async (context) => {
    const tempPath = setupTempDirectory(context, {
      "pnpm-workspace.yaml": ['packages: ["apps/*"]', ""].join("\n"),
    });
    const packagePath = path.join(tempPath, "packages", "my-addon");
    const plan = await planInit({ packagePath });
    assert.equal(plan.changes.length, 5);
    assert.match(plan.notices.join("\n"), /packages\/my-addon/);
  });

  it("has nothing to change about the ferric-example package", async () => {
    // The example is what a package initialized by this command grows into, so
    // it doubles as the fixture asserting an already initialized package is
    // left untouched (see #299).
    const packagePath = path.resolve(
      import.meta.dirname,
      "../../ferric-example",
    );
    const plan = await planInit({ packagePath });
    assert.deepEqual(changedPaths(plan, packagePath), []);
    assert.deepEqual(plan.notices, []);
  });
});
