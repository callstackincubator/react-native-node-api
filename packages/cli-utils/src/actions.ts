import { SpawnFailure } from "bufout";
import chalk from "chalk";
import * as commander from "@commander-js/extra-typings";

import { UsageError } from "./errors.js";

function wrapAction<Command extends commander.Command, Args extends unknown[]>(
  fn: (this: Command, ...args: Args) => void | Promise<void>,
) {
  return async function (this: Command, ...args: Args) {
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

import { Command } from "@commander-js/extra-typings";

// Patch Command to wrap all actions with our error handler

// eslint-disable-next-line @typescript-eslint/unbound-method
const originalAction = Command.prototype.action;

Command.prototype.action = function action<Command extends commander.Command>(
  this: Command,
  fn: Parameters<typeof originalAction>[0],
) {
  return originalAction.call(this, wrapAction(fn));
};
