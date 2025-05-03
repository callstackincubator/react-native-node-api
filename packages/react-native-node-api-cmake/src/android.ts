import { type SupportedTriplet } from "./triplets.js";

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

export const DEFAULT_ANDROID_TRIPLETS = [
  "aarch64-linux-android",
  "armv7a-linux-androideabi",
  "i686-linux-android",
  "x86_64-linux-android",
] as const satisfies AndroidTriplet[];

export function isAndroidTriplet(
  triplet: SupportedTriplet
): triplet is AndroidTriplet {
  return ANDROID_TRIPLETS.includes(triplet as AndroidTriplet);
}
