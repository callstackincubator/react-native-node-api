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

export async function readIndex(indexPath: string) {
  assert(
    (path.basename(indexPath).startsWith("index-") ||
      path.basename(indexPath).startsWith("error-")) &&
      path.extname(indexPath) === ".json",
    "Expected a path to a index-*.json file or error-*.json file",
  );
  const content = await fs.promises.readFile(indexPath, "utf-8");
  return schemas.IndexReplyV1.parse(JSON.parse(content));
}

export async function readCodeModel(codeModelPath: string) {
  assert(
    path.basename(codeModelPath).startsWith("codemodel-") &&
      path.extname(codeModelPath) === ".json",
    "Expected a path to a codemodel-*.json file",
  );
  const content = await fs.promises.readFile(codeModelPath, "utf-8");
  return schemas.CodemodelV2.parse(JSON.parse(content));
}

export async function readCurrentCodeModel(buildPath: string) {
  const replyPath = path.join(buildPath, `.cmake/api/v1/reply`);
  const replyIndexPath = await findCurrentReplyIndexPath(replyPath);
  const index = await readIndex(replyIndexPath);
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
  return readCodeModel(codemodelPath);
}

export async function readCurrentTargets(
  buildPath: string,
  configuration: string,
) {
  const { configurations } = await readCurrentCodeModel(buildPath);
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
  schema: z.ZodSchema = schemas.TargetV2_8,
) {
  assert(
    path.basename(targetPath).startsWith("target-") &&
      path.extname(targetPath) === ".json",
    "Expected a path to a target-*.json file",
  );
  const content = await fs.promises.readFile(targetPath, "utf-8");
  return schema.parse(JSON.parse(content));
}

export async function readCurrentTargetsDeep(
  buildPath: string,
  configuration: string,
) {
  const targets = await readCurrentTargets(buildPath, configuration);
  return Promise.all(
    targets.map((target) => {
      const targetPath = path.join(
        buildPath,
        `.cmake/api/v1/reply`,
        target.jsonFile,
      );
      return readTarget(targetPath);
    }),
  );
}

export async function readCache(
  cachePath: string,
  schema: z.ZodSchema = schemas.CacheV2_0,
) {
  assert(
    path.basename(cachePath).startsWith("cache-") &&
      path.extname(cachePath) === ".json",
    "Expected a path to a cache-*.json file",
  );
  const content = await fs.promises.readFile(cachePath, "utf-8");
  return schema.parse(JSON.parse(content));
}

export async function readCmakeFiles(
  cmakeFilesPath: string,
  schema: z.ZodSchema = schemas.CmakeFilesV1_1,
) {
  assert(
    path.basename(cmakeFilesPath).startsWith("cmakeFiles-") &&
      path.extname(cmakeFilesPath) === ".json",
    "Expected a path to a cmakeFiles-*.json file",
  );
  const content = await fs.promises.readFile(cmakeFilesPath, "utf-8");
  return schema.parse(JSON.parse(content));
}

export async function readToolchains(
  toolchainsPath: string,
  schema: z.ZodSchema = schemas.ToolchainsV1_0,
) {
  assert(
    path.basename(toolchainsPath).startsWith("toolchains-") &&
      path.extname(toolchainsPath) === ".json",
    "Expected a path to a toolchains-*.json file",
  );
  const content = await fs.promises.readFile(toolchainsPath, "utf-8");
  return schema.parse(JSON.parse(content));
}

export async function readConfigureLog(
  configureLogPath: string,
  schema: z.ZodSchema = schemas.ConfigureLogV1_0,
) {
  assert(
    path.basename(configureLogPath).startsWith("configureLog-") &&
      path.extname(configureLogPath) === ".json",
    "Expected a path to a configureLog-*.json file",
  );
  const content = await fs.promises.readFile(configureLogPath, "utf-8");
  return schema.parse(JSON.parse(content));
}
