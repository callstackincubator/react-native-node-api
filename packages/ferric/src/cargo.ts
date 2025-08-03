import assert from "node:assert/strict";
import cp from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { spawn } from "bufout";
import chalk from "chalk";

import { assertFixable, UsageError } from "./errors.js";
import {
  AndroidTargetName,
  AppleTargetName,
  isAndroidTarget,
  isAppleTarget,
} from "./targets.js";

import { weakNodeApiPath } from "react-native-node-api";

const APPLE_XCFRAMEWORK_CHILDS_PER_TARGET: Record<AppleTargetName, string> = {
  "aarch64-apple-darwin": "macos-arm64_x86_64", // Universal
  "x86_64-apple-darwin": "macos-arm64_x86_64", // Universal
  "aarch64-apple-ios": "ios-arm64",
  "aarch64-apple-ios-sim": "ios-arm64-simulator",
  // "aarch64-apple-ios-macabi": "", // Catalyst
  // "x86_64-apple-ios": "ios-x86_64",
  // "x86_64-apple-ios-macabi": "ios-x86_64-simulator",
  // "aarch64-apple-tvos": "tvos-arm64",
  // "aarch64-apple-tvos-sim": "tvos-arm64-simulator",
  // "aarch64-apple-visionos": "xros-arm64",
  // "aarch64-apple-visionos-sim": "xros-arm64-simulator",
};

const ANDROID_ARCH_PR_TARGET: Record<AndroidTargetName, string> = {
  "aarch64-linux-android": "arm64-v8a",
  "armv7-linux-androideabi": "armeabi-v7a",
  "i686-linux-android": "x86",
  "x86_64-linux-android": "x86_64",
};

export function joinPathAndAssertExistence(...pathSegments: string[]) {
  const joinedPath = path.join(...pathSegments);
  assert(fs.existsSync(joinedPath), `Expected ${joinedPath} to exist`);
  return joinedPath;
}

export function ensureCargo() {
  try {
    const cargoVersion = cp
      .execFileSync("cargo", ["--version"], {
        encoding: "utf-8",
      })
      .trim();
    console.log(chalk.dim(`Using ${cargoVersion}`));
  } catch (error) {
    throw new UsageError(
      "You need a Rust toolchain: https://doc.rust-lang.org/cargo/getting-started/installation.html#install-rust-and-cargo",
      { cause: error },
    );
  }
}

type BuildOptions = {
  configuration: "debug" | "release";
} & (
  | {
      target: AndroidTargetName;
      ndkVersion: string;
      androidApiLevel: number;
    }
  | {
      target: AppleTargetName;
      ndkVersion?: never;
      androidApiLevel?: number;
    }
);

export async function build(options: BuildOptions) {
  const { target, configuration } = options;
  const args = ["build", "--target", target];
  if (configuration.toLowerCase() === "release") {
    args.push("--release");
  }
  await spawn("cargo", args, {
    outputMode: "buffered",
    env: {
      ...process.env,
      ...getTargetEnvironmentVariables(options),
    },
  });
  const targetOutputPath = joinPathAndAssertExistence(
    process.cwd(),
    "target",
    target,
    configuration,
  );
  const dynamicLibraryFile = fs
    .readdirSync(targetOutputPath)
    .filter((file) => file.endsWith(".so") || file.endsWith(".dylib"));
  assert(
    dynamicLibraryFile.length === 1,
    `Expected a single shared object file in ${targetOutputPath}`,
  );
  return joinPathAndAssertExistence(targetOutputPath, dynamicLibraryFile[0]);
}

export function getLLVMToolchainBinPath(ndkPath: string) {
  const prebuiltPath = path.join(ndkPath, "toolchains", "llvm", "prebuilt");
  const candidates = fs.readdirSync(prebuiltPath);
  if (candidates.length === 0) {
    throw new Error("Expected LLVM toolchain to be installed");
  } else if (candidates.length > 1) {
    throw new Error("Expected a single LLVM toolchain to be installed");
  } else {
    return path.join(prebuiltPath, candidates[0], "bin");
  }
}

export function getTargetAndroidArch(target: AndroidTargetName) {
  const [first] = target.split("-");
  return first === "armv7" ? "armv7a" : first;
}

export function getTargetAndroidPlatform(target: AndroidTargetName) {
  return getTargetAndroidArch(target) === "armv7a"
    ? "androideabi24"
    : "android24";
}

export function getWeakNodeApiFrameworkPath(target: AppleTargetName) {
  return joinPathAndAssertExistence(
    weakNodeApiPath,
    "weak-node-api.xcframework",
    APPLE_XCFRAMEWORK_CHILDS_PER_TARGET[target],
  );
}

export function getWeakNodeApiAndroidLibraryPath(target: AndroidTargetName) {
  return joinPathAndAssertExistence(
    weakNodeApiPath,
    "weak-node-api.android.node",
    ANDROID_ARCH_PR_TARGET[target],
  );
}

export function getTargetEnvironmentVariables({
  target,
  ndkVersion,
  androidApiLevel,
}: BuildOptions): Record<string, string> {
  if (isAndroidTarget(target)) {
    assert(ndkVersion, "Expected ndkVersion to be set for Android targets");

    const { ANDROID_HOME } = process.env;
    assertFixable(
      ANDROID_HOME && fs.existsSync(ANDROID_HOME),
      `Missing ANDROID_HOME environment variable`,
      {
        instructions: "Set ANDROID_HOME to the Android SDK directory",
      },
    );
    const ndkPath = path.join(ANDROID_HOME, "ndk", ndkVersion);
    assertFixable(fs.existsSync(ndkPath), `Expected NDK at ${ndkPath}`, {
      command: `sdkmanager --install "ndk;${ndkVersion}"`,
    });

    const toolchainBinPath = getLLVMToolchainBinPath(ndkPath);
    const targetArch = getTargetAndroidArch(target);
    const targetPlatform = getTargetAndroidPlatform(target);
    const weakNodeApiPath = getWeakNodeApiAndroidLibraryPath(target);
    const cmdMaybe = process.platform === "win32" ? ".cmd" : "";
    const exeMaybe = process.platform === "win32" ? ".exe" : "";

    return {
      CARGO_ENCODED_RUSTFLAGS: [
        "-L",
        weakNodeApiPath,
        "-l",
        "weak-node-api",
      ].join(String.fromCharCode(0x1f)),
      CARGO_TARGET_AARCH64_LINUX_ANDROID_LINKER: joinPathAndAssertExistence(
        toolchainBinPath,
        `aarch64-linux-android${androidApiLevel}-clang${cmdMaybe}`,
      ),
      CARGO_TARGET_ARMV7_LINUX_ANDROIDEABI_LINKER: joinPathAndAssertExistence(
        toolchainBinPath,
        `armv7a-linux-androideabi${androidApiLevel}-clang${cmdMaybe}`,
      ),
      CARGO_TARGET_X86_64_LINUX_ANDROID_LINKER: joinPathAndAssertExistence(
        toolchainBinPath,
        `x86_64-linux-android${androidApiLevel}-clang${cmdMaybe}`,
      ),
      CARGO_TARGET_I686_LINUX_ANDROID_LINKER: joinPathAndAssertExistence(
        toolchainBinPath,
        `i686-linux-android${androidApiLevel}-clang${cmdMaybe}`,
      ),
      TARGET_CC: joinPathAndAssertExistence(
        toolchainBinPath,
        `${targetArch}-linux-${targetPlatform}-clang${cmdMaybe}`,
      ),
      TARGET_CXX: joinPathAndAssertExistence(
        toolchainBinPath,
        `${targetArch}-linux-${targetPlatform}-clang++${cmdMaybe}`,
      ),
      TARGET_AR: joinPathAndAssertExistence(
        toolchainBinPath,
        `llvm-ar${exeMaybe}`,
      ),
      TARGET_RANLIB: joinPathAndAssertExistence(
        toolchainBinPath,
        `llvm-ranlib${exeMaybe}`,
      ),
      ANDROID_NDK: ndkPath,
      PATH: `${toolchainBinPath}:${process.env.PATH}`,
    };
  } else if (isAppleTarget(target)) {
    const weakNodeApiFrameworkPath = getWeakNodeApiFrameworkPath(target);
    return {
      CARGO_ENCODED_RUSTFLAGS: [
        "-L",
        `framework=${weakNodeApiFrameworkPath}`,
        "-l",
        "framework=weak-node-api",
      ].join(String.fromCharCode(0x1f)),
    };
  } else {
    throw new Error(`Unexpected target: ${target as string}`);
  }
}
