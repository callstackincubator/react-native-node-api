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
const HERMES_GIT_SHA = "0ae42446d1ae669508368b0a18e60c789f76735d";

const platformOption = new Option(
  "--react-native-package <package-name>",
  "The React Native package to vendor Hermes into",
).default("react-native");

// The public `hermes_napi_*` entry points (e.g. `hermes_napi_create_env`) are
// declared in `hermes_napi.h` with `NAPI_EXTERN` (visibility "default") but —
// unlike the sibling `js_native_api.h` / `node_api.h` headers — without any
// `extern "C"` wrapping. So they get C++ linkage: the symbols are name-mangled
// and, because Hermes builds with a global `-fvisibility=hidden`, stay out of
// the shared framework's export table. We reach `hermes_napi_create_env` from
// the host module, so consumers linking the framework hit "Undefined symbol".
//
// Wrapping the declarations in `EXTERN_C_START` / `EXTERN_C_END` (both already
// available via the `node_api.h` include) gives them C linkage, so they export
// under their unmangled C names. This mirrors facebook/hermes#2106.
const HERMES_NAPI_HEADER = "API/napi/hermes_napi.h";
const HERMES_NAPI_INCLUDE = '#include "hermes/napi/node_api.h"';
const HERMES_NAPI_ENDIF = "#endif // HERMES_NAPI_HERMES_NAPI_H";

async function patchHermesNapiVisibility(hermesPath: string) {
  const headerPath = path.join(hermesPath, HERMES_NAPI_HEADER);
  const contents = await fs.promises.readFile(headerPath, "utf8");
  if (contents.includes("EXTERN_C_START")) {
    return;
  }
  assert(
    contents.includes(HERMES_NAPI_INCLUDE) &&
      contents.includes(HERMES_NAPI_ENDIF),
    `Cannot patch ${HERMES_NAPI_HEADER}: expected anchors not found (did the pinned Hermes commit change?)`,
  );
  const patched = contents
    .replace(HERMES_NAPI_INCLUDE, `${HERMES_NAPI_INCLUDE}\n\nEXTERN_C_START`)
    .replace(HERMES_NAPI_ENDIF, `EXTERN_C_END\n\n${HERMES_NAPI_ENDIF}`);
  await fs.promises.writeFile(headerPath, patched);
}

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
      // Applied unconditionally (idempotent) so an existing checkout from
      // before this patch also gets fixed.
      await patchHermesNapiVisibility(hermesPath);
      console.log(hermesPath);
    }),
  );
