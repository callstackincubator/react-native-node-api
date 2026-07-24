import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  chalk,
  Command,
  Option,
  oraPromise,
  spawn,
  UsageError,
  wrapAction,
  prettyPath,
} from "@react-native-node-api/cli-utils";
import { packageDirectory } from "pkg-dir";
import { readPackage } from "read-pkg";

const HERMES_GIT_URL = "https://github.com/facebook/hermes.git";

// Pinned commit on the `static_h` branch, which carries the first-party
// Node-API implementation under `API/napi`. Bump deliberately: the JSI
// accessor we rely on (`getVMRuntimeUnsafe`) is documented as unstable, so we
// vendor a known-good commit rather than tracking a moving branch.
//
// This commit includes facebook/hermes#2106 ("give hermes_napi.h public API C
// linkage"), which wraps the public `hermes_napi_*` entry points (e.g.
// `hermes_napi_create_env`) in `extern "C"`. Without it those declarations got
// C++ linkage: the mangled symbols stayed out of the framework's export table
// under Hermes' global `-fvisibility=hidden`, and consumers linking the
// framework hit "Undefined symbol: hermes_napi_create_env". We used to patch
// the header ourselves after cloning; now that the fix is upstream at this pin,
// no header patching is required.
const HERMES_GIT_SHA = "efcf68e285865fd9d952070b08e751bcad63f25e";

const platformOption = new Option(
  "--react-native-package <package-name>",
  "The React Native package to vendor Hermes into",
).default("react-native");

export const command = new Command("vendor-hermes")
  .argument("[from]", "Path to a file inside the app package", process.cwd())
  .option("--silent", "Don't print anything except the final path", false)
  .option(
    "--force",
    "Don't check timestamps of input files to skip unnecessary rebuilds",
    false,
  )
  .addOption(platformOption)
  .action(
    wrapAction(async (from, { force, silent, reactNativePackage }) => {
      const appPackageRoot = await packageDirectory({ cwd: from });
      assert(appPackageRoot, "Failed to find package root");

      const { dependencies = {} } = await readPackage({ cwd: appPackageRoot });
      assert(
        Object.keys(dependencies).includes(reactNativePackage),
        `Expected app to have a dependency on the '${reactNativePackage}' package`,
      );

      const reactNativePath = path.dirname(
        require.resolve(reactNativePackage + "/package.json", {
          // Ensures we'll be patching the React Native package actually used by the app
          paths: [appPackageRoot],
        }),
      );
      if (!silent) {
        console.log(`Vendoring Hermes at ${HERMES_GIT_SHA}`);
      }

      const hermesPath = path.join(reactNativePath, "sdks", "node-api-hermes");
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
        try {
          // GitHub allows fetching a reachable commit by SHA, so we can clone
          // the pinned commit shallowly without downloading the whole history.
          await oraPromise(
            (async () => {
              await fs.promises.mkdir(hermesPath, { recursive: true });
              const git = (args: string[]) =>
                spawn("git", args, {
                  cwd: hermesPath,
                  outputMode: "buffered",
                });
              await git(["init", "--quiet"]);
              await git(["remote", "add", "origin", HERMES_GIT_URL]);
              await git(["fetch", "--depth", "1", "origin", HERMES_GIT_SHA]);
              await git(["checkout", "--quiet", "FETCH_HEAD"]);
              await git([
                "submodule",
                "update",
                "--init",
                "--recursive",
                "--depth",
                "1",
              ]);
            })(),
            {
              text: `Cloning Hermes into ${prettyPath(hermesPath)}`,
              successText: "Cloned Hermes",
              failText: (err) => `Failed to clone Hermes: ${err.message}`,
              isEnabled: !silent,
            },
          );
        } catch (error) {
          // A failed clone can leave a partial checkout behind, which would
          // make the existence check above skip re-cloning on the next run.
          await fs.promises.rm(hermesPath, { recursive: true, force: true });
          throw new UsageError("Failed to clone Hermes", {
            cause: error,
            fix: {
              instructions: `Check the network connection and that the pinned Hermes commit ${chalk.bold(HERMES_GIT_SHA)} is still reachable on ${chalk.bold(HERMES_GIT_URL)}.`,
            },
          });
        }
      }
      console.log(hermesPath);
    }),
  );
