import assert from "node:assert/strict";
import { describe, it } from "node:test";
import path from "node:path";
import fs from "node:fs";
import fswin from "fswin";

import {
  determineModuleContext,
  findNodeApiModulePaths,
  findNodeAddonForBindings,
  findPackageDependencyPaths,
  getLibraryName,
  isNodeApiModule,
  stripExtension,
  findNodeApiModulePathsByDependency,
} from "./path-utils.js";
import { setupTempDirectory } from "./test-utils.js";

function removeReadPermissions(p: string) {
  if (process.platform !== "win32") {
    // Unix-like: clear all perms
    fs.chmodSync(p, 0);
    return;
  }

  // Windows: simulate unreadable by setting file to offline
  const attributes = {
    IS_READ_ONLY: true,
    IS_OFFLINE: true,
    IS_TEMPORARY: true,
  };

  const result = fswin.setAttributesSync(p, attributes);
  if (!result)
    throw new Error("can not set attributes to remove read permissions");
}

function restoreReadPermissions(p: string) {
  if (process.platform !== "win32") {
    // Unix-like: clear all perms
    fs.chmodSync(p, 0o700);
    return;
  }

  const attributes = {
    IS_READ_ONLY: false,
    IS_OFFLINE: false,
    IS_TEMPORARY: false,
  };

  const result = fswin.setAttributesSync(p, attributes);
  if (!result)
    throw new Error("can not set attributes to restore read permissions");
}

describe("isNodeApiModule", () => {
  it("returns true for .node", (context) => {
    const tempDirectoryPath = setupTempDirectory(context, {
      "addon.apple.node/addon.node": "// This is supposted to be a binary file",
    });

    assert(isNodeApiModule(path.join(tempDirectoryPath, "addon")));
    assert(isNodeApiModule(path.join(tempDirectoryPath, "addon.node")));
  });

  it(
    "returns false when directory cannot be read due to permissions",
    // Skipping on Windows because there is no way to set ACLs on directories in Node.js on Windows without brittle powershell commands
    { skip: process.platform === "win32" },
    (context) => {
      const tempDirectoryPath = setupTempDirectory(context, {
        "addon.android.node": "",
      });
      removeReadPermissions(tempDirectoryPath);
      try {
        assert.equal(
          isNodeApiModule(path.join(tempDirectoryPath, "addon")),
          false,
        );
      } finally {
        restoreReadPermissions(tempDirectoryPath);
      }
    },
  );

  it("throws when module file exists but is not readable", (context) => {
    const tempDirectoryPath = setupTempDirectory(context, {
      "addon.android.node": "",
    });
    const candidate = path.join(tempDirectoryPath, "addon.android.node");
    removeReadPermissions(candidate);
    try {
      assert.throws(
        () => isNodeApiModule(path.join(tempDirectoryPath, "addon")),
        /Found an unreadable module addon\.android\.node/,
      );
    } finally {
      restoreReadPermissions(candidate);
    }
  });

  it("returns false when parent directory does not exist", () => {
    // Path to a non-existent directory
    const fakePath = path.join(process.cwd(), "no-such-dir", "addon");
    assert.equal(isNodeApiModule(fakePath), false);
  });

  it("recognize .apple.node directories", (context) => {
    const tempDirectoryPath = setupTempDirectory(context, {
      "addon.apple.node/addon.node": "// This is supposed to be a binary file",
    });
    assert.equal(isNodeApiModule(path.join(tempDirectoryPath, "addon")), true);
    assert.equal(
      isNodeApiModule(path.join(tempDirectoryPath, "addon.node")),
      true,
    );
    assert.equal(isNodeApiModule(path.join(tempDirectoryPath, "nope")), false);
  });

  it("throws when one module unreadable but another readable", (context) => {
    const tempDirectoryPath = setupTempDirectory(context, {
      "addon.android.node": "",
      "addon.apple.node": "",
    });
    const unreadable = path.join(tempDirectoryPath, "addon.android.node");
    // only android module is unreadable
    removeReadPermissions(unreadable);
    assert.throws(
      () => isNodeApiModule(path.join(tempDirectoryPath, "addon")),
      /Found an unreadable module addon\.android\.node/,
    );
    restoreReadPermissions(unreadable);
  });
});

describe("stripExtension", () => {
  it("strips extension", () => {
    assert.equal(stripExtension("./addon"), "./addon");
    assert.equal(stripExtension("./addon.node"), "./addon");
    assert.equal(stripExtension("./addon.android.node"), "./addon");
    // assert.equal(stripExtension("./addon.apple.node"), "./addon");
    assert.equal(stripExtension("./addon.apple.node"), "./addon");
  });
});

describe("determineModuleContext", () => {
  it("strips the file extension", (context) => {
    const tempDirectoryPath = setupTempDirectory(context, {
      "package.json": `{ "name": "my-package" }`,
    });

    {
      const { packageName, relativePath } = determineModuleContext(
        path.join(tempDirectoryPath, "some-dir/some-file.node"),
      );
      assert.equal(packageName, "my-package");
      assert.equal(relativePath, "some-dir/some-file");
    }
  });

  it("strips a lib prefix", (context) => {
    const tempDirectoryPath = setupTempDirectory(context, {
      "package.json": `{ "name": "my-package" }`,
    });

    {
      const { packageName, relativePath } = determineModuleContext(
        path.join(tempDirectoryPath, "some-dir/libsome-file.node"),
      );
      assert.equal(packageName, "my-package");
      assert.equal(relativePath, "some-dir/some-file");
    }
  });

  it("resolves the correct package name", (context) => {
    const tempDirectoryPath = setupTempDirectory(context, {
      "package.json": `{ "name": "root-package" }`,
      // Two sub-packages with the same name
      "sub-package-a/package.json": `{ "name": "my-sub-package-a" }`,
      "sub-package-b/package.json": `{ "name": "my-sub-package-b" }`,
    });

    {
      const { packageName, relativePath } = determineModuleContext(
        path.join(tempDirectoryPath, "sub-package-a/some-file.node"),
      );
      assert.equal(packageName, "my-sub-package-a");
      assert.equal(relativePath, "some-file");
    }

    {
      const { packageName, relativePath } = determineModuleContext(
        path.join(tempDirectoryPath, "sub-package-b/some-file.node"),
      );
      assert.equal(packageName, "my-sub-package-b");
      assert.equal(relativePath, "some-file");
    }
  });
});

describe("getLibraryName", () => {
  it("works when including relative path", (context) => {
    const tempDirectoryPath = setupTempDirectory(context, {
      "package.json": `{ "name": "my-package" }`,
      "addon.apple.node/addon.node": "// This is supposed to be a binary file",
      "sub-directory/addon.apple.node/addon.node":
        "// This is supposed to be a binary file",
    });
    assert.equal(
      getLibraryName(path.join(tempDirectoryPath, "addon"), {
        pathSuffix: "keep",
      }),
      "my-package--addon",
    );

    assert.equal(
      getLibraryName(path.join(tempDirectoryPath, "sub-directory/addon"), {
        pathSuffix: "keep",
      }),
      "my-package--sub-directory-addon",
    );
  });

  it("strips path suffix", (context) => {
    const tempDirectoryPath = setupTempDirectory(context, {
      "package.json": `{ "name": "my-package" }`,
      "addon.apple.node/addon.node": "// This is supposed to be a binary file",
      "sub-directory/addon.apple.node/addon.node":
        "// This is supposed to be a binary file",
    });
    assert.equal(
      getLibraryName(path.join(tempDirectoryPath, "addon"), {
        pathSuffix: "strip",
      }),
      "my-package--addon",
    );

    assert.equal(
      getLibraryName(path.join(tempDirectoryPath, "sub-directory", "addon"), {
        pathSuffix: "strip",
      }),
      "my-package--addon",
    );
  });

  it("omits path suffix", (context) => {
    const tempDirectoryPath = setupTempDirectory(context, {
      "package.json": `{ "name": "my-package" }`,
      "addon.apple.node/addon.node": "// This is supposed to be a binary file",
      "sub-directory/addon.apple.node/addon.node":
        "// This is supposed to be a binary file",
    });
    assert.equal(
      getLibraryName(path.join(tempDirectoryPath, "addon"), {
        pathSuffix: "omit",
      }),
      "my-package",
    );

    assert.equal(
      getLibraryName(path.join(tempDirectoryPath, "sub-directory", "addon"), {
        pathSuffix: "omit",
      }),
      "my-package",
    );
  });
});

describe("findPackageDependencyPaths", () => {
  it("should find package dependency paths", (context) => {
    const tempDir = setupTempDirectory(context, {
      "node_modules/lib-a": {
        "package.json": JSON.stringify({
          name: "lib-a",
          main: "index.js",
        }),
        "index.js": "",
      },
      "test-package": {
        "package.json": JSON.stringify({
          name: "test-package",
          dependencies: {
            "lib-a": "^1.0.0",
            "lib-b": "^1.0.0",
          },
        }),
        "src/index.js": "console.log('Hello, world!')",
        "node_modules/lib-b": {
          "package.json": JSON.stringify({
            name: "lib-b",
            main: "index.js",
          }),
          "index.js": "",
        },
      },
    });

    const result = findPackageDependencyPaths(
      path.join(tempDir, "test-package/src/index.js"),
    );

    assert.deepEqual(result, {
      "lib-a": path.join(tempDir, "node_modules/lib-a"),
      "lib-b": path.join(tempDir, "test-package/node_modules/lib-b"),
    });
  });
});

describe("findNodeApiModulePaths", () => {
  it("should find .apple.node paths", async (context) => {
    const tempDir = setupTempDirectory(context, {
      "root.apple.node/react-native-node-api-module": "",
      "sub-directory/lib-a.apple.node/react-native-node-api-module": "",
      "sub-directory/lib-b.apple.node/react-native-node-api-module": "",
    });
    const result = await findNodeApiModulePaths({
      fromPath: tempDir,
      platform: "apple",
    });
    assert.deepEqual(result.sort(), [
      path.join(tempDir, "root.apple.node"),
      path.join(tempDir, "sub-directory/lib-a.apple.node"),
      path.join(tempDir, "sub-directory/lib-b.apple.node"),
    ]);
  });

  it("respects default exclude patterns", async (context) => {
    const tempDir = setupTempDirectory(context, {
      "root.apple.node/react-native-node-api-module": "",
      "node_modules/dependency/lib.apple.node/react-native-node-api-module": "",
      "child-dir/dependency/lib.apple.node/react-native-node-api-module": "",
      "child-dir/node_modules/dependency/lib.apple.node/react-native-node-api-module":
        "",
    });
    const result = await findNodeApiModulePaths({
      fromPath: tempDir,
      platform: "apple",
    });
    assert.deepEqual(result.sort(), [
      path.join(tempDir, "child-dir/dependency/lib.apple.node"),
      path.join(tempDir, "root.apple.node"),
    ]);
  });

  it("respects explicit exclude patterns", async (context) => {
    const tempDir = setupTempDirectory(context, {
      "root.apple.node/react-native-node-api-module": "",
      "child-dir/dependency/lib.apple.node/react-native-node-api-module": "",
      "child-dir/node_modules/dependency/lib.apple.node/react-native-node-api-module":
        "",
    });
    const result = await findNodeApiModulePaths({
      fromPath: tempDir,
      platform: "apple",
      excludePatterns: [/root/],
    });
    assert.deepEqual(result.sort(), [
      path.join(tempDir, "child-dir/dependency/lib.apple.node"),
      path.join(tempDir, "child-dir/node_modules/dependency/lib.apple.node"),
    ]);
  });

  it("disregards parts futher up in filesystem when excluding", async (context) => {
    const tempDir = setupTempDirectory(context, {
      "node_modules/root.apple.node/react-native-node-api-module": "",
      "node_modules/child-dir/node_modules/dependency/lib.apple.node/react-native-node-api-module":
        "",
    });
    const result = await findNodeApiModulePaths({
      fromPath: path.join(tempDir, "node_modules"),
      platform: "apple",
    });
    assert.deepEqual(result, [
      path.join(tempDir, "node_modules/root.apple.node"),
    ]);
  });

  it(
    "returns empty when directory cannot be read due to permissions",
    // Skipping on Windows because there is no way to set ACLs on directories in Node.js on Windows without brittle powershell commands
    { skip: process.platform === "win32" },
    async (context) => {
      const tempDir = setupTempDirectory(context, {
        "addon.apple.node/react-native-node-api-module": "",
      });

      removeReadPermissions(tempDir);
      try {
        const result = findNodeApiModulePaths({
          fromPath: tempDir,
          platform: "apple",
        });
        assert.deepEqual(await result, []);
      } finally {
        restoreReadPermissions(tempDir);
      }
    },
  );
});

describe("findNodeApiModulePathsByDependency", () => {
  it.only("should find Node-API paths by dependency (excluding certain packages)", async (context) => {
    const packagesNames = ["lib-a", "lib-b", "lib-c"];
    const tempDir = setupTempDirectory(context, {
      "app/package.json": JSON.stringify({
        name: "app",
        dependencies: Object.fromEntries(
          packagesNames.map((packageName) => [packageName, "^1.0.0"]),
        ),
      }),
      ...Object.fromEntries(
        packagesNames.map((packageName) => [
          `app/node_modules/${packageName}`,
          {
            "package.json": JSON.stringify({
              name: packageName,
              main: "index.js",
            }),
            "index.js": "",
            "addon.apple.node/react-native-node-api-module": "",
          },
        ]),
      ),
    });

    const result = await findNodeApiModulePathsByDependency({
      fromPath: path.join(tempDir, "app"),
      platform: "apple",
      includeSelf: false,
      excludePackages: ["lib-a"],
    });
    assert.deepEqual(result, {
      "lib-b": {
        path: path.join(tempDir, "app/node_modules/lib-b"),
        modulePaths: ["addon.apple.node"],
      },
      "lib-c": {
        path: path.join(tempDir, "app/node_modules/lib-c"),
        modulePaths: ["addon.apple.node"],
      },
    });
  });
});

describe("determineModuleContext", () => {
  it("should read package.json only once across multiple module paths for the same package", (context) => {
    const tempDir = setupTempDirectory(context, {
      "package.json": `{ "name": "cached-pkg" }`,
      "subdir1/file1.node": "",
      "subdir2/file2.node": "",
      "subdir1/file1.apple.node": "",
    });
    let readCount = 0;
    const orig = fs.readFileSync;
    context.mock.method(
      fs,
      "readFileSync",
      (...args: Parameters<typeof fs.readFileSync>) => {
        const [pathArg] = args;
        if (typeof pathArg === "string" && pathArg.endsWith("package.json")) {
          readCount++;
        }
        return orig(...args);
      },
    );

    const ctx1 = determineModuleContext(
      path.join(tempDir, "subdir1/file1.node"),
    );
    const ctx2 = determineModuleContext(
      path.join(tempDir, "subdir2/file2.node"),
    );
    assert.equal(ctx1.packageName, "cached-pkg");
    assert.equal(ctx2.packageName, "cached-pkg");
    assert.equal(readCount, 1);
  });
});

describe("findNodeAddonForBindings()", () => {
  const expectedPaths = {
    addon_1: "addon_1.node",
    addon_2: "build/Release/addon_2.node",
    addon_3: "build/Debug/addon_3.node",
    addon_4: "build/addon_4.node",
    addon_5: "out/Release/addon_5.node",
    addon_6: "out/Debug/addon_6.node",
    addon_7: "Release/addon_7.node",
    addon_8: "Debug/addon_8.node",
  };

  for (const [name, relPath] of Object.entries(expectedPaths)) {
    it(`should look for addons in common paths (${name} in "${relPath}")`, async (context) => {
      // Arrange
      const tempDirectoryPath = setupTempDirectory(context, {
        [relPath]: "// This is supposed to be a binary file",
      });
      // Act
      const actualPath = await findNodeAddonForBindings(
        name,
        tempDirectoryPath,
      );
      // Assert
      const expectedAbsPath = path.join(tempDirectoryPath, relPath);
      assert.equal(actualPath, expectedAbsPath);
    });
  }
});
