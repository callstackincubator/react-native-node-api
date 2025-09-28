import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import * as z from "zod";

import * as schemas from "./schemas.js";

/**
 * As per https://cmake.org/cmake/help/latest/manual/cmake-file-api.7.html#v1-reply-error-index
 */
export async function findCurrentReplyIndexPath(replyPath: string) {
  // If multiple index-*.json and/or error-*.json files are present,
  // the one with the largest name in lexicographic order,
  // excluding the index- or error- prefix, is the current index.

  const fileNames = (
    await Promise.all([
      Array.fromAsync(
        fs.promises.glob("error-*.json", {
          withFileTypes: false,
          cwd: replyPath,
        }),
      ),
      Array.fromAsync(
        fs.promises.glob("index-*.json", {
          withFileTypes: false,
          cwd: replyPath,
        }),
      ),
    ])
  ).flat();

  const [currentIndexFileName] = fileNames
    .sort((a, b) => {
      const strippedA = a.replace(/^(error|index)-/, "");
      const strippedB = b.replace(/^(error|index)-/, "");
      return strippedA.localeCompare(strippedB);
    })
    .reverse();

  assert(
    currentIndexFileName,
    `No index-*.json or error-*.json files found in ${replyPath}`,
  );

  return path.join(replyPath, currentIndexFileName);
}

export async function readReplyIndex(filePath: string) {
  assert(
    path.basename(filePath).startsWith("index-") &&
      path.extname(filePath) === ".json",
    "Expected a path to a index-*.json file",
  );
  const content = await fs.promises.readFile(filePath, "utf-8");
  return schemas.IndexReplyV1.parse(JSON.parse(content));
}

export function isReplyErrorIndexPath(filePath: string): boolean {
  return (
    path.basename(filePath).startsWith("error-") &&
    path.extname(filePath) === ".json"
  );
}

export async function readReplyErrorIndex(filePath: string) {
  assert(
    isReplyErrorIndexPath(filePath),
    "Expected a path to an error-*.json file",
  );
  const content = await fs.promises.readFile(filePath, "utf-8");
  return schemas.ReplyErrorIndex.parse(JSON.parse(content));
}

export async function readCodemodel(filePath: string) {
  assert(
    path.basename(filePath).startsWith("codemodel-") &&
      path.extname(filePath) === ".json",
    "Expected a path to a codemodel-*.json file",
  );
  const content = await fs.promises.readFile(filePath, "utf-8");
  return schemas.CodemodelV2.parse(JSON.parse(content));
}

/**
 * Call {@link createSharedStatelessQuery} to create a shared codemodel query before reading the current shared codemodel.
 */
export async function readCurrentSharedCodemodel(buildPath: string) {
  const replyPath = path.join(buildPath, `.cmake/api/v1/reply`);
  const replyIndexPath = await findCurrentReplyIndexPath(replyPath);

  // Check if this is an error index - they don't contain codemodel data
  if (isReplyErrorIndexPath(replyIndexPath)) {
    const errorIndex = await readReplyErrorIndex(replyIndexPath);
    const { reply } = errorIndex;
    const codemodelFile = reply["codemodel-v2"];

    if (
      codemodelFile &&
      "error" in codemodelFile &&
      typeof codemodelFile.error === "string"
    ) {
      throw new Error(
        `CMake failed to generate build system. Error in codemodel: ${codemodelFile.error}`,
      );
    }

    throw new Error(
      "CMake failed to generate build system. No codemodel available in error index.",
    );
  }

  const index = await readReplyIndex(replyIndexPath);
  const { reply } = index;
  const { "codemodel-v2": codemodelFile } = reply;
  assert(
    codemodelFile,
    "Expected a codemodel-v2 reply file - was a query created?",
  );
  if ("error" in codemodelFile && typeof codemodelFile.error === "string") {
    throw new Error(
      `Error reading codemodel-v2 reply file: ${codemodelFile.error}`,
    );
  }

  // Use ReplyFileReference schema to validate and parse the codemodel file
  const { kind, jsonFile } = schemas.ReplyFileReferenceV1.parse(codemodelFile);
  assert(kind === "codemodel", "Expected a codemodel file reference");

  const codemodelPath = path.join(buildPath, `.cmake/api/v1/reply`, jsonFile);
  return readCodemodel(codemodelPath);
}

export async function readCurrentTargets(
  buildPath: string,
  configuration: string,
) {
  const { configurations } = await readCurrentSharedCodemodel(buildPath);
  const relevantConfig =
    configurations.length === 1
      ? configurations[0]
      : configurations.find((config) => config.name === configuration);
  assert(
    relevantConfig,
    `Unable to locate "${configuration}" configuration found`,
  );
  return relevantConfig.targets;
}

export async function readTarget(
  targetPath: string,
  version: keyof typeof schemas.targetSchemaPerVersion,
): Promise<z.infer<(typeof schemas.targetSchemaPerVersion)[typeof version]>> {
  assert(
    path.basename(targetPath).startsWith("target-") &&
      path.extname(targetPath) === ".json",
    "Expected a path to a target-*.json file",
  );
  const content = await fs.promises.readFile(targetPath, "utf-8");
  return schemas.targetSchemaPerVersion[version].parse(JSON.parse(content));
}

export async function readCurrentTargetsDeep(
  buildPath: string,
  configuration: string,
  version: keyof typeof schemas.targetSchemaPerVersion,
): Promise<z.infer<(typeof schemas.targetSchemaPerVersion)[typeof version]>[]> {
  const targets = await readCurrentTargets(buildPath, configuration);
  return Promise.all(
    targets.map((target) => {
      const targetPath = path.join(
        buildPath,
        `.cmake/api/v1/reply`,
        target.jsonFile,
      );
      return readTarget(targetPath, version);
    }),
  );
}

export async function readCache(
  cachePath: string,
  version: keyof typeof schemas.cacheSchemaPerVersion,
): Promise<z.infer<(typeof schemas.cacheSchemaPerVersion)[typeof version]>> {
  assert(
    path.basename(cachePath).startsWith("cache-") &&
      path.extname(cachePath) === ".json",
    "Expected a path to a cache-*.json file",
  );
  const content = await fs.promises.readFile(cachePath, "utf-8");
  return schemas.cacheSchemaPerVersion[version].parse(JSON.parse(content));
}

export async function readCmakeFiles(
  cmakeFilesPath: string,
  version: keyof typeof schemas.cmakeFilesSchemaPerVersion,
): Promise<
  z.infer<(typeof schemas.cmakeFilesSchemaPerVersion)[typeof version]>
> {
  assert(
    path.basename(cmakeFilesPath).startsWith("cmakeFiles-") &&
      path.extname(cmakeFilesPath) === ".json",
    "Expected a path to a cmakeFiles-*.json file",
  );
  const content = await fs.promises.readFile(cmakeFilesPath, "utf-8");
  return schemas.cmakeFilesSchemaPerVersion[version].parse(JSON.parse(content));
}

export async function readToolchains(
  toolchainsPath: string,
  version: keyof typeof schemas.toolchainsSchemaPerVersion,
): Promise<
  z.infer<(typeof schemas.toolchainsSchemaPerVersion)[typeof version]>
> {
  assert(
    path.basename(toolchainsPath).startsWith("toolchains-") &&
      path.extname(toolchainsPath) === ".json",
    "Expected a path to a toolchains-*.json file",
  );
  const content = await fs.promises.readFile(toolchainsPath, "utf-8");
  return schemas.toolchainsSchemaPerVersion[version].parse(JSON.parse(content));
}

export async function readConfigureLog(
  configureLogPath: string,
  version: keyof typeof schemas.configureLogSchemaPerVersion,
): Promise<
  z.infer<(typeof schemas.configureLogSchemaPerVersion)[typeof version]>
> {
  assert(
    path.basename(configureLogPath).startsWith("configureLog-") &&
      path.extname(configureLogPath) === ".json",
    "Expected a path to a configureLog-*.json file",
  );
  const content = await fs.promises.readFile(configureLogPath, "utf-8");
  return schemas.configureLogSchemaPerVersion[version].parse(
    JSON.parse(content),
  );
}
