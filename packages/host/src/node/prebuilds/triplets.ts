/**
 * https://developer.android.com/ndk/guides/other_build_systems
 */
export const ANDROID_TRIPLETS = [
  "aarch64-linux-android",
  "armv7a-linux-androideabi",
  "i686-linux-android",
  "x86_64-linux-android",
] as const;

export type AndroidTriplet = (typeof ANDROID_TRIPLETS)[number];

export const APPLE_TRIPLETS = [
  "x86_64-apple-darwin",
  "arm64-apple-darwin",
  "arm64;x86_64-apple-darwin",

  "arm64-apple-ios",
  "x86_64-apple-ios-sim",
  "arm64-apple-ios-sim",
  "arm64;x86_64-apple-ios-sim",

  "arm64-apple-tvos",
  // "x86_64-apple-tvos",
  "x86_64-apple-tvos-sim",
  "arm64-apple-tvos-sim",
  "arm64;x86_64-apple-tvos-sim",

  "arm64-apple-visionos",
  "x86_64-apple-visionos-sim",
  "arm64-apple-visionos-sim",
  "arm64;x86_64-apple-visionos-sim",
] as const;

export type AppleTriplet = (typeof APPLE_TRIPLETS)[number];

export const SUPPORTED_TRIPLETS = [
  ...APPLE_TRIPLETS,
  ...ANDROID_TRIPLETS,
] as const;

export type SupportedTriplet = (typeof SUPPORTED_TRIPLETS)[number];

export function isSupportedTriplet(
  triplet: unknown,
): triplet is SupportedTriplet {
  return (SUPPORTED_TRIPLETS as readonly unknown[]).includes(triplet);
}

export function isAndroidTriplet(
  triplet: SupportedTriplet,
): triplet is AndroidTriplet {
  return (ANDROID_TRIPLETS as readonly unknown[]).includes(triplet);
}

export function isAppleTriplet(
  triplet: SupportedTriplet,
): triplet is AppleTriplet {
  return (APPLE_TRIPLETS as readonly unknown[]).includes(triplet);
}
