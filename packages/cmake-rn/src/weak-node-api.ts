import path from "node:path";

import { getWeakNodeApiPath, SupportedTriplet } from "react-native-node-api";

import { getNodeApiIncludeDirectories } from "./headers.js";

export function toCmakePath(input: string) {
  return input.split(path.win32.sep).join(path.posix.sep);
}

export function getWeakNodeApiVariables(triplet: SupportedTriplet) {
  return {
    // TODO: Make these names less "cmake-js" specific with an option to use the CMAKE_JS prefix
    CMAKE_JS_INC: getNodeApiIncludeDirectories(),
    CMAKE_JS_LIB: getWeakNodeApiPath(triplet),
  };
}
