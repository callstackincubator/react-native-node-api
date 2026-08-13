import fs from "node:fs";
import path from "node:path";

export const PACKAGE_DIR = path.resolve(import.meta.dirname, "..");
export const EXAMPLES_DIR = path.resolve(PACKAGE_DIR, "examples");
export const TESTS_DIR = path.resolve(PACKAGE_DIR, "tests");
export const DIRS = [EXAMPLES_DIR, TESTS_DIR];

/**
 * Find the shallowest directories declaring a CMake project.
 *
 * Recursion stops at the first CMakeLists.txt found on a path: an example
 * bringing its own nested CMake project has to be added to the root project
 * once, since CMake requires target names to be unique across the project tree.
 */
export function findRootCMakeProjects(dir: string): string[] {
  if (!fs.existsSync(dir)) {
    return [];
  }
  if (fs.existsSync(path.join(dir, "CMakeLists.txt"))) {
    return [dir];
  }
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((entry) => findRootCMakeProjects(path.join(dir, entry.name)));
}
