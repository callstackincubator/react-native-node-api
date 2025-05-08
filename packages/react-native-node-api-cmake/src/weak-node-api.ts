import fs from "node:fs";
import assert from "node:assert/strict";
import path from "node:path";

import {
  isAndroidTriplet,
  isAppleTriplet,
  SupportedTriplet,
} from "react-native-node-api-modules";

import { ANDROID_ARCHITECTURES } from "./android.js";
import { getNodeAddonHeadersPath, getNodeApiHeadersPath } from "./headers.js";

export function getWeakNodeApiPath(triplet: SupportedTriplet): string {
  const { pathname } = new URL(
    import.meta.resolve("react-native-node-api-modules/weak-node-api")
  );
  assert(fs.existsSync(pathname), "Weak Node API path does not exist");
  if (isAppleTriplet(triplet)) {
    const xcframeworkPath = path.join(pathname, "libweak-node-api.xcframework");
    assert(
      fs.existsSync(xcframeworkPath),
      `Expected an XCFramework at ${xcframeworkPath}`
    );
    return xcframeworkPath;
  } else if (isAndroidTriplet(triplet)) {
    const libraryPath = path.join(
      pathname,
      "libweak-node-api.android.node",
      ANDROID_ARCHITECTURES[triplet],
      "libweak-node-api.so"
    );
    assert(fs.existsSync(libraryPath), `Expected library at ${libraryPath}`);
    return libraryPath;
  }
  return pathname;
}

export function getWeakNodeApiVariables(triplet: SupportedTriplet) {
  const includePaths = [getNodeApiHeadersPath(), getNodeAddonHeadersPath()];
  for (const includePath of includePaths) {
    assert(
      !includePath.includes(";"),
      `Include path with a ';' is not supported: ${includePath}`
    );
  }
  return {
    CMAKE_JS_INC: includePaths.join(";"),
    CMAKE_JS_LIB: getWeakNodeApiPath(triplet),
  };
}
