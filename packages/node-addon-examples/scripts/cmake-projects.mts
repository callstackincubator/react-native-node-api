import { readdirSync, statSync, existsSync } from "node:fs";
import path from "node:path";

export const EXAMPLES_DIR = path.resolve(import.meta.dirname, "../examples");
export const TESTS_DIR = path.resolve(import.meta.dirname, "../tests");
export const DIRS = [EXAMPLES_DIR, TESTS_DIR];

export function findCMakeProjectsRecursively(dir: string): string[] {
  let results: string[] = [];
  if (!existsSync(dir)) {
    return results;
  }
  const files = readdirSync(dir);

  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (statSync(fullPath).isDirectory()) {
      results = results.concat(findCMakeProjectsRecursively(fullPath));
    } else if (file === "CMakeLists.txt") {
      results.push(dir);
    }
  }

  return results;
}

export function findCMakeProjects(): string[] {
  return DIRS.flatMap(findCMakeProjectsRecursively);
}
