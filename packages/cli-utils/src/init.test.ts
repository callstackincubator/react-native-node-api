import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, TestContext } from "node:test";

import {
  appendMissingLines,
  assertDistinctChanges,
  determineDependencySpecifiers,
  formatDiff,
  isOutdatedRange,
  planTemplateFile,
  stripPackageScope,
  withDependency,
  withFiles,
} from "./init.js";

function setupTempDirectory(context: TestContext) {
  const tempPath = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "cli-utils-init-test-")),
  );
  context.after(() => fs.rmSync(tempPath, { recursive: true, force: true }));
  return tempPath;
}

describe("assertDistinctChanges", () => {
  it("rejects two changes to the same file", () => {
    assertDistinctChanges([{ path: "a" }, { path: "b" }]);
    assert.throws(() =>
      assertDistinctChanges([{ path: "a" }, { path: "b" }, { path: "a" }]),
    );
  });
});

describe("stripPackageScope", () => {
  it("strips the scope", () => {
    assert.equal(stripPackageScope("@my-org/my-addon"), "my-addon");
    assert.equal(stripPackageScope("my-addon"), "my-addon");
  });
});

describe("isOutdatedRange", () => {
  it("compares the lowest versions allowed", () => {
    assert.equal(isOutdatedRange("^0.1.0", "^0.2.0"), true);
    assert.equal(isOutdatedRange("^0.2.0", "^0.1.0"), false);
    assert.equal(isOutdatedRange("^0.2.0", "^0.2.0"), false);
  });

  it("never considers non-versions outdated", () => {
    assert.equal(isOutdatedRange("workspace:*", "^1.0.0"), false);
    assert.equal(isOutdatedRange("*", "^1.0.0"), false);
    assert.equal(isOutdatedRange("^1.0.0", "latest"), false);
  });
});

describe("withDependency", () => {
  const update = withDependency({
    name: "dep",
    specifier: "^1.0.0",
    keys: ["devDependencies", "dependencies"],
  });

  it("adds a missing dependency to the first key", () => {
    assert.deepEqual(update({}), { devDependencies: { dep: "^1.0.0" } });
  });

  it("bumps an outdated dependency where it's declared", () => {
    assert.deepEqual(update({ dependencies: { dep: "^0.1.0" } }), {
      dependencies: { dep: "^1.0.0" },
    });
  });

  it("keeps a newer dependency", () => {
    const packageJson = { dependencies: { dep: "^2.0.0" } };
    assert.deepEqual(update(packageJson), packageJson);
  });
});

describe("withFiles", () => {
  it("only creates a files array when asked to", () => {
    assert.deepEqual(withFiles(["a"], false)({}), {});
    assert.deepEqual(withFiles(["a"], true)({}), { files: ["a"] });
    assert.deepEqual(withFiles(["a", "b"], false)({ files: ["b"] }), {
      files: ["b", "a"],
    });
  });
});

describe("appendMissingLines", () => {
  it("appends the lines a file lacks", () => {
    assert.equal(appendMissingLines("a", "a\nb\n"), "a\nb\n");
    assert.equal(appendMissingLines("a\nb\n", "b\n"), undefined);
  });
});

describe("planTemplateFile", () => {
  it("creates, skips or overwrites", async (context) => {
    const outputPath = path.join(setupTempDirectory(context), "file.txt");
    const contents = "template\n";
    assert.deepEqual(
      await planTemplateFile({ outputPath, contents, force: false }),
      { changes: [{ kind: "create", path: outputPath, contents }] },
    );
    fs.writeFileSync(outputPath, contents);
    assert.deepEqual(
      await planTemplateFile({ outputPath, contents, force: false }),
      {},
    );
    fs.writeFileSync(outputPath, "mine\n");
    assert.deepEqual(
      await planTemplateFile({ outputPath, contents, force: false }),
      { skips: [{ path: outputPath, contents, previous: "mine\n" }] },
    );
    assert.deepEqual(
      await planTemplateFile({ outputPath, contents, force: true }),
      {
        changes: [
          {
            kind: "update",
            path: outputPath,
            contents,
            previous: "mine\n",
            forced: true,
          },
        ],
      },
    );
  });
});

describe("determineDependencySpecifiers", () => {
  it("uses released versions for a published CLI", (context) => {
    const cliPackagePath = setupTempDirectory(context);
    fs.writeFileSync(
      path.join(cliPackagePath, "package.json"),
      JSON.stringify({
        version: "1.2.3",
        dependencies: { "react-native-node-api": "~0.9.0" },
      }),
    );
    assert.deepEqual(
      determineDependencySpecifiers({ cliPackagePath, workspace: undefined }),
      { hostSpecifier: "^0.9.0", cliSpecifier: "^1.2.3" },
    );
  });

  it("uses released versions outside the workspace of a linked CLI", (context) => {
    const cliPackagePath = setupTempDirectory(context);
    fs.writeFileSync(
      path.join(cliPackagePath, "package.json"),
      JSON.stringify({
        version: "1.2.3",
        dependencies: { "react-native-node-api": "workspace:*" },
      }),
    );
    assert.deepEqual(
      determineDependencySpecifiers({ cliPackagePath, workspace: undefined }),
      { hostSpecifier: "latest", cliSpecifier: "^1.2.3" },
    );
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
