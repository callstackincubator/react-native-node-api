import { readdirSync, statSync } from "node:fs";
import path from "node:path";

export const EXAMPLES_DIR = path.resolve(import.meta.dirname, "../examples");

export function findCMakeProjects(dir = EXAMPLES_DIR): string[] {
  let results: string[] = [];
  const files = readdirSync(dir);

  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (statSync(fullPath).isDirectory()) {
      results = results.concat(findCMakeProjects(fullPath));
    } else if (file === "CMakeLists.txt") {
      results.push(dir);
    }
  }

  return results;
}
