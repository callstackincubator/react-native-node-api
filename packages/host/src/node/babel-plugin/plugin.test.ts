import assert from "node:assert/strict";
import { describe, it, TestContext } from "node:test";
import path from "node:path";

import { transformFileSync } from "@babel/core";

import { plugin, PluginOptions } from "./plugin.js";
import { setupTempDirectory } from "../test-utils.js";

type TestTransformationOptions = {
  files: Record<string, string>;
  inputFilePath: string;
  assertion: (code: string) => void;
  options?: PluginOptions;
};

function itTransforms(
  title: string,
  { files, inputFilePath, assertion, options = {} }: TestTransformationOptions
) {
  it(`transforms ${title}`, (context: TestContext) => {
    const tempDirectoryPath = setupTempDirectory(context, files);
    const result = transformFileSync(
      path.join(tempDirectoryPath, inputFilePath),
      { plugins: [[plugin, options]] }
    );
    assert(result, "Expected transformation to produce a result");
    const { code } = result;
    assert(code, "Expected transformation to produce code");
    assert(assertion(code), `Unexpected code: ${code}`);
  });
}

describe("plugin", () => {
  describe("transforming require(...) calls", () => {
    itTransforms("a simple call", {
      files: {
        "package.json": `{ "name": "my-package" }`,
        "my-addon.apple.node/my-addon.node":
          "// This is supposed to be a binary file",
        "index.js": `
          const addon = require('./my-addon.node');
          console.log(addon);
        `,
      },
      inputFilePath: "index.js",
      assertion: (code) =>
        code.includes(`requireNodeAddon("my-package--my-addon")`),
    });

    itTransforms("from sub-directory", {
      files: {
        "package.json": `{ "name": "my-package" }`,
        "my-addon.apple.node/my-addon.node":
          "// This is supposed to be a binary file",
        "sub-dir/index.js": `
          const addon = require('../my-addon.node');
          console.log(addon);
        `,
      },
      inputFilePath: "sub-dir/index.js",
      assertion: (code) =>
        code.includes(`requireNodeAddon("my-package--my-addon")`),
    });

    itTransforms("addon in sub-directory", {
      files: {
        "package.json": `{ "name": "my-package" }`,
        "sub-dir/my-addon.apple.node/my-addon.node":
          "// This is supposed to be a binary file",
        "index.js": `
          const addon = require('./sub-dir/my-addon.node');
          console.log(addon);
        `,
      },
      inputFilePath: "index.js",
      assertion: (code) =>
        code.includes(`requireNodeAddon("my-package--sub-dir-my-addon")`),
    });

    itTransforms(
      "and returns package name when passed stripPathSuffix option",
      {
        files: {
          "package.json": `{ "name": "my-package" }`,
          "sub-dir/my-addon.apple.node/my-addon.node":
            "// This is supposed to be a binary file",
          "index.js": `
          const addon = require('./sub-dir/my-addon.node');
          console.log(addon);
        `,
        },
        inputFilePath: "index.js",
        options: { stripPathSuffix: true },
        assertion: (code) => code.includes(`requireNodeAddon("my-package")`),
      }
    );

    itTransforms("and does not touch required JS files", {
      files: {
        "package.json": `{ "name": "my-package" }`,
        // TODO: Add a ./my-addon.node to make this test complete
        "my-addon.js": "// Some JS file",
        "index.js": `
          const addon = require('./my-addon');
          console.log(addon);
        `,
      },
      inputFilePath: "index.js",
      options: { stripPathSuffix: true },
      assertion: (code) => !code.includes("requireNodeAddon"),
    });
  });

  describe("transforming require('binding')(...) calls", () => {
    itTransforms("a simple call", {
      files: {
        "package.json": `{ "name": "my-package" }`,
        "my-addon.apple.node/my-addon.node":
          "// This is supposed to be a binary file",
        "index.js": `
          const addon = require('bindings')('my-addon');
          console.log(addon);
        `,
      },
      inputFilePath: "index.js",
      assertion: (code) =>
        code.includes(`requireNodeAddon("my-package--my-addon")`),
    });

    describe("in 'build/Release'", () => {
      itTransforms("a nested addon", {
        files: {
          "package.json": `{ "name": "my-package" }`,
          "build/Release/my-addon.apple.node/my-addon.node":
            "// This is supposed to be a binary file",
          "index.js": `
            const addon = require('bindings')('my-addon');
            console.log(addon);
          `,
        },
        inputFilePath: "index.js",
        assertion: (code) =>
          code.includes(
            `requireNodeAddon("my-package--build-Release-my-addon")`
          ),
      });

      itTransforms("strips path suffix when passing stripPathSuffix option", {
        files: {
          "package.json": `{ "name": "my-package" }`,
          "build/Release/my-addon.apple.node/my-addon.node":
            "// This is supposed to be a binary file",
          "index.js": `
            const addon = require('bindings')('my-addon');
            console.log(addon);
          `,
        },
        inputFilePath: "index.js",
        options: { stripPathSuffix: true },
        assertion: (code) => code.includes(`requireNodeAddon("my-package")`),
      });
    });
  });
});
