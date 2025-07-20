export {
  SUPPORTED_TRIPLETS,
  ANDROID_TRIPLETS,
  APPLE_TRIPLETS,
  type SupportedTriplet,
  type AndroidTriplet,
  type AppleTriplet,
  isSupportedTriplet,
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

export { determineLibraryBasename, prettyPath } from "./path-utils.js";
