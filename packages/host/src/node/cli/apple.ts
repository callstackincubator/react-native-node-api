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
async function readAndParsePlist(plistPath: string): Promise<unknown> {
  try {
    // Convert to XML format if needed
    assert(
      process.platform === "darwin",
      "Updating Info.plist files are not supported on this platform",
    );
    // Try reading the file to see if it is already in XML format
    const contents = await fs.promises.readFile(plistPath, "utf-8");
    if (contents.startsWith("<?xml")) {
      return plist.parse(contents) as unknown;
    } else {
      await spawn("plutil", ["-convert", "xml1", plistPath], {
        outputMode: "inherit",
      });
      // Read it again
      return plist.parse(
        await fs.promises.readFile(plistPath, "utf-8"),
      ) as unknown;
    }
  } catch (error) {
    throw new Error(
      `Failed to convert plist at path "${plistPath}" to XML format`,
      { cause: error },
    );
  }
}

// Using a looseObject to allow additional fields that we don't know about
const XcframeworkInfoSchema = zod.looseObject({
  AvailableLibraries: zod.array(
    zod.object({
      BinaryPath: zod.string(),
      LibraryIdentifier: zod.string(),
      LibraryPath: zod.string(),
    }),
  ),
  CFBundlePackageType: zod.literal("XFWK"),
  XCFrameworkFormatVersion: zod.literal("1.0"),
});

export async function readXcframeworkInfo(xcframeworkPath: string) {
  const infoPlistPath = path.join(xcframeworkPath, "Info.plist");
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

export async function readFrameworkInfo(frameworkPath: string) {
  const infoPlistPath = path.join(frameworkPath, "Info.plist");
  const infoPlist = await readAndParsePlist(infoPlistPath);
  return FrameworkInfoSchema.parse(infoPlist);
}

export async function writeFrameworkInfo(
  frameworkPath: string,
  info: zod.infer<typeof FrameworkInfoSchema>,
) {
  const infoPlistPath = path.join(frameworkPath, "Info.plist");
  const infoPlistXml = plist.build(info);
  await fs.promises.writeFile(infoPlistPath, infoPlistXml, "utf-8");
}

export function determineInfoPlistPath(frameworkPath: string) {
  const checkedPaths = new Array<string>();

  // First, assume it is an "unversioned" framework that keeps its Info.plist in
  // the root. This is the convention for iOS, tvOS, and friends.
  let infoPlistPath = path.join(frameworkPath, "Info.plist");

  if (fs.existsSync(infoPlistPath)) {
    return infoPlistPath;
  }
  checkedPaths.push(infoPlistPath);

  // Next, assume it is a "versioned" framework that keeps its Info.plist
  // under a subdirectory. This is the convention for macOS.
  infoPlistPath = path.join(
    frameworkPath,
    "Versions/Current/Resources/Info.plist",
  );

  if (fs.existsSync(infoPlistPath)) {
    return infoPlistPath;
  }
  checkedPaths.push(infoPlistPath);

  throw new Error(
    [
      `Unable to locate an Info.plist file within framework. Checked the following paths:`,
      ...checkedPaths.map((checkedPath) => `- ${checkedPath}`),
    ].join("\n"),
  );
}

/**
 * Resolves the Info.plist file within a framework and reads its contents.
 */
export async function readInfoPlist(infoPlistPath: string) {
  try {
    const contents = await fs.promises.readFile(infoPlistPath, "utf-8");
    return plist.parse(contents) as Record<string, unknown>;
  } catch (cause) {
    throw new Error(`Unable to read Info.plist at path "${infoPlistPath}"`, {
      cause,
    });
  }
}

type UpdateInfoPlistOptions = {
  frameworkPath: string;
  oldLibraryName: string;
  newLibraryName: string;
};

/**
 * Update the Info.plist file of an xcframework to use the new library name.
 */
export async function updateInfoPlist({
  frameworkPath,
  oldLibraryName,
  newLibraryName,
}: UpdateInfoPlistOptions) {
  const infoPlistPath = determineInfoPlistPath(frameworkPath);

  // Convert to XML format if needed
  try {
    assert(
      process.platform === "darwin",
      "Updating Info.plist files are not supported on this platform",
    );
    await spawn("plutil", ["-convert", "xml1", infoPlistPath], {
      outputMode: "inherit",
    });
  } catch (error) {
    throw new Error(
      `Failed to convert Info.plist at path "${infoPlistPath}" to XML format`,
      { cause: error },
    );
  }

  const contents = await readInfoPlist(infoPlistPath);
  assert.equal(
    contents.CFBundleExecutable,
    oldLibraryName,
    "Unexpected CFBundleExecutable value in Info.plist",
  );
  contents.CFBundleExecutable = newLibraryName;
  await fs.promises.writeFile(infoPlistPath, plist.build(contents), "utf-8");
}

export async function linkXcframework({
  platform,
  modulePath,
  incremental,
  naming,
}: LinkModuleOptions): Promise<LinkModuleResult> {
  // Copy the xcframework to the output directory and rename the framework and binary
  const newLibraryName = getLibraryName(modulePath, naming);
  const newFrameworkRelativePath = `${newLibraryName}.framework`;
  const newBinaryRelativePath = `${newFrameworkRelativePath}/${newLibraryName}`;
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
  await fs.promises.cp(modulePath, outputPath, { recursive: true });

  const info = await readXcframeworkInfo(outputPath);

  await Promise.all(
    info.AvailableLibraries.map(async (framework) => {
      const frameworkPath = path.join(
        outputPath,
        framework.LibraryIdentifier,
        framework.LibraryPath,
      );
      assert(
        fs.existsSync(frameworkPath),
        `Expected framework at '${frameworkPath}'`,
      );
      const frameworkInfo = await readFrameworkInfo(frameworkPath);
      // Update install name
      await spawn(
        "install_name_tool",
        [
          "-id",
          `@rpath/${newBinaryRelativePath}`,
          frameworkInfo.CFBundleExecutable,
        ],
        {
          outputMode: "buffered",
          cwd: frameworkPath,
        },
      );
      await writeFrameworkInfo(frameworkPath, {
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
        path.join(path.dirname(frameworkPath), newFrameworkRelativePath),
      );
    }),
  );

  await writeXcframeworkInfo(outputPath, {
    ...info,
    AvailableLibraries: info.AvailableLibraries.map((library) => {
      return {
        ...library,
        BinaryPath: newBinaryRelativePath,
        LibraryPath: newFrameworkRelativePath,
      };
    }),
  });

  return {
    originalPath: modulePath,
    libraryName: newLibraryName,
    outputPath,
    skipped: false,
  };
}
