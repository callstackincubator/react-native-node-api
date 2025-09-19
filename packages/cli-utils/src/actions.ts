import { SpawnFailure } from "bufout";
import chalk from "chalk";

import { UsageError } from "./errors.js";

export function wrapAction<Args extends unknown[]>(
  action: (...args: Args) => void | Promise<void>,
): (...args: Args) => Promise<void> {
  return async (...args: Args) => {
    try {
      await action(...args);
    } catch (error) {
      process.exitCode = 1;
      if (error instanceof SpawnFailure) {
        error.flushOutput("both");
      }
      if (error instanceof UsageError || error instanceof SpawnFailure) {
        console.error(chalk.red("ERROR"), error.message);
        if (error.cause instanceof Error) {
          console.error(chalk.red("CAUSE"), error.cause.message);
        }
        if (error instanceof UsageError && error.fix) {
          console.error(
            chalk.green("FIX"),
            error.fix.command
              ? chalk.dim("Run: ") + error.fix.command
              : error.fix.instructions,
          );
        }
      } else {
        throw error;
      }
    }
  };
}
