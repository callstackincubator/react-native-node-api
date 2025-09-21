import assert from "node:assert/strict";
import { describe, it } from "node:test";
import cp from "node:child_process";
import path from "node:path";

const PACKAGE_ROOT = path.join(__dirname, "../..");
const MONOREPO_ROOT = path.join(PACKAGE_ROOT, "../..");
const TEST_APP_ANDROID_PATH = path.join(MONOREPO_ROOT, "apps/test-app/android");

describe(
  "Gradle tasks",
  // Skipping these tests by default, as they download a lot and takes a long time
  { skip: process.env.ENABLE_GRADLE_TESTS !== "true" },
  () => {
    describe("linkNodeApiModules task", () => {
      it("should fail if REACT_NATIVE_OVERRIDE_HERMES_DIR is not set", () => {
        const { status, stdout, stderr } = cp.spawnSync(
          "sh",
          ["gradlew", "react-native-node-api:linkNodeApiModules"],
          {
            cwd: TEST_APP_ANDROID_PATH,
            env: {
              ...process.env,
              REACT_NATIVE_OVERRIDE_HERMES_DIR: undefined,
            },
            encoding: "utf-8",
          },
        );

        assert.notEqual(status, 0, `Expected failure: ${stdout} ${stderr}`);
        assert.match(
          stderr,
          /React Native Node-API needs a custom version of Hermes with Node-API enabled/,
        );
        assert.match(
          stderr,
          /Run the following in your terminal, to clone Hermes and instruct React Native to use it/,
        );
        assert.match(
          stderr,
          /export REACT_NATIVE_OVERRIDE_HERMES_DIR=\$\(npx react-native-node-api vendor-hermes --silent --force\)/,
        );
        assert.match(
          stderr,
          /And follow this guide to build React Native from source/,
        );
      });

      it("should call the CLI to autolink", () => {
        const { status, stdout, stderr } = cp.spawnSync(
          "sh",
          ["gradlew", "react-native-node-api:linkNodeApiModules"],
          {
            cwd: TEST_APP_ANDROID_PATH,
            env: {
              ...process.env,
              // We're passing some directory which exists
              REACT_NATIVE_OVERRIDE_HERMES_DIR: __dirname,
            },
            encoding: "utf-8",
          },
        );

        assert.equal(status, 0, `Expected success: ${stdout} ${stderr}`);
        assert.match(stdout, /Auto-linking Node-API modules/);
      });
    });
  },
);
