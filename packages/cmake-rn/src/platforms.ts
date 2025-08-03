import assert from "node:assert/strict";

import { platform as android } from "./platforms/android.js";
import { platform as apple } from "./platforms/apple.js";
import { Platform } from "./platforms/types.js";

export const platforms: Platform[] = [android, apple] as const;
export const allTargets = [...android.targets, ...apple.targets] as const;

export function platformHasTarget<P extends Platform>(
  platform: P,
  target: unknown,
): target is P["targets"][number] {
  return (platform.targets as unknown[]).includes(target);
}

export function findPlatformForTarget(target: unknown) {
  const platform = Object.values(platforms).find((platform) =>
    platformHasTarget(platform, target),
  );
  assert(
    platform,
    `Unable to determine platform from target: ${
      typeof target === "string" ? target : JSON.stringify(target)
    }`,
  );
  return platform;
}
