import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  platforms,
  platformHasTarget,
  findPlatformForTarget,
} from "./platforms.js";
import { Platform } from "./platforms/types.js";

const mockPlatform = { targets: ["target1", "target2"] } as unknown as Platform;

describe("platformHasTarget", () => {
  it("returns true when platform has target", () => {
    assert.equal(platformHasTarget(mockPlatform, "target1"), true);
  });

  it("returns false when platform doesn't have target", () => {
    assert.equal(platformHasTarget(mockPlatform, "target3"), false);
  });
});

describe("findPlatformForTarget", () => {
  it("returns platform when target is found", () => {
    assert(platforms.length >= 2, "Expects at least two platforms");
    const [platform1, platform2] = platforms;
    const platform = findPlatformForTarget(platform1.targets[0]);
    assert.equal(platform, platform1);
    assert.notEqual(platform, platform2);
  });
});
