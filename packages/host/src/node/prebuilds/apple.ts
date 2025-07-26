import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import cp from "node:child_process";

import { spawn } from "bufout";

import { AppleTriplet } from "./triplets.js";
import { determineLibraryBasename } from "../path-utils.js";

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
    "  <dict>",
    ...Object.entries(values).flatMap(([key, value]) => [
      `    <key>${key}</key>`,
      `    <string>${value}</string>`,
    ]),
    "  </dict>",
    "</plist>",
  ].join("\n");
}

type XCframeworkOptions = {
  frameworkPaths: string[];
  outputPath: string;
  autoLink: boolean;
};

export function createAppleFramework(libraryPath: string) {
  assert(fs.existsSync(libraryPath), `Library not found: ${libraryPath}`);
  // Write a info.plist file to the framework
  const libraryName = path.basename(libraryPath, path.extname(libraryPath));
  const frameworkPath = path.join(
    path.dirname(libraryPath),
    `${libraryName}.framework`,
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
    "utf8",
  );
  const newLibraryPath = path.join(frameworkPath, libraryName);
  // TODO: Consider copying the library instead of renaming it
  fs.renameSync(libraryPath, newLibraryPath);
  // Update the name of the library
  cp.spawnSync("install_name_tool", [
    "-id",
    `@rpath/${libraryName}.framework/${libraryName}`,
    newLibraryPath,
  ]);
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

  // Xcodebuild requires the output path to end with ".xcframework"
  const xcodeOutputPath =
    path.extname(outputPath) === ".xcframework"
      ? outputPath
      : `${outputPath}.xcframework`;

  await spawn(
    "xcodebuild",
    [
      "-create-xcframework",
      ...frameworkPaths.flatMap((p) => ["-framework", p]),
      "-output",
      xcodeOutputPath,
    ],
    {
      outputMode: "buffered",
    },
  );
  if (xcodeOutputPath !== outputPath) {
    // Rename the xcframework to the original output path
    await fs.promises.rename(xcodeOutputPath, outputPath);
  }
  if (autoLink) {
    // Write a file to mark the xcframework is a Node-API module
    // TODO: Consider including this in the Info.plist file instead
    fs.writeFileSync(
      path.join(outputPath, "react-native-node-api-module"),
      "",
      "utf8",
    );
  }
}

/**
 * Determine the filename of the xcframework based on the framework paths.
 * Ensuring that all framework paths have the same base name.
 */
export function determineXCFrameworkFilename(
  frameworkPaths: string[],
  extension: ".xcframework" | ".apple.node" = ".xcframework",
) {
  const name = determineLibraryBasename(frameworkPaths);
  return `${name}${extension}`;
}

export async function createUniversalAppleLibrary(libraryPaths: string[]) {
  // Determine the output path
  const filenames = new Set(libraryPaths.map((p) => path.basename(p)));
  assert(
    filenames.size === 1,
    "Expected all darwin libraries to have the same name",
  );
  const [filename] = filenames;
  const lipoParentPath = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "ferric-lipo-output-")),
  );
  const outputPath = path.join(lipoParentPath, filename);
  await spawn("lipo", ["-create", "-output", outputPath, ...libraryPaths], {
    outputMode: "buffered",
  });
  assert(fs.existsSync(outputPath), "Expected lipo output path to exist");
  return outputPath;
}
