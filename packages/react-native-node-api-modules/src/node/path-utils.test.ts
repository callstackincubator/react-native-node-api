import assert from "node:assert/strict";
import { describe, it } from "node:test";
import path from "node:path";

import {
  determineModuleContext,
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
      assert.equal(relativePath, "some-dir/some-file");
    }

    {
      const { packageName, relativePath } = determineModuleContext(
        path.join(tempDirectoryPath, "sub-package-a/some-file.js")
      );
      assert.equal(packageName, "my-sub-package");
      assert.equal(relativePath, "some-file");
    }

    {
      const { packageName, relativePath } = determineModuleContext(
        path.join(tempDirectoryPath, "sub-package-b/some-file.js")
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
