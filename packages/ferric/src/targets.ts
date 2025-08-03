import chalk from "chalk";

import { UsageError } from "./errors.js";
import { getInstalledTargets } from "./rustup.js";

export const ANDROID_TARGETS = [
  "aarch64-linux-android",
  "armv7-linux-androideabi",
  "i686-linux-android",
  "x86_64-linux-android",
  // "arm-linux-androideabi",
  // "thumbv7neon-linux-androideabi",
] as const;

export type AndroidTargetName = (typeof ANDROID_TARGETS)[number];

// TODO: Consider calling out to rustup to generate this list or just use @napi-rs/triples
export const APPLE_TARGETS = [
  "aarch64-apple-darwin",
  "x86_64-apple-darwin",
  "aarch64-apple-ios",
  "aarch64-apple-ios-sim",
  // "aarch64-apple-ios-macabi", // Catalyst
  // "x86_64-apple-ios",
  // "x86_64-apple-ios-macabi", // Catalyst

  // TODO: Re-enabled these when we know how to install them 🙈
  /*
  "aarch64-apple-tvos",
  "aarch64-apple-tvos-sim",
  "aarch64-apple-visionos",
  "aarch64-apple-visionos-sim",
  */

  // "aarch64-apple-watchos",
  // "aarch64-apple-watchos-sim",
  // "arm64_32-apple-watchos",
  // "arm64e-apple-darwin",
  // "arm64e-apple-ios",
  // "arm64e-apple-tvos",
  // "armv7k-apple-watchos",
  // "armv7s-apple-ios",
  // "i386-apple-ios",
  // "i686-apple-darwin",
  // "x86_64-apple-tvos",
  // "x86_64-apple-watchos-sim",
  // "x86_64h-apple-darwin",
] as const;
export type AppleTargetName = (typeof APPLE_TARGETS)[number];

export const ALL_TARGETS = [...ANDROID_TARGETS, ...APPLE_TARGETS] as const;
export type TargetName = (typeof ALL_TARGETS)[number];

/**
 * Ensure the targets are installed into the Rust toolchain
 * We do this up-front because the error message and fix is very unclear from the failure when missing.
 */
export function ensureInstalledTargets(expectedTargets: Set<TargetName>) {
  const installedTargets = getInstalledTargets();
  const missingTargets = new Set([
    ...[...expectedTargets].filter((target) => !installedTargets.has(target)),
  ]);
  if (missingTargets.size > 0) {
    // TODO: Ask the user if they want to run this
    throw new UsageError(
      `You're missing ${
        missingTargets.size
      } targets - to fix this, run:\n\n${chalk.italic(
        `rustup target add ${[...missingTargets].join(" ")}`,
      )}`,
    );
  }
}

export function isAndroidTarget(
  target: TargetName,
): target is AndroidTargetName {
  return ANDROID_TARGETS.includes(target as (typeof ANDROID_TARGETS)[number]);
}

export function isAppleTarget(target: TargetName): target is AppleTargetName {
  return APPLE_TARGETS.includes(target as (typeof APPLE_TARGETS)[number]);
}

export function filterTargetsByPlatform(
  targets: Set<TargetName>,
  platform: "android",
): AndroidTargetName[];
export function filterTargetsByPlatform(
  targets: Set<TargetName>,
  platform: "apple",
): AppleTargetName[];
export function filterTargetsByPlatform(
  targets: Set<TargetName>,
  platform: "apple" | "android",
) {
  if (platform === "android") {
    return [...targets].filter(isAndroidTarget);
  } else if (platform === "apple") {
    return [...targets].filter(isAppleTarget);
  } else {
    throw new Error(`Unexpected platform ${platform as string}`);
  }
}
