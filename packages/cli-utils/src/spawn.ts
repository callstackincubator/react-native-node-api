import * as bufout from "bufout";
import chalk from "chalk";

export { SpawnFailure } from "bufout";

import { verbose } from "./logging.js";

export function spawn(
  command: string,
  args: string[],
  options: bufout.SpawnOptions = {},
) {
  if (verbose) {
    const coloredArgs = args.map((arg) => {
      if (arg.startsWith("-")) {
        return arg;
      } else {
        // Use regular expression with named groups to split KEY=VALUE
        const match = arg.match(/^(?<key>[^=]+)=(?<value>.+)$/);
        if (match && match.groups) {
          const { key, value } = match.groups;
          return `${chalk.green(key)}${chalk.dim("=" + value)}`;
        } else {
          return chalk.dim(arg);
        }
      }
    });
    console.log(`➤ Spawning ${command} ${coloredArgs.join(" ")}`);
  }
  return bufout.spawn(command, args, options);
}
