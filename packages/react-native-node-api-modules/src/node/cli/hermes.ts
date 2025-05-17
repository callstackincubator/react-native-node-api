import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { Command } from "@commander-js/extra-typings";
import { spawn, SpawnFailure } from "bufout";
import { oraPromise } from "ora";
import { packageDirectorySync } from "pkg-dir";

import { getLatestMtime, prettyPath } from "../path-utils";

const HOST_PACKAGE_ROOT = path.resolve(__dirname, "../../..");
const HERMES_GIT_URL = "https://github.com/kraenhansen/hermes.git";
const HERMES_GIT_TAG = "node-api-for-react-native-0.79.0";

export const command = new Command("vendor-hermes")
  .argument("[from]", "Path to a file inside the app package", process.cwd())
  .option("--silent", "Don't print anything except the final path", false)
  .option(
    "--force",
    "Don't check timestamps of input files to skip unnecessary rebuilds",
    false
  )
  .action(async (from, { force, silent }) => {
    try {
      const appPackageRoot = packageDirectorySync({ cwd: from });
      assert(appPackageRoot, "Failed to find package root");
      const hermesPath = path.join(HOST_PACKAGE_ROOT, "hermes");
      if (force && fs.existsSync(hermesPath)) {
        await oraPromise(
          fs.promises.rm(hermesPath, { recursive: true, force: true }),
          {
            text: "Removing existing Hermes clone",
            successText: "Removed existing Hermes clone",
            failText: (error) =>
              `Failed to remove existing Hermes clone: ${error.message}`,
            isEnabled: !silent,
          }
        );
      }
      if (!fs.existsSync(hermesPath)) {
        await oraPromise(
          spawn(
            "git",
            [
              "clone",
              "--recursive",
              "--depth",
              "1",
              "--branch",
              HERMES_GIT_TAG,
              HERMES_GIT_URL,
              hermesPath,
            ],
            {
              outputMode: "buffered",
            }
          ),
          {
            text: `Cloning custom Hermes into ${prettyPath(hermesPath)}`,
            successText: "Cloned custom Hermes",
            failText: (err) => `Failed to clone custom Hermes: ${err.message}`,
            isEnabled: !silent,
          }
        );
      }
      const hermesJsiPath = path.join(hermesPath, "API/jsi/jsi");
      const reactNativePath = path.dirname(
        require.resolve("react-native/package.json", {
          // Ensures we'll be patching the React Native package actually used by the app
          paths: [appPackageRoot],
        })
      );
      const reactNativeJsiPath = path.join(
        reactNativePath,
        "ReactCommon/jsi/jsi/"
      );

      if (
        fs.existsSync(reactNativeJsiPath) &&
        (force ||
          getLatestMtime(hermesJsiPath) > getLatestMtime(reactNativeJsiPath))
      ) {
        await oraPromise(
          fs.promises.cp(hermesJsiPath, reactNativeJsiPath, {
            recursive: true,
          }),
          {
            text: `Copying JSI from Hermes to React Native`,
            successText: "Copied JSI from Hermes to React Native",
            failText: (err) =>
              `Failed to copy JSI from Hermes to React Native: ${err.message}`,
            isEnabled: !silent,
          }
        );
      }
      console.log(hermesPath);
    } catch (error) {
      if (error instanceof SpawnFailure) {
        error.flushOutput("both");
      }
      throw error;
    }
  });
