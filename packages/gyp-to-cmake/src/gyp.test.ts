import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { assertBinding } from "./gyp.js";

describe("gyp.assertRoot", () => {
  it("should throw if input is malformed", () => {
    assert.throws(() => {
      assertBinding("not an object");
    }, /Expected an object/);

    assert.throws(() => {
      assertBinding({});
    }, /Expected a 'targets' property/);

    assert.throws(() => {
      assertBinding({ targets: "not an array" });
    }, /Expected a 'targets' array/);
  });

  it("should throw if input has extra properties", () => {
    assert.throws(() => {
      assertBinding({ targets: [], extra: "not allowed" }, true);
    }, /Unexpected property: extra/);

    assert.throws(() => {
      assertBinding(
        {
          targets: [{ target_name: "", sources: [], extra: "not allowed" }],
        },
        true,
      );
    }, /Unexpected property: extra/);
  });

  it("should parse a file with no targets", () => {
    const input: unknown = { targets: [] };
    assertBinding(input);
    assert(Array.isArray(input.targets));
  });

  it("should accept target cflags", () => {
    assert.doesNotThrow(() => {
      assertBinding(
        {
          targets: [
            {
              target_name: "addon",
              sources: ["addon.cc"],
              cflags: ["-fPIC", "-Wall"],
            },
          ],
        },
        true,
      );
    });
  });

  it("should reject malformed target cflags", () => {
    assert.throws(() => {
      assertBinding({
        targets: [
          {
            target_name: "addon",
            sources: ["addon.cc"],
            cflags: "-fPIC",
          },
        ],
      });
    }, /Expected 'cflags' to be an array/);

    assert.throws(() => {
      assertBinding({
        targets: [
          {
            target_name: "addon",
            sources: ["addon.cc"],
            cflags: ["-fPIC", 42],
          },
        ],
      });
    }, /Expected all cflags to be strings/);
  });
});
