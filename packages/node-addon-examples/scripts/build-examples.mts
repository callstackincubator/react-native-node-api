import { execSync } from "node:child_process";

import { findCMakeProjects } from "./cmake-projects.mjs";

const projectDirectories = findCMakeProjects();

for (const projectDirectory of projectDirectories) {
  console.log(`Running "cmake-rn" in ${projectDirectory}`);
  execSync(
    "cmake-rn",
    // "cmake-rn --android --apple",
    // "cmake-rn --triplet aarch64-linux-android --triplet arm64-apple-ios-sim",
    {
      cwd: projectDirectory,
      stdio: "inherit",
    },
  );
  console.log();
}
