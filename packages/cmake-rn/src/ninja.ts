import cp from "node:child_process";

export function isNinjaAvailable(): boolean {
  return cp.spawnSync("ninja", ["--version"]).status === 0;
}
