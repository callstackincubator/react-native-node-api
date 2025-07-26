import assert from "node:assert/strict";
import { describe, it, TestContext } from "node:test";
import path from "node:path";

import { transformFileSync } from "@babel/core";

import { plugin, PluginOptions } from "./plugin.js";
import { setupTempDirectory } from "../test-utils.js";

type TestTransformationOptions = {
  files: Record<string, string>;
  inputFilePath: string;
  assertion(code: string): void;
  options?: PluginOptions;
};

function itTransforms(
  title: string,
  { files, inputFilePath, assertion, options = {} }: TestTransformationOptions,
) {
  it(`transforms ${title}`, (context: TestContext) => {
    const tempDirectoryPath = setupTempDirectory(context, files);
    const result = transformFileSync(
      path.join(tempDirectoryPath, inputFilePath),
      { plugins: [[plugin, options]] },
    );
    assert(result, "Expected transformation to produce a result");
    const { code } = result;
    assert(code, "Expected transformation to produce code");
    assertion(code);
  });
}

function assertIncludes(needle: string, { reverse = false } = {}) {
  return (code: string) => {
    if (reverse) {
      assert(
        !code.includes(needle),
        `Expected code to not include: ${needle}, got ${code}`,
      );
    } else {
      assert(
        code.includes(needle),
        `Expected code to include: ${needle}, got ${code}`,
      );
    }
  };
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
      assertion: assertIncludes(`requireNodeAddon("my-package--my-addon")`),
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
      assertion: assertIncludes(`requireNodeAddon("my-package--my-addon")`),
    });

    describe("in 'sub-dir'", () => {
      itTransforms("a nested addon (keeping suffix)", {
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
        options: { pathSuffix: "keep" },
        assertion: assertIncludes(
          `requireNodeAddon("my-package--sub-dir-my-addon")`,
        ),
      });

      itTransforms("a nested addon (stripping suffix)", {
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
        options: { pathSuffix: "strip" },
        assertion: assertIncludes(`requireNodeAddon("my-package--my-addon")`),
      });

      itTransforms("a nested addon (omitting suffix)", {
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
        options: { pathSuffix: "omit" },
        assertion: assertIncludes(`requireNodeAddon("my-package")`),
      });
    });

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
      assertion: assertIncludes("requireNodeAddon", { reverse: true }),
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
      assertion: assertIncludes(`requireNodeAddon("my-package--my-addon")`),
    });

    describe("in 'build/Release'", () => {
      itTransforms("a nested addon (keeping suffix)", {
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
        options: { pathSuffix: "keep" },
        assertion: assertIncludes(
          `requireNodeAddon("my-package--build-Release-my-addon")`,
        ),
      });

      itTransforms("a nested addon (stripping suffix)", {
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
        options: { pathSuffix: "strip" },
        assertion: assertIncludes(`requireNodeAddon("my-package--my-addon")`),
      });

      itTransforms("a nested addon (omitting suffix)", {
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
        options: { pathSuffix: "omit" },
        assertion: assertIncludes(`requireNodeAddon("my-package")`),
      });
    });
  });
});
