import cp from "node:child_process";

export function getCcachePath(): string | null {
  const result = cp.spawnSync(
    process.platform === "win32" ? "where" : "which",
    ["ccache"],
  );
  if (result.status === 0) {
    return result.stdout.toString().trim();
  } else {
    return null;
  }
}
