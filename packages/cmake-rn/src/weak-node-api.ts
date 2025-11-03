import fs from "node:fs";
import assert from "node:assert/strict";
import path from "node:path";

import {
  isAndroidTriplet,
  isAppleTriplet,
  SupportedTriplet,
} from "react-native-node-api";

import {
  applePrebuildPath,
  androidPrebuildPath,
  weakNodeApiCmakePath,
} from "weak-node-api";

import { ANDROID_ARCHITECTURES } from "./platforms/android.js";
import { getNodeAddonHeadersPath, getNodeApiHeadersPath } from "./headers.js";

export function toCmakePath(input: string) {
  return input.split(path.win32.sep).join(path.posix.sep);
}

export function getWeakNodeApiPath(
  triplet: SupportedTriplet | "apple",
): string {
  if (triplet === "apple" || isAppleTriplet(triplet)) {
    assert(
      fs.existsSync(applePrebuildPath),
      `Expected an XCFramework at ${applePrebuildPath}`,
    );
    return applePrebuildPath;
  } else if (isAndroidTriplet(triplet)) {
    const libraryPath = path.join(
      androidPrebuildPath,
      ANDROID_ARCHITECTURES[triplet],
      "libweak-node-api.so",
    );
    assert(fs.existsSync(libraryPath), `Expected library at ${libraryPath}`);
    return libraryPath;
  } else {
    throw new Error(`Unexpected triplet: ${triplet as string}`);
  }
}

function getNodeApiIncludePaths() {
  const includePaths = [getNodeApiHeadersPath(), getNodeAddonHeadersPath()];
  for (const includePath of includePaths) {
    assert(
      !includePath.includes(";"),
      `Include path with a ';' is not supported: ${includePath}`,
    );
  }
  return includePaths;
}

export function getWeakNodeApiVariables(
  triplet: SupportedTriplet | "apple",
): Record<string, string> {
  return {
    // Expose an includable CMake config file declaring the weak-node-api target
    WEAK_NODE_API_CONFIG: weakNodeApiCmakePath,
    WEAK_NODE_API_INC: getNodeApiIncludePaths().join(";"),
    WEAK_NODE_API_LIB: getWeakNodeApiPath(triplet),
  };
}

/**
 * For compatibility with cmake-js
 */
export function getCmakeJSVariables(
  triplet: SupportedTriplet | "apple",
): Record<string, string> {
  return {
    CMAKE_JS_INC: getNodeApiIncludePaths().join(";"),
    CMAKE_JS_LIB: getWeakNodeApiPath(triplet),
  };
}
