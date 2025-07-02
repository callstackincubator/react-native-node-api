import assert from "node:assert/strict";
import { describe, it } from "node:test";
import path from "node:path";

import { transformFileSync } from "@babel/core";

import { plugin } from "./plugin.js";
import { setupTempDirectory } from "../test-utils.js";

describe("plugin", () => {
  describe("transforms require calls, regardless", () => {
    const EXPECTED_PKG_NAME = "my-package";

    type TestCaseParams = {
      resolvedPath?: string;
      originalPath: string;
      inputFile: string;
    };

    const testCases: ReadonlyArray<TestCaseParams> = [
      { resolvedPath: "./addon-1.node", originalPath: "./addon-1.node", inputFile: "./addon-1.js" },
      { resolvedPath: "./addon-2.node", originalPath: "./addon-2.node", inputFile: "./addon-2.js" },
      { resolvedPath: "./addon-1.node", originalPath: "../addon-1.node", inputFile: "./sub-directory/addon-1.js" },
      { resolvedPath: "./addon-2.node", originalPath: "../addon-2.node", inputFile: "./sub-directory-3/addon-outside.js" },
      { resolvedPath: "./addon-1.node", originalPath: "addon-1", inputFile: "./addon-1-bindings.js" },
      { resolvedPath: undefined, originalPath: "./addon-1.js", inputFile: "./require-js-file.js" },
    ];
    for (const { resolvedPath, originalPath, inputFile } of testCases) {
      const expectedMessage = resolvedPath
        ? `transform to requireNodeAddon() with "${resolvedPath}"`
        : "NOT transform to requireNodeAddon()";

      it(`${inputFile} should ${expectedMessage}`, (context) => {
        const tempDirectoryPath = setupTempDirectory(context, {
          "package.json": `{ "name": "${EXPECTED_PKG_NAME}" }`,
          "addon-1.node":
              "// This is supposed to be a binary file",
          "addon-2.node":
              "// This is supposed to be a binary file",
          "addon-1.js": `
            const addon = require('./addon-1.node');
            console.log(addon);
          `,
          "addon-2.js": `
            const addon = require('./addon-2.node');
            console.log(addon);
          `,
          "sub-directory/addon-1.js": `
            const addon = require('../addon-1.node');
            console.log(addon);
          `,
          "sub-directory-3/package.json": `{ "name": "sub-package" }`,
          "sub-directory-3/addon-outside.js": `
            const addon = require('../addon-2.node');
            console.log(addon);
          `,
          "addon-1-bindings.js": `
            const addon = require('bindings')('addon-1');
            console.log(addon);
          `,
          "require-js-file.js": `
            const addon = require('./addon-1.js');
            console.log(addon);
          `,
        });
        const result = transformFileSync(
          path.join(tempDirectoryPath, inputFile),
          { plugins: [[plugin, {}]] }
        );
        assert(result);
        const { code } = result;
        if (!resolvedPath) {
          assert(
              code && !code.includes(`requireNodeAddon`),
              `Unexpected code: ${code}`
          );
        } else {
          assert(
              code && code.includes(`requireNodeAddon("${resolvedPath}", "${EXPECTED_PKG_NAME}", "${originalPath}")`),
              `Unexpected code: ${code}`
          );
        }
      });
    }
  });

  it("transforms require calls to packages with native entry point", (context) => {
    const tempDirectoryPath = setupTempDirectory(context, {
      "node_modules/@scope/my-package/package.json":
        `{ "name": "@scope/my-package", "main": "./build/Release/addon-1.node" }`,
      "node_modules/@scope/my-package/build/Release/addon-1.node":
        "// This is supposed to be a binary file",
      "package.json": `{ "name": "my-consumer" }`,
      "test.js": `
        const addon = require('@scope/my-package');
        console.log(addon);
      `
    });

    const EXPECTED_PKG_NAME = "@scope/my-package";
    const EXPECTED_PATH = "./build/Release/addon-1.node";

    {
      const result = transformFileSync(
        path.join(tempDirectoryPath, "test.js"),
        { plugins: [[plugin]] }
      );
      assert(result);
      const { code } = result;
      assert(
        code && code.includes(`requireNodeAddon("${EXPECTED_PATH}", "${EXPECTED_PKG_NAME}", "${EXPECTED_PKG_NAME}")`),
        `Unexpected code: ${code}`
      );
    };
  });
});
