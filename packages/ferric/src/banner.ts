import chalk from "chalk";

const LINES = [
  // Pagga on https://www.asciiart.eu/text-to-ascii-art
  // Box elements from https://www.compart.com/en/unicode/block/U+2500
  "╭─────────────────────────╮",
  "│░█▀▀░█▀▀░█▀▄░█▀▄░▀█▀░█▀▀░│",
  "│░█▀▀░█▀▀░█▀▄░█▀▄░░█░░█░░░│",
  "│░▀░░░▀▀▀░▀░▀░▀░▀░▀▀▀░▀▀▀░│",
  "╰─────────────────────────╯",
];

export function printBanner() {
  console.log(
    LINES.map((line, lineNumber, lines) => {
      const ratio = lineNumber / lines.length;
      return chalk.rgb(Math.round(250 - 100 * ratio), 0, 0)(line);
    }).join("\n")
  );
}
