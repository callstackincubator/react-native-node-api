import cp from "node:child_process";

export function getCcachePath(): string | null {
  const result = cp.spawnSync("which", ["ccache"]);
  if (result.status === 0) {
    return result.stdout.toString().trim();
  } else {
    return null;
  }
}
