import assert from "node:assert/strict";
import cp from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const REACT_NATIVE_VERSION = "0.79.6";
const ROOT_PATH = path.join(import.meta.dirname, "..");
const APP_PATH = path.join(ROOT_PATH, "apps", "macos-test-app");
const HOST_PACKAGE_PATH = path.join(ROOT_PATH, "packages", "host");

function exec(command: string, args: string[], options: cp.SpawnOptions = {}) {
  const { status } = cp.spawnSync(command, args, {
    stdio: "inherit",
    ...options,
  });
  assert.equal(status, 0, `Failed to execute '${command}'`);
}

async function deletePreviousApp() {
  if (fs.existsSync(APP_PATH)) {
    console.log("Deleting existing app directory");
    await fs.promises.rm(APP_PATH, { recursive: true, force: true });
  }
}

async function initializeReactNativeTemplate() {
  console.log("Initializing community template");
  exec("npx", [
    "@react-native-community/cli",
    "init",
    "MacOSTestApp",
    "--skip-install",
    "--skip-git-init",
    // "--platform-name",
    // "react-native-macos",
    "--version",
    REACT_NATIVE_VERSION,
    "--directory",
    APP_PATH,
  ]);

  // Clean up
  const CLEANUP_PATHS = ["ios", "android", "__tests__"];

  for (const cleanupPath of CLEANUP_PATHS) {
    await fs.promises.rm(path.join(APP_PATH, cleanupPath), {
      recursive: true,
      force: true,
    });
  }
}

function installDependencies() {
  console.log("Installing dependencies");
  exec(
    "npm",
    [
      "install",
      "--save-dev",
      "--prefer-offline",
      "--install-links",
      "react-native-macos-init",
      path.relative(APP_PATH, HOST_PACKAGE_PATH),
    ],
    {
      cwd: APP_PATH,
    },
  );
}

function initializeReactNativeMacOSTemplate() {
  console.log("Initializing react-native-macos template");
  exec("npx", ["react-native-macos-init"], {
    cwd: APP_PATH,
  });
}

async function patchPodfile() {
  console.log("Patching Podfile");
  const replacements = [
    [
      // As per https://github.com/microsoft/react-native-macos/issues/2723#issuecomment-3392930688
      "require_relative '../node_modules/react-native-macos/scripts/react_native_pods'\nrequire_relative '../node_modules/@react-native-community/cli-platform-ios/native_modules'",
      "require_relative '../node_modules/react-native-macos/scripts/cocoapods/autolinking'",
    ],
    [":hermes_enabled => false,", ":hermes_enabled => true,"],
    [
      ":fabric_enabled => ENV['RCT_NEW_ARCH_ENABLED'] == '1',",
      ":fabric_enabled => true,",
    ],
  ];

  const podfilePath = path.join(APP_PATH, "macos", "Podfile");
  let podfileContents = await fs.promises.readFile(podfilePath, "utf8");
  for (const [searchValue, replaceValue] of replacements) {
    podfileContents = podfileContents.replace(searchValue, replaceValue);
  }
  await fs.promises.writeFile(podfilePath, podfileContents, "utf8");
}

function installCocoapods() {
  console.log("Installing cocoapods");
  exec("pod", ["install", "--project-directory=macos"], {
    cwd: APP_PATH,
  });
}

await deletePreviousApp();
await initializeReactNativeTemplate();
installDependencies();
initializeReactNativeMacOSTemplate();
await patchPodfile();
installCocoapods();
