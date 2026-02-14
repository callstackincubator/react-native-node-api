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

/** Serialize a plist object and write it to the given path. */
async function writeInfoPlist({
  path: infoPlistPath,
  plist: plistDict,
}: {
  path: string;
  plist: Record<string, unknown>;
}) {
  await fs.promises.writeFile(infoPlistPath, plist.build(plistDict), "utf8");
}

/** Build and write the framework Info.plist to the given path. */
async function writeFrameworkInfoPlist({
  path: infoPlistPath,
  libraryName,
  bundleIdentifier,
}: {
  path: string;
  libraryName: string;
  bundleIdentifier?: string;
}) {
  await writeInfoPlist({
    path: infoPlistPath,
    plist: {
      CFBundleDevelopmentRegion: "en",
      CFBundleExecutable: libraryName,
      CFBundleIdentifier: escapeBundleIdentifier(
        bundleIdentifier ?? `com.callstackincubator.node-api.${libraryName}`,
      ),
      CFBundleInfoDictionaryVersion: "6.0",
      CFBundleName: libraryName,
      CFBundlePackageType: "FMWK",
      CFBundleShortVersionString: "1.0",
      CFBundleVersion: "1",
      NSPrincipalClass: "",
    },
  });
}

/** Update the library binary’s install name so it resolves correctly at load time. */
async function updateLibraryInstallName({
  binaryPath,
  libraryName,
}: {
  binaryPath: string;
  libraryName: string;
}) {
  await spawn(
    "install_name_tool",
    ["-id", `@rpath/${libraryName}.framework/${libraryName}`, binaryPath],
    { outputMode: "buffered" },
  );
}

type CreateAppleFrameworkOptions = {
  libraryPath: string;
  kind: "flat" | "versioned";
  bundleIdentifier?: string;
};

/**
 * Creates a flat (non-versioned) .framework bundle:
 * MyFramework.framework/MyFramework, Info.plist, Headers/
 */
async function createFlatFramework({
  libraryPath,
  frameworkPath,
  libraryName,
  bundleIdentifier,
}: {
  libraryPath: string;
  frameworkPath: string;
  libraryName: string;
  bundleIdentifier?: string;
}): Promise<string> {
  await fs.promises.mkdir(frameworkPath);
  await fs.promises.mkdir(path.join(frameworkPath, "Headers"));
  await writeFrameworkInfoPlist({
    path: path.join(frameworkPath, "Info.plist"),
    libraryName,
    bundleIdentifier,
  });
  const newLibraryPath = path.join(frameworkPath, libraryName);
  // TODO: Consider copying the library instead of renaming it
  await fs.promises.rename(libraryPath, newLibraryPath);
  await updateLibraryInstallName({
    binaryPath: newLibraryPath,
    libraryName,
  });
  return frameworkPath;
}

/**
 * Version identifier for the single version we create.
 * Apple uses A, B, ... for major versions; we only ever create one version.
 */
const VERSIONED_FRAMEWORK_VERSION = "A";

/**
 * Creates a versioned .framework bundle (Versions/Current convention):
 * MyFramework.framework/
 *   MyFramework -> Versions/Current/MyFramework
 *   Resources -> Versions/Current/Resources
 *   Headers -> Versions/Current/Headers
 *   Versions/
 *     A/MyFramework, Resources/Info.plist, Headers/
 *     Current -> A
 * See: https://developer.apple.com/library/archive/documentation/MacOSX/Conceptual/BPFrameworks/Concepts/FrameworkAnatomy.html
 */
async function createVersionedFramework({
  libraryPath,
  frameworkPath,
  libraryName,
  bundleIdentifier,
}: {
  libraryPath: string;
  frameworkPath: string;
  libraryName: string;
  bundleIdentifier?: string;
}): Promise<string> {
  const versionsDir = path.join(frameworkPath, "Versions");
  const versionDir = path.join(versionsDir, VERSIONED_FRAMEWORK_VERSION);
  const versionResourcesDir = path.join(versionDir, "Resources");
  const versionHeadersDir = path.join(versionDir, "Headers");

  await fs.promises.mkdir(versionResourcesDir, { recursive: true });
  await fs.promises.mkdir(versionHeadersDir, { recursive: true });

  await writeFrameworkInfoPlist({
    path: path.join(versionResourcesDir, "Info.plist"),
    libraryName,
    bundleIdentifier,
  });

  const versionBinaryPath = path.join(versionDir, libraryName);
  await fs.promises.rename(libraryPath, versionBinaryPath);
  await updateLibraryInstallName({
    binaryPath: versionBinaryPath,
    libraryName,
  });

  const currentLink = path.join(versionsDir, "Current");
  await fs.promises.symlink(VERSIONED_FRAMEWORK_VERSION, currentLink);

  await fs.promises.symlink(
    path.join("Versions", "Current", "Resources"),
    path.join(frameworkPath, "Resources"),
  );
  await fs.promises.symlink(
    path.join("Versions", "Current", "Headers"),
    path.join(frameworkPath, "Headers"),
  );
  await fs.promises.symlink(
    path.join("Versions", "Current", libraryName),
    path.join(frameworkPath, libraryName),
  );

  return frameworkPath;
}

export async function createAppleFramework({
  libraryPath,
  kind,
  bundleIdentifier,
}: CreateAppleFrameworkOptions) {
  assert(fs.existsSync(libraryPath), `Library not found: ${libraryPath}`);
  const libraryName = path.basename(libraryPath, path.extname(libraryPath));
  const frameworkPath = path.join(
    path.dirname(libraryPath),
    `${libraryName}.framework`,
  );
  await fs.promises.rm(frameworkPath, { recursive: true, force: true });

  if (kind === "versioned") {
    return createVersionedFramework({
      libraryPath,
      frameworkPath,
      libraryName,
      bundleIdentifier,
    });
  } else if (kind === "flat") {
    return createFlatFramework({
      libraryPath,
      frameworkPath,
      libraryName,
      bundleIdentifier,
    });
  } else {
    throw new Error(`Unexpected framework kind: ${kind as string}`);
  }
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
    fs.mkdtempSync(path.join(os.tmpdir(), "node-api-lipo-output-")),
  );
  const outputPath = path.join(lipoParentPath, filename);
  await spawn("lipo", ["-create", "-output", outputPath, ...libraryPaths], {
    outputMode: "buffered",
  });
  assert(fs.existsSync(outputPath), "Expected lipo output path to exist");
  return outputPath;
}
