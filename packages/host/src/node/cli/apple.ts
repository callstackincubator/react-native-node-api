import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs";

import plist from "@expo/plist";
import * as xcode from "@bacons/xcode";
import * as xcodeJson from "@bacons/xcode/json";
import * as zod from "zod";

import { chalk, spawn } from "@react-native-node-api/cli-utils";

import { getLatestMtime, getLibraryName } from "../path-utils.js";
import {
  getLinkedModuleOutputPath,
  LinkModuleOptions,
  LinkModuleResult,
} from "./link-modules.js";
import { findXcodeProject } from "./xcode-helpers.js";

const PACKAGE_ROOT = path.resolve(__dirname, "..", "..", "..");
const CLI_PATH = path.resolve(PACKAGE_ROOT, "bin", "react-native-node-api.mjs");
const BUILD_PHASE_PREFIX = "[Node-API]";
const BUILD_PHASE_NAME = `${BUILD_PHASE_PREFIX} Copy, rename and sign frameworks`;

export async function ensureXcodeBuildPhase(fromPath: string) {
  // Locate the app's Xcode project
  const xcodeProjectPath = await findXcodeProject(fromPath);
  const pbxprojPath = path.join(xcodeProjectPath, "project.pbxproj");
  assert(
    fs.existsSync(pbxprojPath),
    `Expected a project.pbxproj file at '${pbxprojPath}'`,
  );
  const xcodeProject = xcode.XcodeProject.open(pbxprojPath);
  // Create a build phase on the main target to stage and rename the addon Xcframeworks
  const mainTarget = xcodeProject.rootObject.getMainAppTarget();
  assert(mainTarget, "Unable to find a main target");

  const existingBuildPhases = mainTarget.props.buildPhases.filter((phase) =>
    phase.getDisplayName().startsWith(BUILD_PHASE_PREFIX),
  );

  for (const existingBuildPhase of existingBuildPhases) {
    console.log(
      "Removing existing build phase:",
      chalk.dim(existingBuildPhase.getDisplayName()),
    );
    existingBuildPhase.removeFromProject();
  }

  mainTarget.createBuildPhase(xcode.PBXShellScriptBuildPhase, {
    name: BUILD_PHASE_NAME,
    shellScript: [
      "set -e",
      `'${process.execPath}' '${CLI_PATH}' link --apple '${fromPath}'`,
    ].join("\n"),
  });

  await fs.promises.writeFile(
    pbxprojPath,
    xcodeJson.build(xcodeProject.toJSON()),
    "utf8",
  );
}

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
      DebugSymbolsPath: zod.string().optional(),
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
  debugSymbolsPath?: string;
  newLibraryName: string;
};

export async function linkFramework(options: LinkFrameworkOptions) {
  const { frameworkPath } = options;
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
    await linkVersionedFramework(options);
  } else {
    await linkFlatFramework(options);
  }
}

export async function linkFlatFramework({
  frameworkPath,
  debugSymbolsPath,
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
  const newFrameworkPath = path.join(
    path.dirname(frameworkPath),
    `${newLibraryName}.framework`,
  );
  await fs.promises.rename(frameworkPath, newFrameworkPath);

  if (debugSymbolsPath) {
    const frameworkDebugSymbolsPath = path.join(
      debugSymbolsPath,
      `${path.basename(frameworkPath)}.dSYM`,
    );
    if (fs.existsSync(frameworkDebugSymbolsPath)) {
      // Remove existing DWARF data
      await fs.promises.rm(frameworkDebugSymbolsPath, {
        recursive: true,
        force: true,
      });
      // Rebuild DWARF data
      await spawn(
        "dsymutil",
        [
          path.join(newFrameworkPath, newLibraryName),
          "-o",
          path.join(debugSymbolsPath, newLibraryName + ".dSYM"),
        ],
        {
          outputMode: "buffered",
        },
      );
    }
  }
}

async function restoreSymlink(target: string, linkPath: string) {
  if (
    !fs.existsSync(linkPath) &&
    fs.existsSync(path.resolve(path.dirname(linkPath), target))
  ) {
    await fs.promises.symlink(target, linkPath);
  }
}

async function guessCurrentFrameworkVersion(frameworkPath: string) {
  const versionsPath = path.join(frameworkPath, "Versions");
  assert(
    fs.existsSync(versionsPath),
    "Expected 'Versions' directory inside versioned framework",
  );

  const versionDirectoryEntries = await fs.promises.readdir(versionsPath, {
    withFileTypes: true,
  });
  const versions = versionDirectoryEntries
    .filter((dirent) => dirent.isDirectory())
    .map((dirent) => dirent.name);
  assert.equal(
    versions.length,
    1,
    `Expected exactly one directory in ${versionsPath}, found ${JSON.stringify(versions)}`,
  );
  const [version] = versions;
  return version;
}

/**
 * NPM packages aren't preserving internal symlinks inside versioned frameworks.
 * This function attempts to restore those.
 */
export async function restoreVersionedFrameworkSymlinks(frameworkPath: string) {
  const currentVersionName = await guessCurrentFrameworkVersion(frameworkPath);
  const currentVersionPath = path.join(frameworkPath, "Versions", "Current");
  await restoreSymlink(currentVersionName, currentVersionPath);
  await restoreSymlink(
    "Versions/Current/Resources",
    path.join(frameworkPath, "Resources"),
  );
  await restoreSymlink(
    "Versions/Current/Headers",
    path.join(frameworkPath, "Headers"),
  );

  const { CFBundleExecutable: executableName } = await readFrameworkInfo(
    path.join(currentVersionPath, "Resources", "Info.plist"),
  );

  await restoreSymlink(
    path.join("Versions", "Current", executableName),
    path.join(frameworkPath, executableName),
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

  await restoreVersionedFrameworkSymlinks(frameworkPath);

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
      await linkFramework({
        frameworkPath,
        newLibraryName,
        debugSymbolsPath: framework.DebugSymbolsPath
          ? path.join(
              outputPath,
              framework.LibraryIdentifier,
              framework.DebugSymbolsPath,
            )
          : undefined,
      });
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
