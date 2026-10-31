/**
 * Placeholder for a reference to the directory holding the binding.gyp (and the generated CMakeLists.txt).
 * Substituted for a CMake variable reference only after escaping, so the reference survives it.
 */
export const MODULE_ROOT_DIR_PLACEHOLDER = "\u{E000}";
const MODULE_ROOT_DIR_REFERENCE = "${CMAKE_CURRENT_SOURCE_DIR}";

const SHELL_BLANKS = [" ", "\t", "\n"];
const DOUBLE_QUOTE_ESCAPABLE = ["$", "`", '"', "\\", "\n"];

/**
 * Splits a string into words, the way a POSIX shell splits a command line (without performing any expansions).
 */
export function splitShellWords(input: string): string[] {
  const words: string[] = [];
  let word: string | null = null;
  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (SHELL_BLANKS.includes(char)) {
      if (word !== null) {
        words.push(word);
        word = null;
      }
    } else if (char === "\\") {
      i++;
      if (input[i] !== "\n") {
        word = (word ?? "") + (i < input.length ? input[i] : "\\");
      }
    } else if (char === "'") {
      const end = input.indexOf("'", i + 1);
      if (end === -1) {
        throw new Error(`Unterminated single quote in: ${input}`);
      }
      word = (word ?? "") + input.slice(i + 1, end);
      i = end;
    } else if (char === '"') {
      word = word ?? "";
      for (i++; input[i] !== '"'; i++) {
        if (i >= input.length) {
          throw new Error(`Unterminated double quote in: ${input}`);
        }
        if (
          input[i] === "\\" &&
          DOUBLE_QUOTE_ESCAPABLE.includes(input[i + 1])
        ) {
          i++;
          if (input[i] === "\n") {
            continue;
          }
        }
        word += input[i];
      }
    } else {
      word = (word ?? "") + char;
    }
  }
  if (word !== null) {
    words.push(word);
  }
  return words;
}

/**
 * Port of gyp's make generator `QuoteIfNecessary`
 */
function quoteIfNecessary(flag: string) {
  return flag.includes('"') ? `"${flag.replaceAll('"', '\\"')}"` : flag;
}

/**
 * Resolves gyp `cflags` or `ldflags` into the arguments the compiler or linker receives from gyp's make generator:
 * Each flag is quoted if it contains a `"`, Make unescapes `$$` and the shell splits the result into words.
 */
export function gypFlagsToArguments(flags: string[]): string[] {
  const commandLine = flags
    .map(quoteIfNecessary)
    .join(" ")
    .replaceAll("$$", "$");
  return splitShellWords(commandLine);
}

/**
 * Escapes a single argument for the parser CMake applies to `SHELL:` options
 */
function escapeShellWord(word: string) {
  return word.replace(/[\\'" \t\n]/g, "\\$&");
}

/**
 * Builds a quoted CMake argument passing all arguments as a single `SHELL:` option.
 * Grouping them prevents CMake from de-duplicating repeated arguments, such as `-include a.h -include b.h`.
 */
export function toCmakeShellOption(args: string[]) {
  const escaped = args
    // The parser doesn't produce empty arguments
    .filter(Boolean)
    .map(escapeShellWord)
    .join(" ")
    .replace(/[\\"$]/g, "\\$&")
    // Prevents splitting when CMake expands the argument as a list
    .replaceAll(";", "\\\\;")
    .replaceAll(
      MODULE_ROOT_DIR_PLACEHOLDER,
      `\\"${MODULE_ROOT_DIR_REFERENCE}\\"`,
    );
  return `"SHELL:${escaped}"`;
}

export function resolveModuleRootDir(value: string) {
  return value.replaceAll(
    MODULE_ROOT_DIR_PLACEHOLDER,
    MODULE_ROOT_DIR_REFERENCE,
  );
}
