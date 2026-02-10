import assert from "node:assert/strict";
import cp from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { readPackage } from "read-pkg";

const REACT_NATIVE_VERSION = "0.81.5";
const REACT_NATIVE_MACOS_VERSION = "0.81.1";
const REACT_VERSION = "^19.1.4";

const ROOT_PATH = path.join(import.meta.dirname, "..");
const APP_PATH = path.join(ROOT_PATH, "apps", "macos-test-app");
const OTHER_APP_PATH = path.join(ROOT_PATH, "apps", "test-app");

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
  const CLEANUP_PATHS = [
    "ios",
    "android",
    "__tests__",
    ".prettierrc.js",
    ".gitignore",
  ];

  for (const cleanupPath of CLEANUP_PATHS) {
    await fs.promises.rm(path.join(APP_PATH, cleanupPath), {
      recursive: true,
      force: true,
    });
  }
}

async function patchPackageJson() {
  console.log("Patching package.json scripts");
  const packageJson = await readPackage({ cwd: APP_PATH });
  const otherPackageJson = await readPackage({ cwd: OTHER_APP_PATH });

  packageJson.scripts = {
    ...packageJson.scripts,
    metro: "react-native start --reset-cache --no-interactive",
    "mocha-and-metro": "mocha-remote --exit-on-error -- node --run metro",
    premacos: "killall 'MacOSTestApp' || true",
    macos: "react-native run-macos --no-packager",
    test: "mocha-remote --exit-on-error -- concurrently --passthrough-arguments --kill-others-on-fail npm:metro 'npm:macos -- {@}' --",
    "test:allTests": "MOCHA_REMOTE_CONTEXT=allTests node --run test -- ",
    "test:nodeAddonExamples":
      "MOCHA_REMOTE_CONTEXT=nodeAddonExamples node --run test -- ",
    "test:nodeTests": "MOCHA_REMOTE_CONTEXT=nodeTests node --run test -- ",
    "test:ferricExample":
      "MOCHA_REMOTE_CONTEXT=ferricExample node --run test -- ",
  };

  const transferredDependencies = new Set([
    "@rnx-kit/metro-config",
    "mocha-remote-cli",
    "mocha-remote-react-native",
  ]);

  const { dependencies: otherDependencies = {} } = otherPackageJson;

  packageJson.dependencies = {
    ...packageJson.dependencies,
    react: REACT_VERSION,
    "react-native-macos-init": "^2.1.3",
    "@react-native-node-api/node-addon-examples": path.relative(
      APP_PATH,
      path.join(ROOT_PATH, "packages", "node-addon-examples"),
    ),
    "@react-native-node-api/node-tests": path.relative(
      APP_PATH,
      path.join(ROOT_PATH, "packages", "node-tests"),
    ),
    "@react-native-node-api/ferric-example": path.relative(
      APP_PATH,
      path.join(ROOT_PATH, "packages", "ferric-example"),
    ),
    "react-native-node-api": path.relative(
      APP_PATH,
      path.join(ROOT_PATH, "packages", "host"),
    ),
    "weak-node-api": path.relative(
      APP_PATH,
      path.join(ROOT_PATH, "packages", "weak-node-api"),
    ),
    ...Object.fromEntries(
      Object.entries(otherDependencies).filter(([name]) =>
        transferredDependencies.has(name),
      ),
    ),
  };

  await fs.promises.writeFile(
    path.join(APP_PATH, "package.json"),
    JSON.stringify(packageJson, null, 2),
    "utf8",
  );
}

function installDependencies() {
  console.log("Installing dependencies");
  exec("npm", ["install", "--prefer-offline"], {
    cwd: APP_PATH,
  });
}

function initializeReactNativeMacOSTemplate() {
  console.log("Initializing react-native-macos template");
  exec(
    "npx",
    ["react-native-macos-init", "--version", REACT_NATIVE_MACOS_VERSION],
    {
      cwd: APP_PATH,
    },
  );
}

async function patchPodfile() {
  console.log("Patching Podfile");
  const replacements = [
    [
      // As per https://github.com/microsoft/react-native-macos/issues/2723#issuecomment-3392930688
      "require_relative '../node_modules/react-native-macos/scripts/react_native_pods'\nrequire_relative '../node_modules/@react-native-community/cli-platform-ios/native_modules'",
      "require_relative '../node_modules/react-native-macos/scripts/cocoapods/autolinking'",
    ],
    [
      ":hermes_enabled => false,",
      // Adding the new_arch_enabled here as it's not a part of the template
      ":hermes_enabled => true,\n    :new_arch_enabled => true,",
    ],
    [
      ":fabric_enabled => ENV['RCT_NEW_ARCH_ENABLED'] == '1',",
      ":fabric_enabled => true,",
    ],
    [
      "react_native_post_install(installer)",
      "react_native_post_install(installer, '../node_modules/react-native-macos')",
    ],
  ];

  const podfilePath = path.join(APP_PATH, "macos", "Podfile");
  let podfileContents = await fs.promises.readFile(podfilePath, "utf8");
  for (const [searchValue, replaceValue] of replacements) {
    podfileContents = podfileContents.replace(searchValue, replaceValue);
  }
  await fs.promises.writeFile(podfilePath, podfileContents, "utf8");
}

async function copySourceFiles() {
  console.log("Copying source files from test-app into macos-test-app:");
  const FILE_NAMES = [
    "App.tsx",
    // Adds the babel plugin needed to transform require calls
    "babel.config.js",
    // Adds the ability to reference symlinked packages
    "metro.config.js",
  ];
  for (const fileName of FILE_NAMES) {
    console.log(`↳ ${fileName}`);
    await fs.promises.copyFile(
      path.join(OTHER_APP_PATH, fileName),
      path.join(APP_PATH, fileName),
    );
  }
}

await deletePreviousApp();
await initializeReactNativeTemplate();
await patchPackageJson();
installDependencies();
initializeReactNativeMacOSTemplate();
await patchPodfile();
await copySourceFiles();
