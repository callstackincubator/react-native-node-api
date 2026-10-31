import assert from "node:assert/strict";
import cp from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";

import * as cmakeFileApi from "cmake-file-api";

import { splitShellWords } from "./flags.js";
import type { GypTarget } from "./gyp.js";
import { bindingGypToCmakeLists } from "./transformer.js";

type FlagsCase = {
  cflags?: string[];
  ldflags?: string[];
  compile?: (sourcePath: string) => string[];
  link?: string[];
};

const CASES: Record<string, FlagsCase> = {
  repeated_include: {
    cflags: ["-include", "a.h", "-include", "b.h"],
    compile: () => ["-include", "a.h", "-include", "b.h"],
  },
  repeated_xclang: {
    cflags: ["-Xclang", "-fno-pch-timestamp", "-Xclang", "-fno-validate-pch"],
    compile: () => [
      "-Xclang",
      "-fno-pch-timestamp",
      "-Xclang",
      "-fno-validate-pch",
    ],
  },
  expanded_include: {
    cflags: ["<!@echo -include a.h -include b.h"],
    compile: () => ["-include", "a.h", "-include", "b.h"],
  },
  multi_word: {
    cflags: ["-include a.h"],
    compile: () => ["-include", "a.h"],
  },
  special_characters: {
    cflags: ["-DX=a#b", "-DY=a;b", "-DZ=(1)", '-DGREETING="hi"'],
    compile: () => ["-DX=a#b", "-DY=a;b", "-DZ=(1)", '-DGREETING="hi"'],
  },
  in_string_expansions: {
    cflags: ["-I<(module_root_dir)/inc", "-I<!(echo some)/inc"],
    compile: (sourcePath) => [`-I${sourcePath}/inc`, "-Isome/inc"],
  },
  repeated_xlinker: {
    ldflags: ["-Xlinker", "-rpath", "-Xlinker", "/a/b"],
    link: ["-Xlinker", "-rpath", "-Xlinker", "/a/b"],
  },
  expanded_framework: {
    ldflags: ["<!@echo -framework CoreFoundation -framework Foundation"],
    link: ["-framework", "CoreFoundation", "-framework", "Foundation"],
  },
  escaped_dollar: {
    ldflags: ["-Wl,-rpath,'$$ORIGIN'"],
    link: ["-Wl,-rpath,$ORIGIN"],
  },
};

/**
 * Decodes command fragments, written for the shell and build tool of a Makefile or Ninja generator
 */
function decodeFragments(fragments: { fragment: string }[] = []) {
  return fragments.flatMap(({ fragment }) =>
    splitShellWords(fragment.replaceAll("$$", "$")),
  );
}

function assertContainsSequence(actual: string[], expected: string[]) {
  const found = actual.some((_, start) =>
    expected.every((value, offset) => actual[start + offset] === value),
  );
  assert(
    found,
    `Expected ${JSON.stringify(actual)} to contain ${JSON.stringify(expected)}`,
  );
}

function hasCmake() {
  try {
    cp.execFileSync("cmake", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

describe(
  "bindingGypToCmakeLists configured by CMake",
  { skip: !hasCmake() && "CMake is not available" },
  () => {
    // A space in the path verifies quoting of the module_root_dir expansion
    let tempPath: string;
    let sourcePath: string;
    let targets: Awaited<
      ReturnType<typeof cmakeFileApi.readCurrentTargetsDeep>
    >;

    before(async () => {
      tempPath = fs.realpathSync(
        fs.mkdtempSync(path.join(os.tmpdir(), "gyp-to-cmake-")),
      );
      sourcePath = path.join(tempPath, "source with space");
      const buildPath = path.join(tempPath, "build");
      fs.mkdirSync(sourcePath);
      fs.writeFileSync(path.join(sourcePath, "addon.c"), "");

      const gypTargets = Object.entries(CASES).map(
        ([name, { cflags, ldflags }]): GypTarget => ({
          target_name: name,
          sources: ["addon.c"],
          cflags,
          ldflags,
        }),
      );
      fs.writeFileSync(
        path.join(sourcePath, "CMakeLists.txt"),
        bindingGypToCmakeLists({
          projectName: "flags",
          gyp: { targets: gypTargets },
          appleFramework: false,
        }),
      );

      await cmakeFileApi.createSharedStatelessQuery(
        buildPath,
        "codemodel",
        "2",
      );
      cp.execFileSync("cmake", ["-S", sourcePath, "-B", buildPath], {
        stdio: "pipe",
      });
      targets = await cmakeFileApi.readCurrentTargetsDeep(
        buildPath,
        "Debug",
        "2.0",
      );
    });

    after(() => {
      fs.rmSync(tempPath, { recursive: true, force: true });
    });

    function getTargetArguments(name: string) {
      const target = targets.find((target) => target.name === name);
      assert(target, `Expected a "${name}" target`);
      return {
        compile: decodeFragments(
          target.compileGroups?.flatMap(
            ({ compileCommandFragments = [] }) => compileCommandFragments,
          ),
        ),
        link: decodeFragments(
          target.link?.commandFragments?.filter(({ role }) => role === "flags"),
        ),
      };
    }

    const appliesFlags =
      process.platform !== "darwin" && process.platform !== "win32";

    for (const [name, { compile, link }] of Object.entries(CASES)) {
      if (appliesFlags) {
        it(`resolves ${name} like gyp does`, () => {
          const actual = getTargetArguments(name);
          if (compile) {
            assertContainsSequence(actual.compile, compile(sourcePath));
          }
          if (link) {
            assertContainsSequence(actual.link, link);
          }
        });
      } else {
        it(`omits ${name}, as gyp does on ${process.platform}`, () => {
          const target = targets.find((target) => target.name === name);
          assert(target, `Expected a "${name}" target`);
          const fragments = JSON.stringify([
            target.compileGroups,
            target.link?.commandFragments,
          ]);
          for (const value of [
            ...(compile?.(sourcePath) ?? []),
            ...(link ?? []),
          ]) {
            if (value.startsWith("-") && value.length > 2) {
              assert(
                !fragments.includes(value),
                `Expected no "${value}" in ${fragments}`,
              );
            }
          }
        });
      }
    }
  },
);
