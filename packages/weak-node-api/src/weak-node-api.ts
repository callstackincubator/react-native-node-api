import path from "node:path";
import fs from "node:fs";

export const weakNodeApiPath = path.resolve(import.meta.dirname, "..");

const debugOutputPath = path.resolve(weakNodeApiPath, "build", "Debug");
const releaseOutputPath = path.resolve(weakNodeApiPath, "build", "Release");

export const outputPath = fs.existsSync(debugOutputPath)
  ? debugOutputPath
  : releaseOutputPath;

export const applePrebuildPath = path.resolve(
  outputPath,
  "weak-node-api.xcframework",
);

export const androidPrebuildPath = path.resolve(
  outputPath,
  "weak-node-api.android.node",
);

export const weakNodeApiCmakePath = path.resolve(
  weakNodeApiPath,
  "weak-node-api-config.cmake",
);

const stubPath = path.resolve(weakNodeApiPath, "stub", "build");

const stubOutputPath = fs.existsSync(path.resolve(stubPath, "Debug"))
  ? path.resolve(stubPath, "Debug")
  : path.resolve(stubPath, "Release");

/**
 * Link-time stub of the Hermes library, letting addons link Node-API directly against Hermes.
 */
export const hermesStubApplePrebuildPath = path.resolve(
  stubOutputPath,
  "hermesvm.xcframework",
);

export const hermesStubAndroidPrebuildPath = path.resolve(
  stubOutputPath,
  "hermesvm.android.node",
);
