import chalk from "chalk";
import path from "node:path";

export function prettyPath(p: string) {
  return chalk.dim(
    path.relative(process.cwd(), p) || chalk.italic("current directory"),
  );
}
