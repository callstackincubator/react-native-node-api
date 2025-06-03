import { execSync } from "node:child_process";
import { platform } from "node:os";

import { findCMakeProjects } from "./cmake-projects.mjs";

const projectDirectories = findCMakeProjects();

// Platform-specific build command
let buildCommand: string;
switch (platform()) {
  case "darwin":
    // macOS: build for both Android and Apple
    buildCommand = "react-native-node-api-cmake --android --apple";
    break;
  case "win32":
  case "linux":
    // Windows and Linux: only Android
    buildCommand = "react-native-node-api-cmake --android";
    break;
  default:
    console.error(`Unsupported platform: ${platform()}`);
    process.exit(1);
}

for (const projectDirectory of projectDirectories) {
  console.log(`Running "${buildCommand}" in ${projectDirectory}`);
  execSync(
    buildCommand,
    // "react-native-node-api-cmake --triplet aarch64-linux-android --triplet arm64-apple-ios-sim",
    {
      cwd: projectDirectory,
      stdio: "inherit",
    }
  );
  console.log();
}
