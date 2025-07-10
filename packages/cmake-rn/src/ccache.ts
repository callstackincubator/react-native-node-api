import cp from "node:child_process";

export function getCcacheVersion(): string | undefined {
  const { status, stdout } = cp.spawnSync("ccache", ["--print-version"], {
    encoding: "utf8",
  });
  if (status === 0) {
    return stdout.trim();
  }
}
