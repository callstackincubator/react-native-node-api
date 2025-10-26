import { chalk, UsageError, assertFixable } from "@react-native-node-api/cli-utils";
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
  */
  "aarch64-apple-visionos",
  "aarch64-apple-visionos-sim",

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
 * Tier 3 Rust targets that are not available via `rustup target add` 
 * and require building the standard library from source using `-Zbuild-std`.
 * 
 * @see https://doc.rust-lang.org/rustc/platform-support.html
 * @see https://doc.rust-lang.org/cargo/reference/unstable.html#build-std
 */
export const TIER_3_TARGETS: readonly TargetName[] = [
  "aarch64-apple-visionos",
  "aarch64-apple-visionos-sim",
] as const;

/**
 * Check if a target is a tier 3 target that requires build-std
 */
export function isTier3Target(target: TargetName): boolean {
  return (TIER_3_TARGETS as readonly string[]).includes(target);
}

/**
 * Ensure the targets are installed into the Rust toolchain
 * We do this up-front because the error message and fix is very unclear from the failure when missing.
 */
export function ensureInstalledTargets(expectedTargets: Set<TargetName>) {
  const installedTargets = getInstalledTargets();
  const missingStandardTargets = new Set([
    ...[...expectedTargets].filter(
      (target) => !installedTargets.has(target) && !isTier3Target(target),
    ),
  ]);
  const tier3Targets = new Set([
    ...[...expectedTargets].filter((target) => isTier3Target(target)),
  ]);

  // Handle standard targets that can be installed via rustup
  assertFixable(
    missingStandardTargets.size === 0,
    `You're missing ${missingStandardTargets.size} targets`,
    {
      command: `rustup target add ${[...missingStandardTargets].join(" ")}`,
    },
  );

  // Handle tier 3 targets that require build-std setup
  // Check if tier 3 targets are properly configured (included in installedTargets means they're available)
  const missingTier3Targets = new Set([
    ...[...tier3Targets].filter((target) => !installedTargets.has(target)),
  ]);

  assertFixable(
    missingTier3Targets.size === 0,
    `You're using tier 3 targets (${[...missingTier3Targets].join(", ")}) that require building the standard library from source`,
    {
      instructions:
        `To set up support for these targets:\n\n` +
        `1. Install nightly Rust with the rust-src component:\n` +
        `   ${chalk.italic("rustup toolchain install nightly --component rust-src")}\n\n` +
        `2. Configure Cargo to use build-std by creating a .cargo/config.toml file:\n` +
        `   ${chalk.italic("[unstable]")}\n` +
        `   ${chalk.italic('build-std = ["std", "panic_abort"]')}\n\n` +
        `3. Set your default toolchain to nightly:\n` +
        `   ${chalk.italic("rustup default nightly")}\n\n` +
        `For more information, see:\n` +
        `- Rust Platform Support: ${chalk.italic("https://doc.rust-lang.org/rustc/platform-support.html")}\n` +
        `- Cargo build-std: ${chalk.italic("https://doc.rust-lang.org/cargo/reference/unstable.html#build-std")}`,
    },
  );
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
