import { execSync } from "node:child_process";

import { findCMakeProjects } from "./utils.mjs";

const projectDirectories = findCMakeProjects();

for (const projectDirectory of projectDirectories) {
  console.log(
    `Running "cmake-rn" in ${projectDirectory} to build for React Native`
  );
  execSync("cmake-rn", {
    cwd: projectDirectory,
    stdio: "inherit",
  });
}
