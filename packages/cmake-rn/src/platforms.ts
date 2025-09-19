import assert from "node:assert/strict";

import { platform as android } from "./platforms/android.js";
import { platform as apple } from "./platforms/apple.js";
import { Platform } from "./platforms/types.js";

export const platforms: Platform[] = [android, apple] as const;
export const allTriplets = [...android.triplets, ...apple.triplets] as const;

export function platformHasTriplet<P extends Platform>(
  platform: P,
  triplet: unknown,
): triplet is P["triplets"][number] {
  return (platform.triplets as unknown[]).includes(triplet);
}

export function findPlatformForTriplet(triplet: unknown) {
  const platform = Object.values(platforms).find((platform) =>
    platformHasTriplet(platform, triplet),
  );
  assert(
    platform,
    `Unable to determine platform from triplet: ${
      typeof triplet === "string" ? triplet : JSON.stringify(triplet)
    }`,
  );
  return platform;
}
