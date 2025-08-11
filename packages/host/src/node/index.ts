export {
  SUPPORTED_TRIPLETS,
  ANDROID_TRIPLETS,
  APPLE_TRIPLETS,
  NODE_TRIPLETS,
  type SupportedTriplet,
  type AndroidTriplet,
  type AppleTriplet,
  type NodeTriplet,
  isSupportedTriplet,
  isAppleTriplet,
  isAndroidTriplet,
  isNodeTriplet,
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

export {
  createNodeLibsDirectory,
  determineNodeLibsFilename,
} from "./prebuilds/node.js";

export { determineLibraryBasename, prettyPath } from "./path-utils.js";

export { weakNodeApiPath, getWeakNodeApiPath } from "./weak-node-api.js";
