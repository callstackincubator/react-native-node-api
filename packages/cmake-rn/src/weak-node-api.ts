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
import { getNodeAddonHeadersPath, getNodeApiHeadersPath } from "./headers.js";

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
  const includePaths = [getNodeApiHeadersPath(), getNodeAddonHeadersPath()];
  for (const includePath of includePaths) {
    assert(
      !includePath.includes(";"),
      `Include path with a ';' is not supported: ${includePath}`,
    );
  }
  return {
    CMAKE_JS_INC: includePaths.join(";"),
    CMAKE_JS_LIB: getWeakNodeApiPath(triplet),
  };
}
