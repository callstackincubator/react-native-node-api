import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, TestContext } from "node:test";

import {
  applyChanges,
  parseJsonObject,
} from "@react-native-node-api/cli-utils";

import { inspectCmakeProject, planInit, type InitPlan } from "./init.js";

const EXAMPLE_PATH = path.resolve(
  import.meta.dirname,
  "..",
  "..",
  "cmake-rn-example",
);

interface FileMap {
  [filePath: string]: string;
}

function setupTempDirectory(context: TestContext, files: FileMap = {}) {
  const tempPath = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "cmake-rn-init-test-")),
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

function relativePaths(
  entries: { path: string }[],
  packagePath: string,
): string[] {
  return entries
    .map(({ path: filePath }) => path.relative(packagePath, filePath))
    .map((filePath) => filePath.split(path.sep).join("/"))
    .sort();
}

function changedPaths(plan: InitPlan, packagePath: string) {
  return relativePaths(plan.changes, packagePath);
}

const LINKED_CMAKE_LISTS = [
  "cmake_minimum_required(VERSION 3.15)",
  "project(mine)",
  "include(${WEAK_NODE_API_CONFIG})",
  "add_library(my-addon SHARED addon.cpp)",
  "target_link_libraries(my-addon PRIVATE weak-node-api)",
  "",
].join("\n");

describe("planInit", () => {
  it("scaffolds a package from scratch", async (context) => {
    const tempPath = setupTempDirectory(context);
    const packagePath = path.join(tempPath, "my-addon");
    const plan = await planInit({ packagePath });
    await applyChanges(plan.changes);

    assert.equal(plan.libraryName, "my-addon");
    assert.deepEqual(changedPaths(plan, packagePath), [
      ".gitignore",
      "CMakeLists.txt",
      "my-addon.d.ts",
      "my-addon.js",
      "package.json",
      "src/addon.c",
    ]);
    assert.deepEqual(plan.skips, []);
    assert.deepEqual(plan.notices, []);

    const packageJson = readPackageJson(packagePath);
    assert.equal(packageJson["main"], "my-addon.js");
    assert.equal(packageJson["types"], "my-addon.d.ts");
    assert.deepEqual(packageJson["scripts"], { build: "cmake-rn" });
    assert.deepEqual(packageJson["files"], [
      "my-addon.js",
      "my-addon.d.ts",
      "build/Release/my-addon.apple.node",
      "build/Release/my-addon.android.node",
    ]);

    const cmakeLists = fs.readFileSync(
      path.join(packagePath, "CMakeLists.txt"),
      "utf8",
    );
    assert.match(cmakeLists, /^project\(my-addon\)$/m);
    assert.match(cmakeLists, /include\(\$\{WEAK_NODE_API_CONFIG\}\)/);
    assert.match(
      cmakeLists,
      /target_link_libraries\(my-addon PRIVATE weak-node-api\)/,
    );
    assert.deepEqual(inspectCmakeProject(cmakeLists, "my-addon"), []);
    assert.equal(
      fs.readFileSync(path.join(packagePath, "my-addon.js"), "utf8"),
      'module.exports = require("./build/Release/my-addon.node");\n',
    );
  });

  it("is a no-op when run again", async (context) => {
    const packagePath = setupTempDirectory(context);
    await applyChanges((await planInit({ packagePath })).changes);
    const plan = await planInit({ packagePath });
    assert.deepEqual(plan.changes, []);
    assert.deepEqual(plan.skips, []);
    assert.deepEqual(plan.notices, []);
  });

  it("writes nothing while planning", async (context) => {
    const packagePath = setupTempDirectory(context);
    await planInit({ packagePath });
    assert.deepEqual(fs.readdirSync(packagePath), []);
  });

  it("derives the library name from a scoped package name", async (context) => {
    const packagePath = setupTempDirectory(context, {
      "package.json": JSON.stringify({ name: "@my-org/my-addon" }),
    });
    const plan = await planInit({ packagePath });
    assert.equal(plan.packageName, "@my-org/my-addon");
    assert.equal(plan.libraryName, "my-addon");
  });

  it("uses the library name passed by the caller", async (context) => {
    const packagePath = setupTempDirectory(context);
    const plan = await planInit({ packagePath, libraryName: "custom" });
    assert.ok(changedPaths(plan, packagePath).includes("custom.js"));
  });

  it("rejects a library name it cannot use", async (context) => {
    const packagePath = setupTempDirectory(context);
    await assert.rejects(planInit({ packagePath, libraryName: "1 addon" }));
  });

  it("keeps the values an existing package declares", async (context) => {
    const packagePath = setupTempDirectory(context, {
      "package.json": JSON.stringify(
        {
          name: "my-addon",
          version: "1.2.3",
          scripts: { build: "cmake-rn --strip", test: "node --test" },
          dependencies: { "react-native-node-api": "workspace:*" },
        },
        null,
        4,
      ),
    });
    const plan = await planInit({ packagePath });
    await applyChanges(plan.changes);

    const contents = fs.readFileSync(
      path.join(packagePath, "package.json"),
      "utf8",
    );
    assert.match(contents, /^ {4}"name"/m, "Expected indentation to be kept");
    const packageJson = parseJsonObject(contents);
    assert.equal(packageJson["version"], "1.2.3");
    assert.deepEqual(packageJson["scripts"], {
      build: "cmake-rn --strip",
      test: "node --test",
    });
    assert.equal(packageJson["files"], undefined);
    assert.deepEqual(packageJson["dependencies"], {
      "react-native-node-api": "workspace:*",
    });
  });

  it("inspects an existing CMake project instead of replacing it", async (context) => {
    const packagePath = setupTempDirectory(context, {
      "package.json": JSON.stringify({ name: "my-addon" }),
      "CMakeLists.txt": LINKED_CMAKE_LISTS,
    });
    const plan = await planInit({ packagePath });
    assert.deepEqual(changedPaths(plan, packagePath), [
      ".gitignore",
      "my-addon.d.ts",
      "my-addon.js",
      "package.json",
    ]);
    assert.deepEqual(plan.skips, []);
    assert.deepEqual(plan.notices, []);
  });

  it("overwrites the CMake project when forced", async (context) => {
    const packagePath = setupTempDirectory(context, {
      "CMakeLists.txt": LINKED_CMAKE_LISTS,
    });
    const plan = await planInit({ packagePath, force: true });
    assert.ok(
      plan.changes.some(
        (change) =>
          change.kind === "update" &&
          change.forced &&
          change.path.endsWith("CMakeLists.txt"),
      ),
    );
    assert.ok(changedPaths(plan, packagePath).includes("src/addon.c"));
  });

  it("skips differing entrypoints and source files", async (context) => {
    const packagePath = setupTempDirectory(context, {
      "package.json": JSON.stringify({ name: "my-addon", main: "index.js" }),
      "my-addon.js": "// mine\n",
      "src/addon.c": "// mine\n",
    });
    const plan = await planInit({ packagePath });
    assert.deepEqual(relativePaths(plan.skips, packagePath), [
      "my-addon.js",
      "package.json",
      "src/addon.c",
    ]);

    const forced = await planInit({ packagePath, force: true });
    assert.deepEqual(forced.skips, []);
    await applyChanges(forced.changes);
    assert.equal(readPackageJson(packagePath)["main"], "my-addon.js");
  });

  it("adds the package to an npm workspace", async (context) => {
    const tempPath = setupTempDirectory(context, {
      "package.json": JSON.stringify({ workspaces: ["apps/*"] }),
    });
    const packagePath = path.join(tempPath, "packages", "my-addon");
    const plan = await planInit({ packagePath });
    await applyChanges(plan.changes);
    assert.deepEqual(readPackageJson(tempPath)["workspaces"], [
      "apps/*",
      "packages/my-addon",
    ]);
  });

  it("has nothing to change about the cmake-rn-example package", async () => {
    const plan = await planInit({ packagePath: EXAMPLE_PATH });
    assert.deepEqual(changedPaths(plan, EXAMPLE_PATH), []);
    assert.deepEqual(plan.skips, []);
    assert.deepEqual(plan.notices, []);
  });
});

describe("inspectCmakeProject", () => {
  it("accepts a project linking weak-node-api", () => {
    assert.deepEqual(inspectCmakeProject(LINKED_CMAKE_LISTS, "my-addon"), []);
    assert.deepEqual(
      inspectCmakeProject(
        [
          "find_package(weak-node-api REQUIRED CONFIG)",
          "add_library(my-addon SHARED addon.c)",
          "target_link_libraries(my-addon",
          "  PRIVATE",
          "  weak-node-api",
          ")",
        ].join("\n"),
        "my-addon",
      ),
      [],
    );
  });

  it("notices a project not importing or linking weak-node-api", () => {
    const notices = inspectCmakeProject(
      [
        "# include(${WEAK_NODE_API_CONFIG})",
        "add_library(my-addon SHARED addon.c)",
      ].join("\n"),
      "my-addon",
    );
    assert.equal(notices.length, 2);
    assert.match(notices[0], /WEAK_NODE_API_CONFIG/);
    assert.match(notices[1], /target_link_libraries/);
  });

  it("points a cmake-js project at --cmake-js", () => {
    const notices = inspectCmakeProject(
      [
        "add_library(my-addon SHARED addon.c ${CMAKE_JS_SRC})",
        "target_link_libraries(my-addon ${CMAKE_JS_LIB})",
      ].join("\n"),
      "my-addon",
    );
    assert.equal(notices.length, 1);
    assert.match(notices[0], /--cmake-js/);
  });

  it("notices a project not building the library", () => {
    const notices = inspectCmakeProject(LINKED_CMAKE_LISTS, "other-addon");
    assert.equal(notices.length, 1);
    assert.match(notices[0], /--name/);
  });
});
