import cp from "node:child_process";

import { assertFixable } from "@react-native-node-api/cli-utils";
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
  "x86_64-apple-ios", // Simulator (despite the missing -sim suffix)

  // "aarch64-apple-ios-macabi", // Catalyst
  // "x86_64-apple-ios-macabi", // Catalyst

  "aarch64-apple-visionos",
  "aarch64-apple-visionos-sim",

  "aarch64-apple-tvos",
  // "arm64e-apple-tvos",
  "aarch64-apple-tvos-sim",
  "x86_64-apple-tvos", // Simulator (despite the missing -sim suffix)

  // "aarch64-apple-watchos",
  // "aarch64-apple-watchos-sim",
  // "arm64_32-apple-watchos",
  // "arm64e-apple-darwin",
  // "arm64e-apple-ios",
  // "armv7k-apple-watchos",
  // "armv7s-apple-ios",
  // "i386-apple-ios",
  // "i686-apple-darwin",
  // "x86_64-apple-watchos-sim",
  // "x86_64h-apple-darwin",
] as const;
export type AppleTargetName = (typeof APPLE_TARGETS)[number];

export const ALL_TARGETS = [...ANDROID_TARGETS, ...APPLE_TARGETS] as const;
export type TargetName = (typeof ALL_TARGETS)[number];

const THIRD_TIER_TARGETS: Set<TargetName> = new Set([
  "aarch64-apple-visionos",
  "aarch64-apple-visionos-sim",

  "aarch64-apple-tvos",
  "aarch64-apple-tvos-sim",
  "x86_64-apple-tvos",
]);

export function assertNightlyToolchain() {
  const toolchainLines = cp
    .execFileSync("rustup", ["toolchain", "list"], {
      encoding: "utf-8",
    })
    .split("\n");

  const nightlyLines = toolchainLines.filter((line) =>
    line.startsWith("nightly-"),
  );
  assertFixable(
    nightlyLines.length > 0,
    "You need to use a nightly Rust toolchain",
    {
      command: "rustup toolchain install nightly --component rust-src",
    },
  );

  const componentLines = cp
    .execFileSync("rustup", ["component", "list", "--toolchain", "nightly"], {
      encoding: "utf-8",
    })
    .split("\n");
  assertFixable(
    componentLines.some((line) => line === "rust-src (installed)"),
    "You need to install the rust-src component for the nightly Rust toolchain",
    {
      command: "rustup toolchain install nightly --component rust-src",
    },
  );
}

/**
 * Ensure the targets are either installed into the Rust toolchain or available via nightly Rust toolchain.
 * We do this up-front because the error message and fix is very unclear from the failure when missing.
 */
export function ensureAvailableTargets(expectedTargets: Set<TargetName>) {
  const installedTargets = getInstalledTargets();

  const missingInstallableTargets = expectedTargets
    .difference(installedTargets)
    .difference(THIRD_TIER_TARGETS);

  assertFixable(
    missingInstallableTargets.size === 0,
    `You need to add these targets to your toolchain: ${[
      ...missingInstallableTargets,
    ].join(", ")}`,
    {
      command: `rustup target add ${[...missingInstallableTargets].join(" ")}`,
    },
  );

  const expectedThirdTierTargets =
    expectedTargets.intersection(THIRD_TIER_TARGETS);
  if (expectedThirdTierTargets.size > 0) {
    assertNightlyToolchain();
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

export function isThirdTierTarget(target: TargetName): boolean {
  return THIRD_TIER_TARGETS.has(target);
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
