import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

import plist from "@expo/plist";
import { spawn } from "@react-native-node-api/cli-utils";

import { determineLibraryBasename } from "../path-utils.js";

type XCframeworkOptions = {
  frameworkPaths: string[];
  outputPath: string;
  autoLink: boolean;
};

/**
 * Escapes any input to match a CFBundleIdentifier
 * See https://developer.apple.com/documentation/bundleresources/information-property-list/cfbundleidentifier
 */
export function escapeBundleIdentifier(input: string) {
  return input.replace(/[^A-Za-z0-9-.]/g, "-");
}

export async function createAppleFramework(
  libraryPath: string,
  versioned = false,
) {
  if (versioned) {
    // TODO: Add support for generating a Versions/Current/Resources/Info.plist convention framework
    throw new Error("Creating versioned frameworks is not supported yet");
  }
  assert(fs.existsSync(libraryPath), `Library not found: ${libraryPath}`);
  // Write a info.plist file to the framework
  const libraryName = path.basename(libraryPath, path.extname(libraryPath));
  const frameworkPath = path.join(
    path.dirname(libraryPath),
    `${libraryName}.framework`,
  );
  // Create the framework from scratch
  await fs.promises.rm(frameworkPath, { recursive: true, force: true });
  await fs.promises.mkdir(frameworkPath);
  await fs.promises.mkdir(path.join(frameworkPath, "Headers"));
  // Create an empty Info.plist file
  await fs.promises.writeFile(
    path.join(frameworkPath, "Info.plist"),
    plist.build({
      CFBundleDevelopmentRegion: "en",
      CFBundleExecutable: libraryName,
      CFBundleIdentifier: `com.callstackincubator.node-api.${escapeBundleIdentifier(libraryName)}`,
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
  await fs.promises.rename(libraryPath, newLibraryPath);
  // Update the name of the library
  await spawn(
    "install_name_tool",
    ["-id", `@rpath/${libraryName}.framework/${libraryName}`, newLibraryPath],
    {
      outputMode: "buffered",
    },
  );
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
      ...frameworkPaths.flatMap((frameworkPath) => {
        const debugSymbolPath = frameworkPath + ".dSYM";
        if (fs.existsSync(debugSymbolPath)) {
          return [
            "-framework",
            frameworkPath,
            "-debug-symbols",
            debugSymbolPath,
          ];
        } else {
          return ["-framework", frameworkPath];
        }
      }),
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
  assert(
    libraryPaths.length > 0,
    "Expected at least one library to create a universal library",
  );
  // Determine the output path
  const filenames = new Set(libraryPaths.map((p) => path.basename(p)));
  assert(
    filenames.size === 1,
    `Expected libraries to have the same name, but got: ${[...filenames].join(
      ", ",
    )}`,
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
