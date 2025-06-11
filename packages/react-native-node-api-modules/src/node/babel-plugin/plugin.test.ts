import assert from "node:assert/strict";
import { describe, it } from "node:test";
import path from "node:path";

import { transformFileSync } from "@babel/core";

import { plugin, findNodeAddonForBindings, type PluginOptions } from "./plugin.js";
import { setupTempDirectory } from "../test-utils.js";

describe("plugin", () => {
  describe("transforms require calls, regardless", () => {
    const EXPECTED_PKG_NAME = "my-package";

    type TestCaseParams = {
      resolvedPath?: string;
      originalPath: string;
      inputFile: string;
    };

    ([
      { resolvedPath: "./addon-1.node", originalPath: "./addon-1.node", inputFile: "./addon-1.js" },
      { resolvedPath: "./addon-2.node", originalPath: "./addon-2.node", inputFile: "./addon-2.js" },
      { resolvedPath: "./addon-1.node", originalPath: "../addon-1.node", inputFile: "./sub-directory/addon-1.js" },
      { resolvedPath: "./addon-2.node", originalPath: "../addon-2.node", inputFile: "./sub-directory-3/addon-outside.js" },
      { resolvedPath: "./addon-1.node", originalPath: "addon-1", inputFile: "./addon-1-bindings.js" },
      { resolvedPath: undefined, originalPath: "./addon-1.js", inputFile: "./require-js-file.js" },
    ] as TestCaseParams[]).forEach(({ resolvedPath, originalPath, inputFile }) => {
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
    });
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

describe("findNodeAddonForBindings()", () => {
  it("should look for addons in common paths", (context) => {
    // Arrange
    const expectedPaths = {
      "addon_1": "addon_1.node",
      "addon_2": "build/Release/addon_2.node",
      "addon_3": "build/Debug/addon_3.node",
      "addon_4": "build/addon_4.node",
      "addon_5": "out/Release/addon_5.node",
      "addon_6": "out/Debug/addon_6.node",
      "addon_7": "Release/addon_7.node",
      "addon_8": "Debug/addon_8.node",
    };
    const tempDirectoryPath = setupTempDirectory(context,
      Object.fromEntries(
        Object.values(expectedPaths)
        .map((p) => [p, "// This is supposed to be a binary file"])
      )
    );
    // Act & Assert
    Object.entries(expectedPaths).forEach(([name, relPath]) => {
      const expectedPath = path.join(tempDirectoryPath, relPath);
      const actualPath = findNodeAddonForBindings(name, tempDirectoryPath);
      assert.equal(actualPath, expectedPath);
    });
  });
});
