import path from "node:path";
import { spawnSync } from "node:child_process";

import { findCMakeProjects } from "./utils.mjs";

const rootPath = path.join(import.meta.dirname, "..");
const projectPaths = findCMakeProjects();

for (const projectPath of projectPaths) {
  console.log(
    `Running "cmake-rn" in ${path.relative(
      rootPath,
      projectPath,
    )} to build for React Native`,
  );
  spawnSync("cmake-rn", [], { cwd: projectPath, stdio: "inherit" });
}
