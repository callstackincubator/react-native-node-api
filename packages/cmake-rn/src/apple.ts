import assert from "node:assert/strict";

import { AppleTriplet, isAppleTriplet } from "react-native-node-api";

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
  const systemName = CMAKE_SYSTEM_NAMES[triplet];

  return [
    // Use the XCode as generator for Apple platforms
    "-G",
    "Xcode",
    "-D",
    `CMAKE_SYSTEM_NAME=${systemName}`,
    // Set the SDK path for the target platform
    "-D",
    `CMAKE_OSX_SYSROOT=${XCODE_SDK_NAMES[triplet]}`,
    // Set the target architecture
    "-D",
    `CMAKE_OSX_ARCHITECTURES=${APPLE_ARCHITECTURES[triplet]}`,
  ];
}

export function getAppleBuildArgs() {
  // We expect the final application to sign these binaries
  return ["CODE_SIGNING_ALLOWED=NO"];
}
