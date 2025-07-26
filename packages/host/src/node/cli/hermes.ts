import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { Command } from "@commander-js/extra-typings";
import { spawn, SpawnFailure } from "bufout";
import { oraPromise } from "ora";
import { packageDirectorySync } from "pkg-dir";

import { prettyPath } from "../path-utils";

const HOST_PACKAGE_ROOT = path.resolve(__dirname, "../../..");
// FIXME: make this configurable with reasonable fallback before public release
const HERMES_GIT_URL = "https://github.com/kraenhansen/hermes.git";

export const command = new Command("vendor-hermes")
  .argument("[from]", "Path to a file inside the app package", process.cwd())
  .option("--silent", "Don't print anything except the final path", false)
  .option(
    "--force",
    "Don't check timestamps of input files to skip unnecessary rebuilds",
    false,
  )
  .action(async (from, { force, silent }) => {
    try {
      const appPackageRoot = packageDirectorySync({ cwd: from });
      assert(appPackageRoot, "Failed to find package root");
      const reactNativePath = path.dirname(
        require.resolve("react-native/package.json", {
          // Ensures we'll be patching the React Native package actually used by the app
          paths: [appPackageRoot],
        }),
      );
      const hermesVersionPath = path.join(
        reactNativePath,
        "sdks",
        ".hermesversion",
      );
      const hermesVersion = fs.readFileSync(hermesVersionPath, "utf8").trim();
      if (!silent) {
        console.log(`Using Hermes version: ${hermesVersion}`);
      }

      const reactNativeJsiPath = path.join(
        reactNativePath,
        "ReactCommon/jsi/jsi/",
      );

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
          },
        );
      }
      if (!fs.existsSync(hermesPath)) {
        const patchedTag = `node-api-${hermesVersion}`;
        try {
          await oraPromise(
            spawn(
              "git",
              [
                "clone",
                "--recursive",
                "--depth",
                "1",
                "--branch",
                patchedTag,
                HERMES_GIT_URL,
                hermesPath,
              ],
              {
                outputMode: "buffered",
              },
            ),
            {
              text: `Cloning custom Hermes into ${prettyPath(hermesPath)}`,
              successText: "Cloned custom Hermes",
              failText: (err) =>
                `Failed to clone custom Hermes: ${err.message}`,
              isEnabled: !silent,
            },
          );
        } catch (error) {
          if (error instanceof SpawnFailure) {
            error.flushOutput("both");
            console.error(
              `\n🛑 React Native uses the ${hermesVersion} tag and cloning our fork failed.`,
              `Please see the Node-API package's peer dependency on "react-native" for supported versions.`,
            );
            process.exitCode = 1;
            return;
          } else {
            throw error;
          }
        }
      }
      const hermesJsiPath = path.join(hermesPath, "API/jsi/jsi");

      assert(
        fs.existsSync(hermesJsiPath),
        `Hermes JSI path does not exist: ${hermesJsiPath}`,
      );

      await oraPromise(
        fs.promises.cp(hermesJsiPath, reactNativeJsiPath, {
          recursive: true,
        }),
        {
          text: `Copying JSI from patched Hermes to React Native`,
          successText: "Copied JSI from patched Hermes to React Native",
          failText: (err) =>
            `Failed to copy JSI from Hermes to React Native: ${err.message}`,
          isEnabled: !silent,
        },
      );
      console.log(hermesPath);
    } catch (error) {
      process.exitCode = 1;
      if (error instanceof SpawnFailure) {
        error.flushOutput("both");
      }
      throw error;
    }
  });
