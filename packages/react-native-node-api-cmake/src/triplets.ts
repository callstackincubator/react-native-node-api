import { ANDROID_TRIPLETS } from "./android.js";
import { APPLE_TRIPLETS } from "./apple.js";

export const SUPPORTED_TRIPLETS = [
  ...APPLE_TRIPLETS,
  ...ANDROID_TRIPLETS,
] as const;

export type SupportedTriplet = (typeof SUPPORTED_TRIPLETS)[number];
