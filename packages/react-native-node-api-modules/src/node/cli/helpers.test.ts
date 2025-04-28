import assert from "node:assert/strict";
import { describe, it } from "node:test";
import path from "node:path";

import { findPackageDependencyPaths, findXCFrameworkPaths } from "./helpers";
import { setupTempDirectory } from "../test-utils";

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
    const result = findXCFrameworkPaths(tempDir);
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
    const result = findXCFrameworkPaths(tempDir, { excludePatterns: [/root/] });
    assert.deepEqual(result.sort(), [
      path.join(tempDir, "child-dir/dependency/lib.xcframework"),
      path.join(tempDir, "child-dir/node_modules/dependency/lib.xcframework"),
    ]);
  });
});
