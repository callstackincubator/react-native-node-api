import { execSync } from "node:child_process";

import { findCMakeProjects } from "./cmake-projects.mjs";

const projectDirectories = findCMakeProjects();

for (const projectDirectory of projectDirectories) {
  console.log(`Running "cmake-rn" in ${projectDirectory}`);
  execSync("cmake-rn --configuration RelWithDebInfo", {
    cwd: projectDirectory,
    stdio: "inherit",
  });
  console.log();
}
