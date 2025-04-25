import assert from "node:assert/strict";
import { describe, it } from "node:test";
import path from "node:path";

import {
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
