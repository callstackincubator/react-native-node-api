import path from "node:path";

export const weakNodeApiPath = path.resolve(import.meta.dirname, "..");

// TODO: Support multiple configurations
export const outputPath = path.resolve(weakNodeApiPath, "build", "Release");

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
  "weak-node-api.cmake",
);
