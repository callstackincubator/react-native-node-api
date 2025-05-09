export {
  ANDROID_TRIPLETS,
  APPLE_TRIPLETS,
  SUPPORTED_TRIPLETS,
  type AndroidTriplet,
  type AppleTriplet,
  type SupportedTriplet,
  isAppleTriplet,
  isAndroidTriplet,
} from "./prebuilds/triplets.js";

export {
  determineAndroidLibsFilename,
  createAndroidLibsDirectory,
} from "./prebuilds/android.js";

export {
  createAppleFramework,
  createXCframework,
  createUniversalAppleLibrary,
  determineXCFrameworkFilename,
} from "./prebuilds/apple.js";

export { determineLibraryFilename, prettyPath } from "./path-utils.js";
