import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs";

import plist from "@expo/plist";
import * as zod from "zod";

import { spawn } from "@react-native-node-api/cli-utils";

import { getLatestMtime, getLibraryName } from "../path-utils.js";
import {
  getLinkedModuleOutputPath,
  LinkModuleOptions,
  LinkModuleResult,
} from "./link-modules.js";

/**
 * Reads and parses a plist file, converting it to XML format if needed.
 */
export async function readAndParsePlist(plistPath: string): Promise<unknown> {
  assert(fs.existsSync(plistPath), `Expected an Info.plist: ${plistPath}`);
  // Try reading the file to see if it is already in XML format
  try {
    const contents = await fs.promises.readFile(plistPath, "utf-8");
    if (contents.startsWith("<?xml")) {
      return plist.parse(contents) as unknown;
    }

    try {
      // Convert to XML format if needed
      assert(
        process.platform === "darwin",
        "Updating Info.plist files are not supported on this platform",
      );
      await spawn("plutil", ["-convert", "xml1", plistPath], {
        outputMode: "inherit",
      });
    } catch (cause) {
      throw new Error(`Failed to convert plist to XML: ${plistPath}`, {
        cause,
      });
    }

    return plist.parse(
      // Read it again now that it is in XML format
      await fs.promises.readFile(plistPath, "utf-8"),
    ) as unknown;
  } catch (cause) {
    throw new Error(`Failed to read and parse plist at path "${plistPath}"`, {
      cause,
    });
  }
}

// Using a looseObject to allow additional fields that we don't know about
const XcframeworkInfoSchema = zod.looseObject({
  AvailableLibraries: zod.array(
    zod.looseObject({
      BinaryPath: zod.string(),
      LibraryIdentifier: zod.string(),
      LibraryPath: zod.string(),
    }),
  ),
  CFBundlePackageType: zod.literal("XFWK"),
  XCFrameworkFormatVersion: zod.literal("1.0"),
});

export async function readXcframeworkInfo(infoPlistPath: string) {
  const infoPlist = await readAndParsePlist(infoPlistPath);
  return XcframeworkInfoSchema.parse(infoPlist);
}

export async function writeXcframeworkInfo(
  xcframeworkPath: string,
  info: zod.infer<typeof XcframeworkInfoSchema>,
) {
  const infoPlistPath = path.join(xcframeworkPath, "Info.plist");
  const infoPlistXml = plist.build(info);
  await fs.promises.writeFile(infoPlistPath, infoPlistXml, "utf-8");
}

const FrameworkInfoSchema = zod.looseObject({
  CFBundlePackageType: zod.literal("FMWK"),
  CFBundleInfoDictionaryVersion: zod.literal("6.0"),
  CFBundleExecutable: zod.string(),
});

export async function readFrameworkInfo(infoPlistPath: string) {
  const infoPlist = await readAndParsePlist(infoPlistPath);
  return FrameworkInfoSchema.parse(infoPlist);
}

export async function writeFrameworkInfo(
  infoPlistPath: string,
  info: zod.infer<typeof FrameworkInfoSchema>,
) {
  const infoPlistXml = plist.build(info);
  await fs.promises.writeFile(infoPlistPath, infoPlistXml, "utf-8");
}

type LinkFrameworkOptions = {
  frameworkPath: string;
  newLibraryName: string;
};

export async function linkFramework({
  frameworkPath,
  newLibraryName,
}: LinkFrameworkOptions) {
  assert.equal(
    process.platform,
    "darwin",
    "Linking Apple frameworks are only supported on macOS",
  );
  assert(
    fs.existsSync(frameworkPath),
    `Expected framework at '${frameworkPath}'`,
  );
  if (fs.existsSync(path.join(frameworkPath, "Versions"))) {
    await linkVersionedFramework({ frameworkPath, newLibraryName });
  } else {
    await linkFlatFramework({ frameworkPath, newLibraryName });
  }
}

export async function linkFlatFramework({
  frameworkPath,
  newLibraryName,
}: LinkFrameworkOptions) {
  assert.equal(
    process.platform,
    "darwin",
    "Linking Apple addons are only supported on macOS",
  );
  const frameworkInfoPath = path.join(frameworkPath, "Info.plist");
  const frameworkInfo = await readFrameworkInfo(frameworkInfoPath);
  // Update install name
  await spawn(
    "install_name_tool",
    [
      "-id",
      `@rpath/${newLibraryName}.framework/${newLibraryName}`,
      frameworkInfo.CFBundleExecutable,
    ],
    {
      outputMode: "buffered",
      cwd: frameworkPath,
    },
  );
  await writeFrameworkInfo(frameworkInfoPath, {
    ...frameworkInfo,
    CFBundleExecutable: newLibraryName,
  });
  // Rename the actual binary
  await fs.promises.rename(
    path.join(frameworkPath, frameworkInfo.CFBundleExecutable),
    path.join(frameworkPath, newLibraryName),
  );
  // Rename the framework directory
  await fs.promises.rename(
    frameworkPath,
    path.join(path.dirname(frameworkPath), `${newLibraryName}.framework`),
  );
}

export async function linkVersionedFramework({
  frameworkPath,
  newLibraryName,
}: LinkFrameworkOptions) {
  assert.equal(
    process.platform,
    "darwin",
    "Linking Apple addons are only supported on macOS",
  );
  const frameworkInfoPath = path.join(
    frameworkPath,
    "Versions",
    "Current",
    "Resources",
    "Info.plist",
  );
  const frameworkInfo = await readFrameworkInfo(frameworkInfoPath);
  // Update install name
  await spawn(
    "install_name_tool",
    [
      "-id",
      `@rpath/${newLibraryName}.framework/${newLibraryName}`,
      frameworkInfo.CFBundleExecutable,
    ],
    {
      outputMode: "buffered",
      cwd: frameworkPath,
    },
  );
  await writeFrameworkInfo(frameworkInfoPath, {
    ...frameworkInfo,
    CFBundleExecutable: newLibraryName,
  });
  // Rename the actual binary
  const existingBinaryPath = path.join(
    frameworkPath,
    frameworkInfo.CFBundleExecutable,
  );
  const stat = await fs.promises.lstat(existingBinaryPath);
  assert(
    stat.isSymbolicLink(),
    `Expected binary to be a symlink: ${existingBinaryPath}`,
  );
  const realBinaryPath = await fs.promises.realpath(existingBinaryPath);
  const newRealBinaryPath = path.join(
    path.dirname(realBinaryPath),
    newLibraryName,
  );
  // Rename the real binary file
  await fs.promises.rename(realBinaryPath, newRealBinaryPath);
  // Remove the old binary symlink
  await fs.promises.unlink(existingBinaryPath);
  // Create a new symlink with the new name
  const newBinarySymlinkTarget = path.join(
    "Versions",
    "Current",
    newLibraryName,
  );
  assert(
    fs.existsSync(path.join(frameworkPath, newBinarySymlinkTarget)),
    "Expected new binary to exist",
  );
  await fs.promises.symlink(
    newBinarySymlinkTarget,
    path.join(frameworkPath, newLibraryName),
  );

  // Rename the framework directory
  await fs.promises.rename(
    frameworkPath,
    path.join(path.dirname(frameworkPath), `${newLibraryName}.framework`),
  );
}

export async function linkXcframework({
  platform,
  modulePath,
  incremental,
  naming,
}: LinkModuleOptions): Promise<LinkModuleResult> {
  assert.equal(
    process.platform,
    "darwin",
    "Linking Apple addons are only supported on macOS",
  );
  // Copy the xcframework to the output directory and rename the framework and binary
  const newLibraryName = getLibraryName(modulePath, naming);
  const outputPath = getLinkedModuleOutputPath(platform, modulePath, naming);

  if (incremental && fs.existsSync(outputPath)) {
    const moduleModified = getLatestMtime(modulePath);
    const outputModified = getLatestMtime(outputPath);
    if (moduleModified < outputModified) {
      return {
        originalPath: modulePath,
        libraryName: newLibraryName,
        outputPath,
        skipped: true,
      };
    }
  }
  // Delete any existing xcframework (or xcodebuild will try to amend it)
  await fs.promises.rm(outputPath, { recursive: true, force: true });
  // Copy the existing xcframework to the output path
  await fs.promises.cp(modulePath, outputPath, {
    recursive: true,
    verbatimSymlinks: true,
  });

  const info = await readXcframeworkInfo(path.join(outputPath, "Info.plist"));

  await Promise.all(
    info.AvailableLibraries.map(async (framework) => {
      const frameworkPath = path.join(
        outputPath,
        framework.LibraryIdentifier,
        framework.LibraryPath,
      );
      await linkFramework({ frameworkPath, newLibraryName });
    }),
  );

  await writeXcframeworkInfo(outputPath, {
    ...info,
    AvailableLibraries: info.AvailableLibraries.map((library) => {
      return {
        ...library,
        LibraryPath: `${newLibraryName}.framework`,
        BinaryPath: `${newLibraryName}.framework/${newLibraryName}`,
      };
    }),
  });

  // Delete any leftover "magic file"
  await fs.promises.rm(path.join(outputPath, "react-native-node-api-module"), {
    force: true,
  });

  return {
    originalPath: modulePath,
    libraryName: newLibraryName,
    outputPath,
    skipped: false,
  };
}
