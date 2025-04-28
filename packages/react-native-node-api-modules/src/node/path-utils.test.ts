import assert from "node:assert/strict";
import { describe, it } from "node:test";
import path from "node:path";

import {
  determineModuleContext,
  hashModulePath,
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
});

describe("stripExtension", () => {
  it("strips extension", () => {
    assert.equal(stripExtension("./addon"), "./addon");
    assert.equal(stripExtension("./addon.node"), "./addon");
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

describe("isNodeApiModule", () => {
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
        path.join(tempDirectoryPath, "some-dir/some-file.js")
      );
      assert.equal(packageName, "my-package");
      assert.equal(relativePath, "some-dir/some-file.js");
    }

    {
      const { packageName, relativePath } = determineModuleContext(
        path.join(tempDirectoryPath, "sub-package-a/some-file.js")
      );
      assert.equal(packageName, "my-sub-package");
      assert.equal(relativePath, "some-file.js");
    }

    {
      const { packageName, relativePath } = determineModuleContext(
        path.join(tempDirectoryPath, "sub-package-b/some-file.js")
      );
      assert.equal(packageName, "my-sub-package");
      assert.equal(relativePath, "some-file.js");
    }
  });
});

describe("hashModulePath", () => {
  it("produce the same hash for sub-packages of equal names", (context) => {
    const tempDirectoryPath = setupTempDirectory(context, {
      "package.json": `{ "name": "my-package" }`,
      "some-dir/addon.xcframework/react-native-node-api-module": "",
      // Two sub-packages with the same name
      "sub-package-a/package.json": `{ "name": "my-sub-package" }`,
      "sub-package-a/addon.xcframework/react-native-node-api-module": "",
      "sub-dir/sub-package-b/package.json": `{ "name": "my-sub-package" }`,
      "sub-dir/sub-package-b/addon.xcframework/react-native-node-api-module":
        "",
    });

    const hashInRoot = hashModulePath(
      path.join(tempDirectoryPath, "some-dir/addon")
    );

    const hashInRootAgain = hashModulePath(
      path.join(tempDirectoryPath, "some-dir/../some-dir/addon")
    );

    const hashInSubPackageA = hashModulePath(
      path.join(tempDirectoryPath, "sub-package-a/addon")
    );
    const hashInSubPackageB = hashModulePath(
      path.join(tempDirectoryPath, "sub-dir/sub-package-b/addon")
    );

    assert.equal(hashInRoot, hashInRootAgain);
    assert.notEqual(hashInRoot, hashInSubPackageA);
    assert.notEqual(hashInRoot, hashInSubPackageB);
    // Because they both reference the same file in packages of equal names
    assert.equal(hashInSubPackageA, hashInSubPackageB);
  });

  it("produce the same hash from different cwds", (context) => {
    const tempDirectoryPath = setupTempDirectory(context, {
      "package.json": `{ "name": "my-package" }`,
      "some-dir/addon.xcframework/react-native-node-api-module": "",
    });
    const hashInRoot = hashModulePath(
      path.join(tempDirectoryPath, "some-dir/addon")
    );
    const previousCwd = process.cwd();
    try {
      process.chdir(tempDirectoryPath);
      const hashInRootAgain = hashModulePath(
        path.join(tempDirectoryPath, "some-dir/../some-dir/addon")
      );
      assert.equal(hashInRoot, hashInRootAgain);
    } finally {
      process.chdir(previousCwd);
    }
  });
});
