import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { oraPromise } from "ora";
import chalk from "chalk";

import {
  createNodeLibsDirectory,
  determineNodeLibsFilename,
  NodeTriplet as Target,
} from "react-native-node-api";

import type { Platform } from "./types.js";
import { toDeclarationArguments } from "../cmake.js";
import { getNodeApiIncludeDirectories } from "../headers.js";

type NodeOpts = Record<string, unknown>;

function getLinkerFlags(target: Target): string {
  if (
    target === "arm64-apple-darwin" ||
    target === "x86_64-apple-darwin" ||
    target === "arm64;x86_64-apple-darwin"
  ) {
    return "-undefined dynamic_lookup";
  } else if (
    target === "linux" // TODO: Use the right triplet for Linux
  ) {
    return "-Wl,--unresolved-symbols=ignore-in-object-files";
  } else {
    throw new Error(
      `Determining linker flags for target ${target as string} is not implemented`,
    );
  }
}

export const platform: Platform<Target[], NodeOpts> = {
  id: "nodejs",
  name: "Node.js",
  targets: [
    "arm64-apple-darwin",
    "x86_64-apple-darwin",
    "arm64;x86_64-apple-darwin",
  ],
  defaultTargets() {
    if (process.platform === "darwin") {
      if (process.arch === "arm64") {
        return ["arm64-apple-darwin"];
      } else if (process.arch === "x64") {
        return ["x86_64-apple-darwin"];
      }
    }
    return [];
  },
  amendCommand(command) {
    return command;
  },
  configureArgs({ target }) {
    return [
      "-G",
      "Ninja",
      ...toDeclarationArguments({
        // TODO: Make this names less "cmake-js" specific with an option to use the CMAKE_JS prefix
        CMAKE_JS_INC: getNodeApiIncludeDirectories(),
        CMAKE_SHARED_LINKER_FLAGS: getLinkerFlags(target),
      }),
    ];
  },
  buildArgs() {
    return [];
  },
  isSupportedByHost() {
    const { ANDROID_HOME } = process.env;
    return typeof ANDROID_HOME === "string" && fs.existsSync(ANDROID_HOME);
  },
  async postBuild({ outputPath, targets }, { autoLink }) {
    // TODO: Include `configuration` in the output path
    const libraryPathByTriplet = Object.fromEntries(
      await Promise.all(
        targets.map(async ({ target, outputPath }) => {
          assert(
            fs.existsSync(outputPath),
            `Expected a directory at ${outputPath}`,
          );
          // Expect binary file(s), either .node or .so
          const dirents = await fs.promises.readdir(outputPath, {
            withFileTypes: true,
          });
          const result = dirents
            .filter(
              (dirent) =>
                dirent.isFile() &&
                (dirent.name.endsWith(".so") ||
                  dirent.name.endsWith(".dylib") ||
                  dirent.name.endsWith(".node")),
            )
            .map((dirent) => path.join(dirent.parentPath, dirent.name));
          assert.equal(result.length, 1, "Expected exactly one library file");
          return [target, result[0]] as const;
        }),
      ),
    ) as Record<Target, string>;
    const nodeLibsFilename = determineNodeLibsFilename(
      Object.values(libraryPathByTriplet),
    );
    const nodeLibsOutputPath = path.resolve(outputPath, nodeLibsFilename);

    await oraPromise(
      createNodeLibsDirectory({
        outputPath: nodeLibsOutputPath,
        libraryPathByTriplet,
        autoLink,
      }),
      {
        text: "Assembling Node.js libs directory",
        successText: `Node.js libs directory assembled into ${chalk.dim(
          path.relative(process.cwd(), nodeLibsOutputPath),
        )}`,
        failText: ({ message }) =>
          `Failed to assemble Node.js libs directory: ${message}`,
      },
    );
  },
};
