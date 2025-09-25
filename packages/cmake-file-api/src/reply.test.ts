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
  it("reads a well-formed index file", async function (context) {
    const tmpPath = createMockReplyDirectory(context, [["index-a.json", {}]]);
    const result = await readIndex(path.join(tmpPath, "index-a.json"));
    // TODO: Fix this test
  });
});
