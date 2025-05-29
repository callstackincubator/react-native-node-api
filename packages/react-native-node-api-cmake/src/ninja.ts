import chalk from "chalk";
import cp from "node:child_process";

export function getNinjaVersion(): string | undefined {
  try {
    const ninjaVersion = cp
      .execSync("ninja --version", {
        encoding: "utf-8",
        stdio: "pipe",
      })
      .trim();
    return ninjaVersion;
  } catch {
    return undefined;
  }
}

let ninjaAvailable: boolean | undefined;

export function isNinjaAvailable(log = true): boolean {
  if (typeof ninjaAvailable === "boolean") {
    return ninjaAvailable;
  }

  const ninjaVersion = getNinjaVersion();
  ninjaAvailable = typeof ninjaVersion === "string";

  if (log && ninjaAvailable) {
    console.log(chalk.dim(`Using Ninja ${ninjaVersion} for Android builds`));
  } else if (log && !ninjaAvailable) {
    console.log(
      `Using Unix Makefiles as fallback, as Ninja was not found.\n${chalk.dim(
        "Install Ninja for faster builds."
      )}`
    );
  }

  return ninjaAvailable;
}
