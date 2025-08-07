import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  isAndroidTriplet,
  isAppleTriplet,
  SupportedTriplet,
} from "./prebuilds/triplets";
import { ANDROID_ARCHITECTURES } from "./prebuilds/android";

export const weakNodeApiPath = path.resolve(__dirname, "../../weak-node-api");

assert(
  fs.existsSync(weakNodeApiPath),
  `Expected Weak Node API path to exist: ${weakNodeApiPath}`,
);

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
