import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { detectJsonIndentation } from "./json.js";

describe("detectJsonIndentation", () => {
  it("uses the indentation of the first indented line", () => {
    assert.equal(detectJsonIndentation('{\n    "a": 1\n}'), "    ");
    assert.equal(detectJsonIndentation('{\r\n\t"a": 1\r\n}'), "\t");
  });

  it("skips blank lines", () => {
    assert.equal(detectJsonIndentation('{\n\n  \n  "a": 1\n}'), "  ");
  });

  it("defaults to two spaces", () => {
    assert.equal(detectJsonIndentation("{}"), "  ");
  });

  it("stays fast on many blank lines", () => {
    const start = performance.now();
    detectJsonIndentation("\n ".repeat(100_000));
    assert.ok(performance.now() - start < 1000);
  });
});
