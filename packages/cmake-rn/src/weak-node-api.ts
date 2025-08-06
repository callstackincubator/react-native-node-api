import fs from "node:fs";
import assert from "node:assert/strict";
import path from "node:path";

import {
  isAndroidTriplet,
  isAppleTriplet,
  SupportedTriplet,
  weakNodeApiPath,
} from "react-native-node-api";

import { ANDROID_ARCHITECTURES } from "./platforms/android.js";
import { getNodeApiIncludeDirectories } from "./headers.js";

export function toCmakePath(input: string) {
  return input.split(path.win32.sep).join(path.posix.sep);
}

export function getWeakNodeApiPath(triplet: SupportedTriplet): string {
  if (isAppleTriplet(triplet)) {
    const xcframeworkPath = path.join(
      weakNodeApiPath,
      "weak-node-api.xcframework",
    );
    assert(
      fs.existsSync(xcframeworkPath),
      `Expected an XCFramework at ${xcframeworkPath}`,
    );
    return xcframeworkPath;
  } else if (isAndroidTriplet(triplet)) {
    const libraryPath = path.join(
      weakNodeApiPath,
      "weak-node-api.android.node",
      ANDROID_ARCHITECTURES[triplet],
      "libweak-node-api.so",
    );
    assert(fs.existsSync(libraryPath), `Expected library at ${libraryPath}`);
    return libraryPath;
  } else {
    throw new Error(`Unexpected triplet: ${triplet as string}`);
  }
}

export function getWeakNodeApiVariables(triplet: SupportedTriplet) {
  return {
    // TODO: Make these names less "cmake-js" specific with an option to use the CMAKE_JS prefix
    CMAKE_JS_INC: getNodeApiIncludeDirectories(),
    CMAKE_JS_LIB: getWeakNodeApiPath(triplet),
  };
}
