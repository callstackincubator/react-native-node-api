import assert from "node:assert/strict";
import { describe, it } from "node:test";
import cp from "node:child_process";
import path from "node:path";

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
    it("should succeed with a mention of Node-API modules", () => {
      const { status, stdout, stderr } = cp.spawnSync(
        process.execPath,
        [BIN_PATH, "link", "--android", "--apple"],
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
        stdout + stderr,
        /Auto-linking Node-API modules/,
        `Failed to find expected output (stdout: ${stdout} stderr: ${stderr})`,
      );
    });
  });
});
