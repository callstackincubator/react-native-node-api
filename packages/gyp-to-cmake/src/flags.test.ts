import assert from "node:assert";
import { describe, it } from "node:test";

import {
  gypFlagsToArguments,
  splitShellWords,
  toCmakeShellOption,
} from "./flags.js";

describe("splitShellWords", () => {
  for (const [input, expected] of [
    ["a b\tc\nd", ["a", "b", "c", "d"]],
    ["  a  ", ["a"]],
    ["'a b' c", ["a b", "c"]],
    ['"a b" c', ["a b", "c"]],
    ["a\\ b", ["a b"]],
    ["-Wl,-rpath,'$ORIGIN'", ["-Wl,-rpath,$ORIGIN"]],
    ['"a\\"b\\\\c\\d"', ['a"b\\c\\d']],
    ["'a\\b'", ["a\\b"]],
    ["a\\\nb", ["ab"]],
    ["''", [""]],
  ] as const) {
    it(`splits ${JSON.stringify(input)}`, () => {
      assert.deepStrictEqual(splitShellWords(input), expected);
    });
  }

  it("throws on unterminated quotes", () => {
    assert.throws(() => splitShellWords("'a"), /Unterminated single quote/);
    assert.throws(() => splitShellWords('"a'), /Unterminated double quote/);
  });
});

describe("gypFlagsToArguments", () => {
  for (const [flags, expected] of [
    [["-include a.h"], ["-include", "a.h"]],
    [["-DNAME=value with space"], ["-DNAME=value", "with", "space"]],
    [["-DNAME='value with space'"], ["-DNAME=value with space"]],
    [['-DGREETING="hi"'], ['-DGREETING="hi"']],
    [['-Wl,-rpath,"/a b"'], ['-Wl,-rpath,"/a b"']],
    [["-Wl,-rpath,'$$ORIGIN'"], ["-Wl,-rpath,$ORIGIN"]],
    [
      ["-DX=a#b", "-DX=a;b", "-DX=(1)"],
      ["-DX=a#b", "-DX=a;b", "-DX=(1)"],
    ],
  ] as const) {
    it(`resolves ${JSON.stringify(flags)}`, () => {
      assert.deepStrictEqual(gypFlagsToArguments([...flags]), expected);
    });
  }
});

describe("toCmakeShellOption", () => {
  for (const [args, expected] of [
    [["-include", "a.h"], String.raw`"SHELL:-include a.h"`],
    [["-DS=a b"], String.raw`"SHELL:-DS=a\\ b"`],
    [['-DQ="hi"'], String.raw`"SHELL:-DQ=\\\"hi\\\""`],
    [["-DX=a;b"], String.raw`"SHELL:-DX=a\\;b"`],
    [["-DX=$ORIGIN"], String.raw`"SHELL:-DX=\$ORIGIN"`],
    [["-DX=${Y}"], String.raw`"SHELL:-DX=\${Y}"`],
    [["a", "", "b"], String.raw`"SHELL:a b"`],
  ] as const) {
    it(`quotes ${JSON.stringify(args)}`, () => {
      assert.strictEqual(toCmakeShellOption([...args]), expected);
    });
  }
});
