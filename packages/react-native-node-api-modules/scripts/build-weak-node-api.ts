#!/usr/bin/env tsx

import { execSync } from "node:child_process";
import { platform } from "node:os";

// First generate the weak node API
execSync("npm run generate-weak-node-api", { stdio: "inherit" });

// Build command with common flags
const baseCommand = "react-native-node-api-cmake --no-auto-link --no-weak-node-api-linkage --source ./weak-node-api";

// Platform-specific flags
let platformFlags = "";
switch (platform()) {
  case "darwin":
    // macOS: build for both Android and Apple
    platformFlags = "--android --apple --xcframework-extension";
    break;
  case "win32":
    // Windows: only Android (no Apple/Xcode support)
    platformFlags = "--android";
    break;
  case "linux":
    // Linux: only Android
    platformFlags = "--android";
    break;
  default:
    console.error(`Unsupported platform: ${platform()}`);
    process.exit(1);
}

const fullCommand = `${baseCommand} ${platformFlags}`;
console.log(`Running: ${fullCommand}`);
execSync(fullCommand, { stdio: "inherit" });