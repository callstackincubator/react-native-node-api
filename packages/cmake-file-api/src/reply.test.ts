import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, type TestContext } from "node:test";

import { findCurrentReplyIndexPath, readIndex } from "./reply.js";

function createMockReplyDirectory(
  context: TestContext,
  replyFiles: [string, Record<string, unknown>][],
) {
  const tmpPath = fs.mkdtempSync(path.join(os.tmpdir(), "test-"));

  for (const [fileName, content] of replyFiles) {
    const filePath = path.join(tmpPath, fileName);
    fs.writeFileSync(filePath, JSON.stringify(content), {
      encoding: "utf-8",
    });
  }

  context.after(() => {
    fs.rmSync(tmpPath, { recursive: true, force: true });
  });

  return tmpPath;
}

describe("findCurrentReplyIndexPath", () => {
  it("returns the correct path when only index files are present", async function (context) {
    const tmpPath = createMockReplyDirectory(context, [
      ["index-a.json", {}],
      ["index-b.json", {}],
    ]);
    const result = await findCurrentReplyIndexPath(tmpPath);
    assert.strictEqual(result, path.join(tmpPath, "index-b.json"));
  });

  it("returns the correct path when only error files are present", async function (context) {
    const tmpPath = createMockReplyDirectory(context, [
      ["error-a.json", {}],
      ["error-b.json", {}],
    ]);
    const result = await findCurrentReplyIndexPath(tmpPath);
    assert.strictEqual(result, path.join(tmpPath, "error-b.json"));
  });

  it("returns the correct path when both index and error files are present", async function (context) {
    const tmpPath = createMockReplyDirectory(context, [
      ["index-a.json", {}],
      ["error-b.json", {}],
    ]);
    const result = await findCurrentReplyIndexPath(tmpPath);
    assert.strictEqual(result, path.join(tmpPath, "error-b.json"));
  });

  it("returns the correct path when both index and error files are present (reversed)", async function (context) {
    const tmpPath = createMockReplyDirectory(context, [
      ["error-a.json", {}],
      ["index-b.json", {}],
    ]);
    const result = await findCurrentReplyIndexPath(tmpPath);
    assert.strictEqual(result, path.join(tmpPath, "index-b.json"));
  });
});

describe("readIndex", () => {
  it("reads a well-formed index file with complete structure", async function (context) {
    const mockIndex = {
      cmake: {
        version: {
          major: 3,
          minor: 26,
          patch: 0,
          suffix: "",
          string: "3.26.0",
          isDirty: false,
        },
        paths: {
          cmake: "/usr/bin/cmake",
          ctest: "/usr/bin/ctest",
          cpack: "/usr/bin/cpack",
          root: "/usr/share/cmake",
        },
        generator: {
          multiConfig: false,
          name: "Unix Makefiles",
          // Note: platform is optional according to docs - omitted here like in the example
        },
      },
      objects: [
        {
          kind: "codemodel",
          version: { major: 2, minor: 0 },
          jsonFile: "codemodel-v2-12345.json",
        },
        {
          kind: "cache",
          version: { major: 2, minor: 0 },
          jsonFile: "cache-v2-67890.json",
        },
      ],
      reply: {
        "codemodel-v2": {
          kind: "codemodel",
          version: { major: 2, minor: 0 },
          jsonFile: "codemodel-v2-12345.json",
        },
        "cache-v2": {
          kind: "cache",
          version: { major: 2, minor: 0 },
          jsonFile: "cache-v2-67890.json",
        },
        "unknown-kind-v1": {
          error: "unknown query file",
        },
        "client-test-client": {
          "codemodel-v2": {
            kind: "codemodel",
            version: { major: 2, minor: 0 },
            jsonFile: "codemodel-v2-12345.json",
          },
          "unknown-v1": {
            error: "unknown query file",
          },
        },
      },
    };

    const tmpPath = createMockReplyDirectory(context, [
      ["index-a.json", mockIndex],
    ]);
    const result = await readIndex(path.join(tmpPath, "index-a.json"));

    // Verify the entire structure matches our mock data
    assert.deepStrictEqual(result, mockIndex);
  });

  it("reads index file with generator platform", async function (context) {
    const mockIndexWithPlatform = {
      cmake: {
        version: {
          major: 3,
          minor: 26,
          patch: 0,
          suffix: "",
          string: "3.26.0",
          isDirty: false,
        },
        paths: {
          cmake: "/usr/bin/cmake",
          ctest: "/usr/bin/ctest",
          cpack: "/usr/bin/cpack",
          root: "/usr/share/cmake",
        },
        generator: {
          multiConfig: true,
          name: "Visual Studio 16 2019",
          platform: "x64", // Present when generator supports CMAKE_GENERATOR_PLATFORM
        },
      },
      objects: [],
      reply: {},
    };

    const tmpPath = createMockReplyDirectory(context, [
      ["index-b.json", mockIndexWithPlatform],
    ]);
    const result = await readIndex(path.join(tmpPath, "index-b.json"));

    // Verify the entire structure matches our mock data
    assert.deepStrictEqual(result, mockIndexWithPlatform);
  });
});
