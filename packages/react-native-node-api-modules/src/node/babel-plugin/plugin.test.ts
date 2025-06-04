import assert from "node:assert/strict";
import { describe, it } from "node:test";
import path from "node:path";

import { transformFileSync } from "@babel/core";

import { plugin, type PluginOptions } from "./plugin.js";
import { setupTempDirectory } from "../test-utils.js";

describe("plugin", () => {
  it("transforms require calls, regardless", (context) => {
    const tempDirectoryPath = setupTempDirectory(context, {
      "package.json": `{ "name": "my-package" }`,
      "addon-1.apple.node/addon-1.node":
        "// This is supposed to be a binary file",
      "addon-2.apple.node/addon-2.node":
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
      "addon-1-bindings.js": `
        const addon = require('bindings')('addon-1');
        console.log(addon);
      `,
      "require-js-file.js": `
        const addon = require('./addon-1.js');
        console.log(addon);
      `,
    });

    const EXPECTED_PKG_NAME = "my-package";

    type TestCaseParams = {
      resolvedPath: string;
      originalPath: string;
      inputFile: string;
      options?: PluginOptions;
    };
    const runTestCase = ({
      resolvedPath,
      originalPath,
      inputFile,
      options,
    }: TestCaseParams) => {
      const result = transformFileSync(
        path.join(tempDirectoryPath, inputFile),
        { plugins: [[plugin, options]] }
      );
      assert(result);
      const { code } = result;
      assert(
        code && code.includes(`requireNodeAddon("${resolvedPath}", "${EXPECTED_PKG_NAME}", "${originalPath}")`),
        `Unexpected code: ${code}`
      );
    };

    runTestCase({ resolvedPath: "./addon-1.node", originalPath: "./addon-1.node", inputFile: "./addon-1.js" });
    runTestCase({ resolvedPath: "./addon-2.node", originalPath: "./addon-2.node", inputFile: "./addon-2.js", options: { naming: "hash" } });
    runTestCase({ resolvedPath: "./addon-1.node", originalPath: "../addon-1.node", inputFile: "./sub-directory/addon-1.js", options: { naming: "hash" } });
    runTestCase({ resolvedPath: "./addon-1.node", originalPath: "addon-1", inputFile: "./addon-1-bindings.js", options: { naming: "hash" } });

    {
      const result = transformFileSync(
        path.join(tempDirectoryPath, "./require-js-file.js"),
        { plugins: [[plugin, { naming: "hash" }]] }
      );
      assert(result);
      const { code } = result;
      assert(
        code && !code.includes(`requireNodeAddon`),
        `Unexpected code: ${code}`
      );
    }
  });
});
