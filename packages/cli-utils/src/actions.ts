import { SpawnFailure } from "bufout";
import chalk from "chalk";
import * as commander from "@commander-js/extra-typings";

import { UsageError } from "./errors.js";

export function wrapAction<
  Args extends unknown[],
  Opts extends commander.OptionValues,
  GlobalOpts extends commander.OptionValues,
  Command extends commander.Command<Args, Opts, GlobalOpts>,
  ActionArgs extends unknown[],
>(fn: (this: Command, ...args: ActionArgs) => void | Promise<void>) {
  return async function (this: Command, ...args: ActionArgs) {
    try {
      await fn.call(this, ...args);
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
