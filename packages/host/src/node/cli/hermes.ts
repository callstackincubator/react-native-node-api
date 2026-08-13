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

export const HERMES_GIT_URL = "https://github.com/facebook/hermes.git";

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
//
// It also includes the immediately following commit, which flips Hermes'
// `JSI_UNSTABLE` CMake flag back to OFF by default. With it ON, Hermes compiles
// JSI's unstable `Serialized` / `ISerialization` APIs into `hermesvm`, but
// React Native never defines `JSI_UNSTABLE` when building the `libjsi.so` it
// ships in the ReactAndroid AAR. On Android the two are separate shared
// libraries, so `libhermesvm.so` ended up with undefined references to
// `facebook::jsi::Serialized` that nothing in the APK defined, and the app died
// on startup with "cannot locate symbol _ZTIN8facebook3jsi10SerializedE".
//
// When bumping this pin, re-diff the `hermes_napi_host` mirror in
// cpp/HermesNapiHost.hpp against `API/napi/hermes_napi.h` at the new commit:
// the struct is mirrored there (not included) and any change to its member
// order or signatures is an ABI break the compiler cannot catch.
export const HERMES_GIT_SHA = "5a795c9f880002c862c9254a26b57199819c97f7";

export const reactNativePackageOption = new Option(
  "--react-native-package <package-name>",
  "The React Native package to vendor Hermes into",
).default("react-native");

export const silentOption = new Option(
  "--silent",
  "Don't print anything except the final path",
).default(false);

/**
 * Locate the React Native package the app at `from` actually resolves to.
 */
export async function resolveReactNativePath(
  from: string,
  reactNativePackage: string,
) {
  const appPackageRoot = await packageDirectory({ cwd: from });
  assert(appPackageRoot, "Failed to find package root");

  const { dependencies = {} } = await readPackage({ cwd: appPackageRoot });
  assert(
    Object.keys(dependencies).includes(reactNativePackage),
    `Expected app to have a dependency on the '${reactNativePackage}' package`,
  );

  return path.dirname(
    require.resolve(reactNativePackage + "/package.json", {
      // Ensures we'll be patching the React Native package actually used by the app
      paths: [appPackageRoot],
    }),
  );
}

export function getHermesPath(reactNativePath: string) {
  return path.join(reactNativePath, "sdks", "node-api-hermes");
}

/**
 * Clone the pinned Hermes commit into the React Native package, unless it is
 * already there.
 */
export async function ensureHermesCheckout({
  reactNativePath,
  force,
  silent,
}: {
  reactNativePath: string;
  force: boolean;
  silent: boolean;
}) {
  const hermesPath = getHermesPath(reactNativePath);
  if (force && fs.existsSync(hermesPath)) {
    await oraPromise(
      fs.promises.rm(hermesPath, { recursive: true, force: true }),
      {
        text: "Removing existing Hermes clone",
        successText: "Removed existing Hermes clone",
        failText: (error) =>
          `Failed to remove existing Hermes clone: ${error.message}`,
        isSilent: silent,
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
          isSilent: silent,
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
  return hermesPath;
}

export const command = new Command("vendor-hermes")
  .argument("[from]", "Path to a file inside the app package", process.cwd())
  .addOption(silentOption)
  .option(
    "--force",
    "Don't check timestamps of input files to skip unnecessary rebuilds",
    false,
  )
  .addOption(reactNativePackageOption)
  .action(
    wrapAction(async (from, { force, silent, reactNativePackage }) => {
      const reactNativePath = await resolveReactNativePath(
        from,
        reactNativePackage,
      );
      if (!silent) {
        console.log(`Vendoring Hermes at ${HERMES_GIT_SHA}`);
      }
      const hermesPath = await ensureHermesCheckout({
        reactNativePath,
        force,
        silent,
      });
      console.log(hermesPath);
    }),
  );
