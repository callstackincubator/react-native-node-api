import assert from "node:assert/strict";
import { describe, it } from "node:test";
import path from "node:path";
import fs from "node:fs";

import {
  determineModuleContext,
  findNodeApiModulePaths,
  findPackageDependencyPaths,
  getLibraryName,
  isNodeApiModule,
  replaceWithNodeExtension,
  stripExtension,
} from "./path-utils.js";
import { setupTempDirectory } from "./test-utils.js";

describe("isNodeApiModule", () => {
  it("returns true for .node", (context) => {
    const tempDirectoryPath = setupTempDirectory(context, {
      "addon.xcframework/addon.node":
        "// This is supposted to be a binary file",
    });

    assert(isNodeApiModule(path.join(tempDirectoryPath, "addon")));
    assert(isNodeApiModule(path.join(tempDirectoryPath, "addon.node")));
  });

  it("returns false when directory cannot be read due to permissions", (context) => {
    const tempDirectoryPath = setupTempDirectory(context, {
      "addon.android.node": "",
    });
    // remove read permissions on directory
    fs.chmodSync(tempDirectoryPath, 0);
    try {
      assert.equal(
        isNodeApiModule(path.join(tempDirectoryPath, "addon")),
        false
      );
    } finally {
      fs.chmodSync(tempDirectoryPath, 0o700);
    }
  });

  it("throws when module file exists but is not readable", (context) => {
    const tempDirectoryPath = setupTempDirectory(context, {
      "addon.android.node": "",
    });
    const candidate = path.join(tempDirectoryPath, "addon.android.node");
    // remove read permission on file
    fs.chmodSync(candidate, 0);
    try {
      assert.throws(() => isNodeApiModule(path.join(tempDirectoryPath, "addon")), /Found an unreadable module addon\.android\.node/);
    } finally {
      fs.chmodSync(candidate, 0o600);
    }
  });

  it("returns false when parent directory does not exist", () => {
    // Path to a non-existent directory
    const fakePath = path.join(process.cwd(), "no-such-dir", "addon");
    assert.equal(isNodeApiModule(fakePath), false);
  });

  it("recognize .xcframeworks", (context) => {
    const tempDirectoryPath = setupTempDirectory(context, {
      "addon.xcframework/addon.node": "// This is supposed to be a binary file",
    });
    assert.equal(isNodeApiModule(path.join(tempDirectoryPath, "addon")), true);
    assert.equal(
      isNodeApiModule(path.join(tempDirectoryPath, "addon.node")),
      true
    );
    assert.equal(isNodeApiModule(path.join(tempDirectoryPath, "nope")), false);
  });

  it("throws when one module unreadable but another readable", (context) => {
    const tempDirectoryPath = setupTempDirectory(context, {
      "addon.android.node": "",
      "addon.xcframework": "",
    });
    const unreadable = path.join(tempDirectoryPath, "addon.android.node");
    // only android module is unreadable
    fs.chmodSync(unreadable, 0);
    assert.throws(() => isNodeApiModule(path.join(tempDirectoryPath, "addon")), /Found an unreadable module addon\.android\.node/);
    fs.chmodSync(unreadable, 0o600);
  });
});

describe("stripExtension", () => {
  it("strips extension", () => {
    assert.equal(stripExtension("./addon"), "./addon");
    assert.equal(stripExtension("./addon.node"), "./addon");
    assert.equal(stripExtension("./addon.android.node"), "./addon");
    // assert.equal(stripExtension("./addon.apple.node"), "./addon");
    assert.equal(stripExtension("./addon.xcframework"), "./addon");
  });
});

describe("replaceExtensionWithNode", () => {
  it("replaces extension with .node", () => {
    assert.equal(replaceWithNodeExtension("./addon"), "./addon.node");
    assert.equal(replaceWithNodeExtension("./addon.node"), "./addon.node");
    assert.equal(
      replaceWithNodeExtension("./addon.xcframework"),
      "./addon.node"
    );
  });
});

describe("determineModuleContext", () => {
  it("works", (context) => {
    const tempDirectoryPath = setupTempDirectory(context, {
      "package.json": `{ "name": "my-package" }`,
      // Two sub-packages with the same name
      "sub-package-a/package.json": `{ "name": "my-sub-package" }`,
      "sub-package-b/package.json": `{ "name": "my-sub-package" }`,
    });

    {
      const { packageName, relativePath } = determineModuleContext(
        path.join(tempDirectoryPath, "some-dir/some-file.node")
      );
      assert.equal(packageName, "my-package");
      assert.equal(relativePath, "some-dir/some-file");
    }

    {
      const { packageName, relativePath } = determineModuleContext(
        path.join(tempDirectoryPath, "sub-package-a/some-file.node")
      );
      assert.equal(packageName, "my-sub-package");
      assert.equal(relativePath, "some-file");
    }

    {
      const { packageName, relativePath } = determineModuleContext(
        path.join(tempDirectoryPath, "sub-package-b/some-file.node")
      );
      assert.equal(packageName, "my-sub-package");
      assert.equal(relativePath, "some-file");
    }
  });
});

describe("getLibraryName", () => {
  it("works when including relative path", (context) => {
    const tempDirectoryPath = setupTempDirectory(context, {
      "package.json": `{ "name": "my-package" }`,
      "addon.xcframework/addon.node": "// This is supposed to be a binary file",
      "sub-directory/addon.xcframework/addon.node":
        "// This is supposed to be a binary file",
    });
    assert.equal(
      getLibraryName(path.join(tempDirectoryPath, "addon"), {
        stripPathSuffix: false,
      }),
      "my-package--addon"
    );

    assert.equal(
      getLibraryName(path.join(tempDirectoryPath, "sub-directory/addon"), {
        stripPathSuffix: false,
      }),
      "my-package--sub-directory-addon"
    );
  });

  it("works when stripping relative path", (context) => {
    const tempDirectoryPath = setupTempDirectory(context, {
      "package.json": `{ "name": "my-package" }`,
      "addon.xcframework/addon.node": "// This is supposed to be a binary file",
      "sub-directory/addon.xcframework/addon.node":
        "// This is supposed to be a binary file",
    });
    assert.equal(
      getLibraryName(path.join(tempDirectoryPath, "addon"), {
        stripPathSuffix: true,
      }),
      "my-package"
    );

    assert.equal(
      getLibraryName(path.join(tempDirectoryPath, "sub-directory-addon"), {
        stripPathSuffix: true,
      }),
      "my-package"
    );
  });
});

describe("findPackageDependencyPaths", () => {
  it("should find package dependency paths", (context) => {
    const tempDir = setupTempDirectory(context, {
      "node_modules/lib-a/package.json": JSON.stringify({
        name: "lib-a",
        main: "index.js",
      }),
      "node_modules/lib-a/index.js": "",
      "test-package/node_modules/lib-b/package.json": JSON.stringify({
        name: "lib-b",
        main: "index.js",
      }),
      "test-package/node_modules/lib-b/index.js": "",
      "test-package/package.json": JSON.stringify({
        name: "test-package",
        dependencies: {
          "lib-a": "^1.0.0",
          "lib-b": "^1.0.0",
        },
      }),
      "test-package/src/index.js": "console.log('Hello, world!')",
    });

    const result = findPackageDependencyPaths(
      path.join(tempDir, "test-package/src/index.js")
    );

    assert.deepEqual(result, {
      "lib-a": path.join(tempDir, "node_modules/lib-a"),
      "lib-b": path.join(tempDir, "test-package/node_modules/lib-b"),
    });
  });
});

describe("findNodeApiModulePaths", () => {
  it("should find xcframework paths", (context) => {
    const tempDir = setupTempDirectory(context, {
      "root.xcframework/react-native-node-api-module": "",
      "sub-directory/lib-a.xcframework/react-native-node-api-module": "",
      "sub-directory/lib-b.xcframework/react-native-node-api-module": "",
    });
    const result = findNodeApiModulePaths({
      fromPath: tempDir,
      platform: "apple",
    });
    assert.deepEqual(result.sort(), [
      path.join(tempDir, "root.xcframework"),
      path.join(tempDir, "sub-directory/lib-a.xcframework"),
      path.join(tempDir, "sub-directory/lib-b.xcframework"),
    ]);
  });

  it("respects default exclude patterns", (context) => {
    const tempDir = setupTempDirectory(context, {
      "root.xcframework/react-native-node-api-module": "",
      "child-dir/dependency/lib.xcframework/react-native-node-api-module": "",
      "child-dir/node_modules/dependency/lib.xcframework/react-native-node-api-module":
        "",
    });
    const result = findNodeApiModulePaths({
      fromPath: tempDir,
      platform: "apple",
    });
    assert.deepEqual(result.sort(), [
      path.join(tempDir, "child-dir/dependency/lib.xcframework"),
      path.join(tempDir, "root.xcframework"),
    ]);
  });

  it("respects explicit exclude patterns", (context) => {
    const tempDir = setupTempDirectory(context, {
      "root.xcframework/react-native-node-api-module": "",
      "child-dir/dependency/lib.xcframework/react-native-node-api-module": "",
      "child-dir/node_modules/dependency/lib.xcframework/react-native-node-api-module":
        "",
    });
    const result = findNodeApiModulePaths({
      fromPath: tempDir,
      platform: "apple",
      excludePatterns: [/root/],
    });
    assert.deepEqual(result.sort(), [
      path.join(tempDir, "child-dir/dependency/lib.xcframework"),
      path.join(tempDir, "child-dir/node_modules/dependency/lib.xcframework"),
    ]);
  });

  it("disregards parts futher up in filesystem when excluding", (context) => {
    const tempDir = setupTempDirectory(context, {
      "node_modules/root.xcframework/react-native-node-api-module": "",
      "node_modules/child-dir/node_modules/dependency/lib.xcframework/react-native-node-api-module":
        "",
    });
    const result = findNodeApiModulePaths({
      fromPath: path.join(tempDir, "node_modules"),
      platform: "apple",
    });
    assert.deepEqual(result, [
      path.join(tempDir, "node_modules/root.xcframework"),
    ]);
  });
});

describe("determineModuleContext", () => {
  it("should read package.json only once across multiple module paths for the same package", (context) => {
    const tempDir = setupTempDirectory(context, {
      "package.json": `{ "name": "cached-pkg" }`,
      "subdir1/file1.node": "",     
      "subdir2/file2.node": "",
      "subdir1/file1.xcframework": ""
    });
    let readCount = 0;
    const orig = fs.readFileSync;
    context.mock.method(fs, "readFileSync", (...args: Parameters<typeof fs.readFileSync>) => {
      const [pathArg] = args;
      if (typeof pathArg === "string" && pathArg.endsWith("package.json")) {
        readCount++;
      }
      return orig(...args);
    });

    const ctx1 = determineModuleContext(path.join(tempDir, "subdir1/file1.node"));
    const ctx2 = determineModuleContext(path.join(tempDir, "subdir2/file2.node"));
    assert.equal(ctx1.packageName, "cached-pkg");
    assert.equal(ctx2.packageName, "cached-pkg");
    assert.equal(readCount, 1);
  });
});
