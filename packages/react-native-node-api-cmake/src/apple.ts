import assert from "node:assert/strict";
import cp from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { spawn } from "bufout";

import { AppleTriplet, isAppleTriplet } from "./triplets.js";

export const DEFAULT_APPLE_TRIPLETS = [
  "arm64;x86_64-apple-darwin",
  "arm64-apple-ios",
  "arm64-apple-ios-sim",
  "arm64-apple-tvos",
  "arm64-apple-tvos-sim",
  "arm64-apple-visionos",
  "arm64-apple-visionos-sim",
] as const satisfies AppleTriplet[];

type XcodeSDKName =
  | "iphoneos"
  | "iphonesimulator"
  | "catalyst"
  | "xros"
  | "xrsimulator"
  | "appletvos"
  | "appletvsimulator"
  | "macosx";

const XCODE_SDK_NAMES = {
  "x86_64-apple-darwin": "macosx",
  "arm64-apple-darwin": "macosx",
  "arm64;x86_64-apple-darwin": "macosx",
  "arm64-apple-ios": "iphoneos",
  "arm64-apple-ios-sim": "iphonesimulator",
  "arm64-apple-tvos": "appletvos",
  // "x86_64-apple-tvos": "appletvos",
  "arm64-apple-tvos-sim": "appletvsimulator",
  "arm64-apple-visionos": "xros",
  "arm64-apple-visionos-sim": "xrsimulator",
} satisfies Record<AppleTriplet, XcodeSDKName>;

type CMakeSystemName = "Darwin" | "iOS" | "tvOS" | "watchOS" | "visionOS";

const CMAKE_SYSTEM_NAMES = {
  "x86_64-apple-darwin": "Darwin",
  "arm64-apple-darwin": "Darwin",
  "arm64;x86_64-apple-darwin": "Darwin",
  "arm64-apple-ios": "iOS",
  "arm64-apple-ios-sim": "iOS",
  "arm64-apple-tvos": "tvOS",
  // "x86_64-apple-tvos": "appletvos",
  "arm64-apple-tvos-sim": "tvOS",
  "arm64-apple-visionos": "visionOS",
  "arm64-apple-visionos-sim": "visionOS",
} satisfies Record<AppleTriplet, CMakeSystemName>;

type AppleArchitecture = "arm64" | "x86_64" | "arm64;x86_64";

export const APPLE_ARCHITECTURES = {
  "x86_64-apple-darwin": "x86_64",
  "arm64-apple-darwin": "arm64",
  "arm64;x86_64-apple-darwin": "arm64;x86_64",
  "arm64-apple-ios": "arm64",
  "arm64-apple-ios-sim": "arm64",
  "arm64-apple-tvos": "arm64",
  // "x86_64-apple-tvos": "x86_64",
  "arm64-apple-tvos-sim": "arm64",
  "arm64-apple-visionos": "arm64",
  "arm64-apple-visionos-sim": "arm64",
} satisfies Record<AppleTriplet, AppleArchitecture>;

export function getAppleSDKPath(triplet: AppleTriplet) {
  return cp
    .spawnSync(
      "xcrun",
      ["--sdk", XCODE_SDK_NAMES[triplet], "--show-sdk-path"],
      {
        encoding: "utf-8",
      }
    )
    .stdout.trim();
}

export function createPlistContent(values: Record<string, string>) {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
    '<plist version="1.0">',
    "<dict>",
    ...Object.entries(values).flatMap(([key, value]) => [
      `<key>${key}</key>`,
      `<string>${value}</string>`,
    ]),
    "</dict>",
    "</plist>",
  ].join("\n");
}

type AppleConfigureOptions = {
  triplet: AppleTriplet;
};

export function getAppleConfigureCmakeArgs({ triplet }: AppleConfigureOptions) {
  assert(isAppleTriplet(triplet));
  const sdkPath = getAppleSDKPath(triplet);
  const systemName = CMAKE_SYSTEM_NAMES[triplet];

  return [
    // Use the XCode as generator for Apple platforms
    "-G",
    "Xcode",
    "-D",
    `CMAKE_SYSTEM_NAME=${systemName}`,
    // Set the SDK path for the target platform
    "-D",
    `CMAKE_OSX_SYSROOT=${sdkPath}`,
    // Set the target architecture
    "-D",
    `CMAKE_OSX_ARCHITECTURES=${APPLE_ARCHITECTURES[triplet]}`,
  ];
}

export function getAppleBuildArgs() {
  // We expect the final application to sign these binaries
  return ["CODE_SIGNING_ALLOWED=NO"];
}

type XCframeworkOptions = {
  frameworkPaths: string[];
  outputPath: string;
  autoLink: boolean;
};

export function createFramework(libraryPath: string) {
  assert(fs.existsSync(libraryPath), `Library not found: ${libraryPath}`);
  // Write a info.plist file to the framework
  const libraryName = path.basename(libraryPath, path.extname(libraryPath));
  const frameworkPath = path.join(
    path.dirname(libraryPath),
    `${libraryName}.framework`
  );
  // Create the framework from scratch
  fs.rmSync(frameworkPath, { recursive: true, force: true });
  fs.mkdirSync(frameworkPath);
  fs.mkdirSync(path.join(frameworkPath, "Headers"));
  // Create an empty Info.plist file
  fs.writeFileSync(
    path.join(frameworkPath, "Info.plist"),
    createPlistContent({
      CFBundleDevelopmentRegion: "en",
      CFBundleExecutable: libraryName,
      CFBundleIdentifier: `com.callstackincubator.node-api.${libraryName}`,
      CFBundleInfoDictionaryVersion: "6.0",
      CFBundleName: libraryName,
      CFBundlePackageType: "FMWK",
      CFBundleShortVersionString: "1.0",
      CFBundleVersion: "1",
      NSPrincipalClass: "",
    }),
    "utf8"
  );
  const newLibraryPath = path.join(frameworkPath, libraryName);
  fs.renameSync(libraryPath, newLibraryPath);
  // Update the name of the library
  // Leaving this out for now, since it will be renamed when copied anyway
  // cp.spawnSync("install_name_tool", [
  //   "-id",
  //   `@rpath/${libraryName}.framework/${libraryName}`,
  //   newLibraryPath,
  // ]);
  return frameworkPath;
}

export async function createXCframework({
  frameworkPaths,
  outputPath,
  autoLink,
}: XCframeworkOptions) {
  // Delete any existing xcframework to prevent the error:
  // - A library with the identifier 'macos-arm64' already exists.
  // Ideally, it would only be necessary to delete the specific platform+arch, to allow selectively building from source.
  fs.rmSync(outputPath, { recursive: true, force: true });

  await spawn(
    "xcodebuild",
    [
      "-create-xcframework",
      ...frameworkPaths.flatMap((p) => ["-framework", p]),
      "-output",
      outputPath,
    ],
    {
      outputMode: "buffered",
    }
  );
  if (autoLink) {
    // Write a file to mark the xcframework is a Node-API module
    // TODO: Consider including this in the Info.plist file instead
    fs.writeFileSync(
      path.join(outputPath, "react-native-node-api-module"),
      "",
      "utf8"
    );
  }
}

/**
 * Determine the filename of the xcframework based on the framework paths.
 * Ensuring that all framework paths have the same base name.
 */
export function determineXCFrameworkFilename(frameworkPaths: string[]) {
  const frameworkNames = frameworkPaths.map((p) =>
    path.basename(p, path.extname(p))
  );
  const candidates = new Set<string>(frameworkNames);
  assert(
    candidates.size === 1,
    "Expected all frameworks to have the same name"
  );
  const [name] = candidates;
  return `${name}.xcframework`;
}
