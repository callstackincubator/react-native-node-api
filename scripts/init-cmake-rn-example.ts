import path from "node:path";

import { regenerateExample } from "./regenerate-example.ts";

const ROOT_PATH = path.join(import.meta.dirname, "..");
const EXAMPLE_PATH = path.join(ROOT_PATH, "packages", "cmake-rn-example");
const LIBRARY_NAME = "cmake-rn-example";

await regenerateExample({
  examplePath: EXAMPLE_PATH,
  binPath: path.join(ROOT_PATH, "packages", "cmake-rn", "bin", "cmake-rn.js"),
  generatedPaths: [
    ".gitignore",
    "CMakeLists.txt",
    `${LIBRARY_NAME}.d.ts`,
    `${LIBRARY_NAME}.js`,
    "package.json",
    "src/addon.c",
  ],
});
