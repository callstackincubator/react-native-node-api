import assert from "node:assert/strict";
import { describe, it } from "node:test";
import cp from "node:child_process";
import path from "node:path";
import { setupTempDirectory } from "../test-utils";

const PACKAGE_ROOT = path.join(__dirname, "../../..");
const BIN_PATH = path.join(PACKAGE_ROOT, "bin/react-native-node-api.mjs");

describe("bin", () => {
  describe("help command", () => {
    it("should succeed with a mention of usage", () => {
      const { status, stdout, stderr } = cp.spawnSync(
        process.execPath,
        [BIN_PATH, "help"],
        {
          cwd: PACKAGE_ROOT,
          encoding: "utf8",
        },
      );

      assert.equal(
        status,
        0,
        `Expected success (got ${status}): ${stdout} ${stderr}`,
      );
      assert.match(
        stdout,
        /Usage: react-native-node-api/,
        `Failed to find expected output (stdout: ${stdout} stderr: ${stderr})`,
      );
    });
  });

  describe("link command", () => {
    it("should succeed with a mention of Node-API modules", (context) => {
      const targetBuildDir = setupTempDirectory(context, {});

      const { status, stdout, stderr } = cp.spawnSync(
        process.execPath,
        [
          BIN_PATH,
          "link",
          "--android",
          // Linking for Apple fails on non-Apple platforms
          ...(process.platform === "darwin" ? ["--apple"] : []),
        ],
        {
          cwd: PACKAGE_ROOT,
          encoding: "utf8",
          env: {
            ...process.env,
            TARGET_BUILD_DIR: targetBuildDir,
            FRAMEWORKS_FOLDER_PATH: "Frameworks",
            PLATFORM_NAME: "iphonesimulator",
            ARCHS: "arm64",
          },
        },
      );

      assert.equal(
        status,
        0,
        `Expected success (got ${status}): ${stdout} ${stderr}`,
      );
      assert.match(
        stdout + stderr,
        /Auto-linking Node-API modules/,
        `Failed to find expected output (stdout: ${stdout} stderr: ${stderr})`,
      );
    });

    it("skips dependencies that cannot be resolved by default", (context) => {
      const targetBuildDir = setupTempDirectory(context, {});
      const appDir = setupTempDirectory(context, {
        "package.json": JSON.stringify({
          name: "test-app",
          dependencies: { "broken-package": "1.0.0" },
        }),
        "node_modules/broken-package/package.json": JSON.stringify({
          name: "broken-package",
          exports: "./missing.js",
        }),
      });

      const { status, stdout, stderr } = cp.spawnSync(
        process.execPath,
        [BIN_PATH, "link", appDir, "--android"],
        {
          cwd: PACKAGE_ROOT,
          encoding: "utf8",
          env: {
            ...process.env,
            TARGET_BUILD_DIR: targetBuildDir,
          },
        },
      );

      assert.equal(
        status,
        0,
        `Expected success (got ${status}): ${stdout} ${stderr}`,
      );
      assert.match(stderr, /Cannot find package root .* for broken-package/);
    });

    it("reports dependency resolution errors with --fail-on-error", (context) => {
      const targetBuildDir = setupTempDirectory(context, {});
      const appDir = setupTempDirectory(context, {
        "package.json": JSON.stringify({
          name: "test-app",
          dependencies: { "broken-package": "1.0.0" },
        }),
        "node_modules/broken-package/package.json": JSON.stringify({
          name: "broken-package",
          exports: "./missing.js",
        }),
      });

      const { status, stdout, stderr } = cp.spawnSync(
        process.execPath,
        [BIN_PATH, "link", appDir, "--android", "--fail-on-error"],
        {
          cwd: PACKAGE_ROOT,
          encoding: "utf8",
          env: {
            ...process.env,
            TARGET_BUILD_DIR: targetBuildDir,
          },
        },
      );

      assert.equal(
        status,
        1,
        `Expected failure (got ${status}): ${stdout} ${stderr}`,
      );
      assert.match(stderr, /broken-package/);
      assert.match(stderr, /missing\.js/);
      assert.doesNotMatch(stderr, /unknown option/);
    });
  });
});
