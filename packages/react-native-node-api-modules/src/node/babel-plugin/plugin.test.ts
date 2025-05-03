import assert from "node:assert/strict";
import { describe, it } from "node:test";
import path from "node:path";

import { transformFileSync } from "@babel/core";

import { plugin } from "./plugin.js";
import { setupTempDirectory } from "../test-utils.js";
import { getLibraryName } from "../path-utils.js";

describe("plugin", () => {
  it("transforms require calls, regardless", (context) => {
    const tempDirectoryPath = setupTempDirectory(context, {
      "package.json": `{ "name": "my-package" }`,
      "addon-1.xcframework/addon-1.node":
        "// This is supposed to be a binary file",
      "addon-2.xcframework/addon-2.node":
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

    const ADDON_1_REQUIRE_ARG = getLibraryName(
      path.join(tempDirectoryPath, "addon-1"),
      { stripPathSuffix: false }
    );
    const ADDON_2_REQUIRE_ARG = getLibraryName(
      path.join(tempDirectoryPath, "addon-2"),
      { stripPathSuffix: false }
    );

    {
      const result = transformFileSync(
        path.join(tempDirectoryPath, "./addon-1.js"),
        { plugins: [[plugin, { stripPathSuffix: false }]] }
      );
      assert(result);
      const { code } = result;
      assert(
        code && code.includes(`requireNodeAddon("${ADDON_1_REQUIRE_ARG}")`),
        `Unexpected code: ${code}`
      );
    }

    {
      const result = transformFileSync(
        path.join(tempDirectoryPath, "./addon-2.js"),
        { plugins: [[plugin, { naming: "hash" }]] }
      );
      assert(result);
      const { code } = result;
      assert(
        code && code.includes(`requireNodeAddon("${ADDON_2_REQUIRE_ARG}")`),
        `Unexpected code: ${code}`
      );
    }

    {
      const result = transformFileSync(
        path.join(tempDirectoryPath, "./sub-directory/addon-1.js"),
        { plugins: [[plugin, { naming: "hash" }]] }
      );
      assert(result);
      const { code } = result;
      assert(
        code && code.includes(`requireNodeAddon("${ADDON_1_REQUIRE_ARG}")`),
        `Unexpected code: ${code}`
      );
    }

    {
      const result = transformFileSync(
        path.join(tempDirectoryPath, "./addon-1-bindings.js"),
        { plugins: [[plugin, { naming: "hash" }]] }
      );
      assert(result);
      const { code } = result;
      assert(
        code && code.includes(`requireNodeAddon("${ADDON_1_REQUIRE_ARG}")`),
        `Unexpected code: ${code}`
      );
    }

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
