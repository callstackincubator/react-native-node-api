import fs from "node:fs";
import assert from "node:assert/strict";
import path from "node:path";

import {
  isAndroidTriplet,
  isAppleTriplet,
  type NodeApiLinkage,
  SupportedTriplet,
} from "react-native-node-api";

import {
  applePrebuildPath,
  androidPrebuildPath,
  hermesStubApplePrebuildPath,
  hermesStubAndroidPrebuildPath,
  weakNodeApiCmakePath,
} from "weak-node-api";

import { ANDROID_ARCHITECTURES } from "./platforms/android.js";
import { getNodeAddonHeadersPath, getNodeApiHeadersPath } from "./headers.js";

export function toCmakePath(input: string) {
  return input.split(path.win32.sep).join(path.posix.sep);
}

const NODE_API_CONFIG_DIR = path.resolve(import.meta.dirname, "../cmake");

function getPrebuildPath(
  triplet: SupportedTriplet | "apple",
  {
    apple,
    android,
    libraryName,
  }: { apple: string; android: string; libraryName: string },
): string {
  if (triplet === "apple" || isAppleTriplet(triplet)) {
    assert(fs.existsSync(apple), `Expected an XCFramework at ${apple}`);
    return apple;
  } else if (isAndroidTriplet(triplet)) {
    const libraryPath = path.join(
      android,
      ANDROID_ARCHITECTURES[triplet],
      `lib${libraryName}.so`,
    );
    assert(fs.existsSync(libraryPath), `Expected library at ${libraryPath}`);
    return libraryPath;
  } else {
    throw new Error(`Unexpected triplet: ${triplet as string}`);
  }
}

export function getWeakNodeApiPath(triplet: SupportedTriplet | "apple") {
  return getPrebuildPath(triplet, {
    apple: applePrebuildPath,
    android: androidPrebuildPath,
    libraryName: "weak-node-api",
  });
}

export function getHermesStubPath(triplet: SupportedTriplet | "apple") {
  return getPrebuildPath(triplet, {
    apple: hermesStubApplePrebuildPath,
    android: hermesStubAndroidPrebuildPath,
    libraryName: "hermesvm",
  });
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
    // Enable use of `find_package(weak-node-api REQUIRED CONFIG)`
    "weak-node-api_DIR": path.dirname(weakNodeApiCmakePath),
    // Enable use of `include(${WEAK_NODE_API_CONFIG})`
    WEAK_NODE_API_CONFIG: weakNodeApiCmakePath,
    WEAK_NODE_API_INC: getNodeApiIncludePaths().join(";"),
    WEAK_NODE_API_LIB: getWeakNodeApiPath(triplet),
  };
}

/**
 * Variables for the selected --node-api-linkage: the neutral `node-api-linkage`
 * target follows the mode, while the `weak-node-api` target stays available so
 * addons naming it directly keep building alongside.
 */
export function getNodeApiLinkageVariables(
  linkage: NodeApiLinkage,
  triplet: SupportedTriplet | "apple",
): Record<string, string> {
  if (linkage === "none") {
    return {};
  }
  return {
    ...getWeakNodeApiVariables(triplet),
    // Enable use of `find_package(node-api-linkage REQUIRED CONFIG)`
    "node-api-linkage_DIR": NODE_API_CONFIG_DIR,
    NODE_API_LINKAGE: linkage,
    NODE_API_LINKAGE_INC: getNodeApiIncludePaths().join(";"),
    NODE_API_LINKAGE_LIB:
      linkage === "hermes"
        ? getHermesStubPath(triplet)
        : getWeakNodeApiPath(triplet),
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
