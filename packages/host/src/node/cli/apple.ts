import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";

import plist from "@expo/plist";
import { spawn } from "@react-native-node-api/cli-utils";

import { getLatestMtime, getLibraryName } from "../path-utils.js";
import {
  getLinkedModuleOutputPath,
  LinkModuleOptions,
  LinkModuleResult,
} from "./link-modules.js";

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
  const outputPath = getLinkedModuleOutputPath(platform, modulePath, naming);
  const tempPath = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), `react-native-node-api-${newLibraryName}-`),
  );
  try {
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
    await fs.promises.cp(modulePath, tempPath, { recursive: true });

    // Following extracted function mimics `glob("*/*.framework/")`
    function globFrameworkDirs<T>(
      startPath: string,
      fn: (parentPath: string, name: string) => Promise<T>,
    ) {
      return fs
        .readdirSync(startPath, { withFileTypes: true })
        .filter((tripletEntry) => tripletEntry.isDirectory())
        .flatMap((tripletEntry) => {
          const tripletPath = path.join(startPath, tripletEntry.name);
          return fs
            .readdirSync(tripletPath, { withFileTypes: true })
            .filter(
              (frameworkEntry) =>
                frameworkEntry.isDirectory() &&
                path.extname(frameworkEntry.name) === ".framework",
            )
            .flatMap(
              async (frameworkEntry) =>
                await fn(tripletPath, frameworkEntry.name),
            );
        });
    }

    const frameworkPaths = await Promise.all(
      globFrameworkDirs(tempPath, async (tripletPath, frameworkEntryName) => {
        const frameworkPath = path.join(tripletPath, frameworkEntryName);
        const oldLibraryName = path.basename(frameworkEntryName, ".framework");
        const oldLibraryPath = path.join(frameworkPath, oldLibraryName);
        const newFrameworkPath = path.join(
          tripletPath,
          `${newLibraryName}.framework`,
        );
        const newLibraryPath = path.join(newFrameworkPath, newLibraryName);
        assert(
          fs.existsSync(oldLibraryPath),
          `Expected a library at '${oldLibraryPath}'`,
        );
        // Rename the library
        await fs.promises.rename(
          oldLibraryPath,
          // Cannot use newLibraryPath here, because the framework isn't renamed yet
          path.join(frameworkPath, newLibraryName),
        );
        // Rename the framework
        await fs.promises.rename(frameworkPath, newFrameworkPath);
        // Expect the library in the new location
        assert(fs.existsSync(newLibraryPath));
        // Update the binary
        await spawn(
          "install_name_tool",
          [
            "-id",
            `@rpath/${newLibraryName}.framework/${newLibraryName}`,
            newLibraryPath,
          ],
          {
            outputMode: "buffered",
          },
        );
        // Update the Info.plist file for the framework
        await updateInfoPlist({
          frameworkPath: newFrameworkPath,
          oldLibraryName,
          newLibraryName,
        });
        return newFrameworkPath;
      }),
    );

    // Create a new xcframework from the renamed frameworks
    await spawn(
      "xcodebuild",
      [
        "-create-xcframework",
        ...frameworkPaths.flatMap((frameworkPath) => [
          "-framework",
          frameworkPath,
        ]),
        "-output",
        outputPath,
      ],
      {
        outputMode: "buffered",
      },
    );

    return {
      originalPath: modulePath,
      libraryName: newLibraryName,
      outputPath,
      skipped: false,
    };
  } finally {
    await fs.promises.rm(tempPath, { recursive: true, force: true });
  }
}
