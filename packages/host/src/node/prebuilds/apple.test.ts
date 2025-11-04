import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { escapeBundleIdentifier } from "./apple";

describe("escapeBundleIdentifier", () => {
  it("escapes and passes through values as expected", () => {
    assert.equal(
      escapeBundleIdentifier("abc-def-123-789.-"),
      "abc-def-123-789.-",
    );
    assert.equal(escapeBundleIdentifier("abc_def"), "abc-def");
    assert.equal(escapeBundleIdentifier("abc\ndef"), "abc-def");
    assert.equal(escapeBundleIdentifier("\0abc"), "-abc");
    assert.equal(escapeBundleIdentifier("🤷"), "--"); // An emoji takes up two chars
  });
});
