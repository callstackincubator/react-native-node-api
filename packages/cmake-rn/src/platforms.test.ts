import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  platforms,
  platformHasTriplet,
  findPlatformForTriplet,
} from "./platforms.js";
import { Platform } from "./platforms/types.js";

const mockPlatform = {
  triplets: ["triplet1", "triplet2"],
} as unknown as Platform;

describe("platformHasTriplet", () => {
  it("returns true when platform has triplet", () => {
    assert.equal(platformHasTriplet(mockPlatform, "triplet1"), true);
  });

  it("returns false when platform doesn't have triplet", () => {
    assert.equal(platformHasTriplet(mockPlatform, "triplet3"), false);
  });
});

describe("findPlatformForTriplet", () => {
  it("returns platform when triplet is found", () => {
    assert(platforms.length >= 2, "Expects at least two platforms");
    const [platform1, platform2] = platforms;
    const platform = findPlatformForTriplet(platform1.triplets[0]);
    assert.equal(platform, platform1);
    assert.notEqual(platform, platform2);
  });
});
