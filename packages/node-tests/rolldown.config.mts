import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { defineConfig, type RolldownOptions } from "rolldown";
import { aliasPlugin, replacePlugin } from "rolldown/experimental";

function readGypTargetNames(gypFilePath: string): string[] {
  const contents = JSON.parse(fs.readFileSync(gypFilePath, "utf-8")) as unknown;
  assert(
    typeof contents === "object" && contents !== null,
    "Expected gyp file to contain a valid JSON object",
  );
  assert("targets" in contents, "Expected targets in gyp file");
  const { targets } = contents;
  assert(Array.isArray(targets), "Expected targets to be an array");
  return targets.map(({ target_name }) => {
    assert(
      typeof target_name === "string",
      "Expected target_name to be a string",
    );
    return target_name;
  });
}

function testSuiteConfig(suitePath: string): RolldownOptions[] {
  const testFiles = fs.globSync("*.js", {
    cwd: suitePath,
    exclude: ["*.bundle.js"],
  });
  const gypFilePath = path.join(suitePath, "binding.gyp");
  const targetNames = readGypTargetNames(gypFilePath);
  return testFiles.map((testFile) => ({
    input: path.join(suitePath, testFile),
    output: {
      file: path.join(suitePath, path.basename(testFile, ".js") + ".bundle.js"),
    },
    resolve: {
      conditionNames: ["react-native"],
    },
    polyfillRequire: false,
    plugins: [
      // Replace dynamic require statements for addon targets to allow the babel plugin to handle them correctly
      replacePlugin(
        Object.fromEntries(
          targetNames.map((targetName) => [
            `require(\`./build/\${common.buildType}/${targetName}\`)`,
            `require("./build/Release/${targetName}")`,
          ]),
        ),
        {
          delimiters: ["", ""],
        },
      ),
      replacePlugin(
        Object.fromEntries(
          targetNames.map((targetName) => [
            // Replace "__require" statement with a regular "require" to allow Metro to resolve it
            `__require("./build/Release/${targetName}")`,
            `require("./build/Release/${targetName}")`,
          ]),
        ),
        {
          delimiters: ["", ""],
        },
      ),
      aliasPlugin({
        entries: [
          {
            find: "../../common",
            replacement: "./common.ts",
          },
        ],
      }),
    ],
    external: targetNames.map((targetName) => `./build/Release/${targetName}`),
  }));
}

const suitePaths = fs
  .globSync("tests/*/*", {
    cwd: import.meta.dirname,
    withFileTypes: true,
  })
  .filter((dirent) => dirent.isDirectory())
  .map((dirent) =>
    path.join(
      path.relative(import.meta.dirname, dirent.parentPath),
      dirent.name,
    ),
  );

export default defineConfig(suitePaths.flatMap(testSuiteConfig));
