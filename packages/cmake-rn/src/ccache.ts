import assert from "node:assert";
import cp from "node:child_process";

export function getCcachePath(): string | null {
  const result = cp.spawnSync("which", ["ccache"]);
  if (result.status === 0) {
    return result.stdout.toString().trim();
  } else {
    return null;
  }
}

export function getCmakeVersion(ccachePath: string): string {
  const result = cp.spawnSync(ccachePath, ["--print-version"]);
  assert.equal(result.status, 0, "Failed to get ccache version");
  return result.stdout.toString().trim();
}
