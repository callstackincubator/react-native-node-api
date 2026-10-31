import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, TestContext } from "node:test";

import { parse as parseToml } from "smol-toml";

import {
  applyChanges,
  assertDistinctChanges,
  crateNameFromPackageName,
  DEFAULT_CRATE_VERSIONS,
  DEFAULT_NODE_API_VERSION,
  determineDependencySpecifiers,
  formatDiff,
  planInit,
  type InitPlan,
} from "./init.js";
import { parseJsonObject } from "./json.js";
import { findWorkspace } from "./workspaces.js";

const FERRIC_EXAMPLE_PATH = path.resolve(
  import.meta.dirname,
  "..",
  "..",
  "ferric-example",
);

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
  return parseJsonObject(
    fs.readFileSync(path.join(packagePath, "package.json"), "utf8"),
  );
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

describe("assertDistinctChanges", () => {
  it("rejects two changes to the same file", () => {
    assertDistinctChanges([{ path: "a" }, { path: "b" }]);
    assert.throws(() =>
      assertDistinctChanges([{ path: "a" }, { path: "b" }, { path: "a" }]),
    );
  });
});

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
          devDependencies: { "ferric-cli": "999.0.0" },
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
      "ferric-cli": "999.0.0",
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

  it("notices what an existing Cargo manifest lacks", async (context) => {
    const packagePath = setupTempDirectory(context, {
      "Cargo.toml": [
        "[package]",
        'name = "renamed-by-hand"',
        "",
        "[dependencies]",
        'napi = "3.14.2"',
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
    const notices = plan.notices.join("\n");
    assert.match(notices, /cdylib/);
    assert.match(notices, /napi-derive/);
    assert.match(notices, /napi-build/);
    assert.match(notices, /default-features/);
  });

  it("bumps outdated crates of an existing Cargo manifest in place", async (context) => {
    const packagePath = setupTempDirectory(context, {
      "Cargo.toml": [
        "# Keep this comment",
        "[lib]",
        'crate-type = ["cdylib"]',
        "",
        "[dependencies.napi]",
        'version = "=3.4.0" # and this one',
        "default-features = false",
        "",
        "[dependencies]",
        'napi-derive = { version = "3.3.0", features = ["type-def"] }',
        "",
        "[build-dependencies]",
        'napi-build = "9.0.0"',
        "",
      ].join("\n"),
    });
    const plan = await planInit({ packagePath });
    const change = plan.changes.find(({ path: filePath }) =>
      filePath.endsWith("Cargo.toml"),
    );
    assert(change);
    assert.equal(
      change.contents,
      [
        "# Keep this comment",
        "[lib]",
        'crate-type = ["cdylib"]',
        "",
        "[dependencies.napi]",
        `version = "${DEFAULT_CRATE_VERSIONS.napi}" # and this one`,
        "default-features = false",
        "",
        "[dependencies]",
        `napi-derive = { version = "${DEFAULT_CRATE_VERSIONS["napi-derive"]}", features = ["type-def"] }`,
        "",
        "[build-dependencies]",
        'napi-build = "9.0.0"',
        "",
      ].join("\n"),
    );
    assert.deepEqual(plan.notices, []);
  });

  it("notices crates it cannot bump and a stale napi-sys pin", async (context) => {
    const packagePath = setupTempDirectory(context, {
      "Cargo.toml": [
        "[lib]",
        'crate-type = ["cdylib"]',
        "",
        "[dependencies]",
        "napi = { workspace = true, default-features = false }",
        'napi-derive = "3.6.12"',
        'napi-sys = { version = "=3.0.1", features = ["dyn-symbols"] }',
        "",
        "[build-dependencies]",
        'napi-build = "2.6.0"',
        "",
      ].join("\n"),
    });
    const notices = (await planInit({ packagePath })).notices.join("\n");
    assert.match(notices, /doesn't declare .*napi.* with a version/);
    assert.match(notices, /pins .*napi-sys/);
    assert.match(notices, /dyn-symbols/);
  });

  it("notices options which only apply to a new Cargo manifest", async (context) => {
    const packagePath = setupTempDirectory(context, { "Cargo.toml": "" });
    const { notices } = await planInit({
      packagePath,
      nodeApiVersion: 10,
      releaseProfile: "size",
    });
    assert.match(notices.join("\n"), /--node-api-version/);
    assert.match(notices.join("\n"), /--release-profile/);
  });

  it("writes the options into a new Cargo manifest", async (context) => {
    const packagePath = setupTempDirectory(context);
    const plan = await planInit({
      packagePath,
      nodeApiVersion: 10,
      crateVersions: { napi: "3.15.0", "napi-build": "2.7.0" },
      releaseProfile: "size",
    });
    const change = plan.changes.find(({ path: filePath }) =>
      filePath.endsWith("Cargo.toml"),
    );
    assert(change);
    const manifest = parseJsonObject(
      JSON.stringify(parseToml(change.contents)),
    );
    assert.deepEqual(manifest["dependencies"], {
      napi: {
        version: "3.15.0",
        "default-features": false,
        features: ["napi10"],
      },
      "napi-derive": {
        version: DEFAULT_CRATE_VERSIONS["napi-derive"],
        features: ["type-def"],
      },
    });
    assert.deepEqual(manifest["build-dependencies"], { "napi-build": "2.7.0" });
    assert.deepEqual(manifest["profile"], {
      release: {
        lto: true,
        "codegen-units": 1,
        "opt-level": "z",
        strip: true,
      },
    });
  });

  it("omits the release profile when asked to", async (context) => {
    const packagePath = setupTempDirectory(context);
    const plan = await planInit({ packagePath, releaseProfile: "none" });
    const change = plan.changes.find(({ path: filePath }) =>
      filePath.endsWith("Cargo.toml"),
    );
    assert(change);
    assert.equal(parseToml(change.contents)["profile"], undefined);
    assert.match(change.contents, /"\r?\n$/);
  });

  it("defaults to Node-API version 10", async (context) => {
    const packagePath = setupTempDirectory(context);
    const plan = await planInit({ packagePath });
    assert.equal(DEFAULT_NODE_API_VERSION, 10);
    const change = plan.changes.find(({ path: filePath }) =>
      filePath.endsWith("Cargo.toml"),
    );
    assert(change);
    assert.match(change.contents, /features = \["napi10"\]/);
  });

  it("rejects versions it cannot use", async (context) => {
    const packagePath = setupTempDirectory(context);
    await assert.rejects(planInit({ packagePath, nodeApiVersion: 11 }));
    await assert.rejects(planInit({ packagePath, nodeApiVersion: Number.NaN }));
    await assert.rejects(
      planInit({ packagePath, crateVersions: { napi: "not-a-version" } }),
    );
  });

  it("bumps outdated dependencies but keeps newer and non-version ones", async (context) => {
    const packagePath = setupTempDirectory(context, {
      "package.json": JSON.stringify({
        name: "my-addon",
        peerDependencies: { "react-native-node-api": "^999.0.0" },
        devDependencies: { "ferric-cli": "^0.0.1" },
      }),
    });
    const plan = await planInit({ packagePath });
    await applyChanges(plan.changes);
    const packageJson = readPackageJson(packagePath);
    const { ferricSpecifier } = determineDependencySpecifiers(undefined);
    assert.deepEqual(packageJson["peerDependencies"], {
      "react-native-node-api": "^999.0.0",
    });
    assert.deepEqual(packageJson["devDependencies"], {
      "ferric-cli": ferricSpecifier,
    });
  });

  it("skips differing entrypoints and source files", async (context) => {
    const packagePath = setupTempDirectory(context, {
      "package.json": JSON.stringify({
        name: "my-addon",
        main: "index.js",
        type: "module",
      }),
      "src/lib.rs": "// mine\n",
    });
    const plan = await planInit({ packagePath });
    await applyChanges(plan.changes);

    assert.equal(readPackageJson(packagePath)["main"], "index.js");
    assert.equal(
      fs.readFileSync(path.join(packagePath, "src/lib.rs"), "utf8"),
      "// mine\n",
    );
    const skipped = plan.skips.map(({ path: filePath }) =>
      path.relative(packagePath, filePath),
    );
    assert.deepEqual(skipped.sort(), [
      "package.json",
      path.join("src", "lib.rs"),
    ]);
    const packageJsonSkip = plan.skips.find(({ path: filePath }) =>
      filePath.endsWith("package.json"),
    );
    assert(packageJsonSkip);
    assert.match(
      packageJsonSkip.hint ?? "",
      /export \{ default \} from "\.\/my_addon\.js"/,
    );
    assert.match(packageJsonSkip.contents, /"main": "my_addon\.js"/);
  });

  it("overwrites them when forced", async (context) => {
    const packagePath = setupTempDirectory(context, {
      "package.json": JSON.stringify({ name: "my-addon", main: "index.js" }),
      "src/lib.rs": "// mine\n",
    });
    const plan = await planInit({ packagePath, force: true });
    await applyChanges(plan.changes);

    assert.deepEqual(plan.skips, []);
    assert.equal(readPackageJson(packagePath)["main"], "my_addon.js");
    assert.match(
      fs.readFileSync(path.join(packagePath, "src/lib.rs"), "utf8"),
      /#\[napi\]/,
    );
  });

  it("notices a Cargo manifest it cannot parse", async (context) => {
    const packagePath = setupTempDirectory(context, {
      "Cargo.toml": "[package\nname =\n",
    });
    const plan = await planInit({ packagePath });
    assert.equal(plan.notices.length, 1);
    assert.match(plan.notices[0], /could not be parsed/);
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
    const packagePath = FERRIC_EXAMPLE_PATH;
    const plan = await planInit({ packagePath });
    assert.deepEqual(changedPaths(plan, packagePath), []);
    assert.deepEqual(plan.skips, []);
    assert.deepEqual(plan.notices, []);
  });
});

describe("formatDiff", () => {
  it("renders the changed lines with context", () => {
    const lines = formatDiff("a\nb\nc\n", "a\nb\nB\nc\n").map((line) =>
      // eslint-disable-next-line no-control-regex -- dropping the colors
      line.replace(/\u001b\[\d+m/g, ""),
    );
    assert.deepEqual(lines, ["@@ -1,3 +1,4 @@", " a", " b", "+B", " c"]);
  });
});
