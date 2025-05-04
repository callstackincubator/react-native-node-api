import fs from "node:fs";
import path from "node:path";

import { Command } from "@commander-js/extra-typings";
import { spawn, SpawnFailure } from "bufout";
import { oraPromise } from "ora";
import { prettyPath } from "../path-utils";

const HERMES_PATH = path.resolve(__dirname, "../../../hermes");
const HERMES_GIT_URL = "https://github.com/kraenhansen/hermes.git";
const HERMES_GIT_TAG = "node-api-for-react-native-0.79.0";
const REACT_NATIVE_DIR = path.dirname(
  require.resolve("react-native/package.json")
);

export const command = new Command("vendor-hermes")
  .option("--silent", "Don't print anything except the final path", false)
  .option(
    "--force",
    "Don't check timestamps of input files to skip unnecessary rebuilds",
    false
  )
  .action(async ({ force, silent }) => {
    try {
      if (force) {
        fs.rmSync(HERMES_PATH, { recursive: true, force: true });
      }
      if (!fs.existsSync(HERMES_PATH)) {
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
              HERMES_PATH,
            ],
            {
              outputMode: "buffered",
            }
          ),
          {
            text: `Cloning custom Hermes into ${prettyPath(HERMES_PATH)}`,
            successText: "Cloned custom Hermes",
            failText: (err) => `Failed to clone custom Hermes: ${err.message}`,
            isEnabled: !silent,
          }
        );
        await oraPromise(
          fs.promises.cp(
            path.join(HERMES_PATH, "API/jsi/jsi"),
            path.join(REACT_NATIVE_DIR, "ReactCommon/jsi/jsi/"),
            {
              recursive: true,
            }
          ),
          {
            text: `Copying JSI from Hermes to React Native`,
            successText: "Copied JSI from Hermes to React Native",
            failText: (err) =>
              `Failed to copy JSI from Hermes to React Native: ${err.message}`,
            isEnabled: !silent,
          }
        );
      }
      console.log(HERMES_PATH);
    } catch (error) {
      if (error instanceof SpawnFailure) {
        error.flushOutput("both");
        process.exitCode = 1;
      } else {
        process.exitCode = 2;
        throw error;
      }
    }
  });
