import assert from "node:assert/strict";
import { describe, it } from "node:test";
import path from "node:path";

import {
  findDuplicates,
  findPackageDependencyPaths,
  findXCFrameworkPaths,
} from "./helpers";
import { setupTempDirectory } from "../test-utils";

describe("findDuplicates", () => {
  it("should find duplicates", () => {
    const items = [{ key: "a" }, { key: "b" }, { key: "a" }];
    const duplicates = findDuplicates(items, (item) => item.key);
    assert.equal(duplicates.size, 2);
    const [duplicate1, duplicate2] = duplicates;
    assert.equal(duplicate1, items[0]);
    assert.equal(duplicate2, items[2]);
  });
});

describe("findPackageDependencyPaths", () => {
  it("should find package dependency paths", (context) => {
    const tempDir = setupTempDirectory(context, {
      "node_modules/lib-a/package.json": JSON.stringify({
        name: "lib-a",
      }),
      "test-package/node_modules/lib-b/package.json": JSON.stringify({
        name: "lib-b",
      }),
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

describe("findXCFrameworkPaths", () => {
  it("should find xcframework paths", (context) => {
    const tempDir = setupTempDirectory(context, {
      "root.xcframework/react-native-node-api-module": "",
      "sub-directory/lib-a.xcframework/react-native-node-api-module": "",
      "sub-directory/lib-b.xcframework/react-native-node-api-module": "",
    });
    const result = findXCFrameworkPaths(tempDir);
    assert.deepEqual(result, [
      path.join(tempDir, "root.xcframework"),
      path.join(tempDir, "sub-directory/lib-a.xcframework"),
      path.join(tempDir, "sub-directory/lib-b.xcframework"),
    ]);
  });
});
