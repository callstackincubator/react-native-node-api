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
  weakNodeApiCmakePath,
} from "weak-node-api";
import { nodeApiStubPath } from "node-api-stub";

import { ANDROID_ARCHITECTURES } from "./platforms/android.js";
import { getNodeAddonHeadersPath, getNodeApiHeadersPath } from "./headers.js";

export function toCmakePath(input: string) {
  return input.split(path.win32.sep).join(path.posix.sep);
}

const NODE_API_CONFIG_DIR = path.resolve(import.meta.dirname, "../cmake");

function findWeakNodeApiPath(triplet: SupportedTriplet | "apple") {
  if (triplet === "apple" || isAppleTriplet(triplet)) {
    return applePrebuildPath;
  } else if (isAndroidTriplet(triplet)) {
    return path.join(
      androidPrebuildPath,
      ANDROID_ARCHITECTURES[triplet],
      "libweak-node-api.so",
    );
  } else {
    throw new Error(`Unexpected triplet: ${triplet as string}`);
  }
}

export function getWeakNodeApiPath(
  triplet: SupportedTriplet | "apple",
): string {
  const result = findWeakNodeApiPath(triplet);
  assert(fs.existsSync(result), `Expected weak-node-api at ${result}`);
  return result;
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
 * Variables for the selected --node-api-linkage, which the `node-api` target follows.
 */
export function getNodeApiLinkageVariables(
  linkage: NodeApiLinkage,
  triplet: SupportedTriplet | "apple",
): Record<string, string> {
  if (linkage === "none") {
    return {};
  }
  const nodeApiVariables = {
    // Enable use of `find_package(node-api REQUIRED CONFIG)`
    "node-api_DIR": NODE_API_CONFIG_DIR,
    NODE_API_LINKAGE: linkage,
    NODE_API_INC: getNodeApiIncludePaths().join(";"),
  };
  if (linkage === "hermes") {
    return {
      // Keeps the `weak-node-api` target available to addons naming it, without requiring it
      ...(fs.existsSync(findWeakNodeApiPath(triplet))
        ? getWeakNodeApiVariables(triplet)
        : {}),
      ...nodeApiVariables,
      NODE_API_STUB_DIR: nodeApiStubPath,
    };
  }
  return {
    ...getWeakNodeApiVariables(triplet),
    ...nodeApiVariables,
    NODE_API_LIB: getWeakNodeApiPath(triplet),
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
