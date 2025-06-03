import { execFileSync, spawnSync } from "node:child_process";
import { platform } from "node:os";

/**
 * Get the platform-specific executable name
 */
export function getExecutableName(command: string): string {
  if (platform() === "win32" && !command.endsWith(".exe")) {
    return `${command}.exe`;
  }
  return command;
}

/**
 * Find executable in PATH
 */
export function findExecutable(command: string): string | null {
  const execName = getExecutableName(command);
  
  if (platform() === "win32") {
    try {
      const result = execFileSync("where", [execName], { encoding: "utf-8" });
      return result.trim().split("\n")[0];
    } catch {
      return null;
    }
  } else {
    try {
      const result = execFileSync("which", [execName], { encoding: "utf-8" });
      return result.trim();
    } catch {
      return null;
    }
  }
}

/**
 * Execute command with cross-platform support
 */
export function execFileSyncCrossPlatform(
  command: string,
  args: string[],
  options?: Parameters<typeof execFileSync>[2]
): ReturnType<typeof execFileSync> {
  const executable = findExecutable(command);
  if (!executable) {
    throw new Error(`Command '${command}' not found in PATH`);
  }
  return execFileSync(executable, args, options);
}

/**
 * Spawn command with cross-platform support
 */
export function spawnSyncCrossPlatform(
  command: string,
  args: string[],
  options?: Parameters<typeof spawnSync>[2]
) {
  const executable = findExecutable(command);
  if (!executable) {
    throw new Error(`Command '${command}' not found in PATH`);
  }
  return spawnSync(executable, args, options);
}