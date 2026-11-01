import assert from "node:assert/strict";
import cp from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { generateFunction, getNodeApiFunctions } from "../src/index.js";

const OUTPUT_PATH = path.join(import.meta.dirname, "../generated");

const source = `
  /**
   * @file node_api_stub.cpp
   * @brief Link-time stub of a library exporting Node-API.
   *
   * Lets an addon link directly against a Node-API provider (such as Hermes) without having it installed.
   *
   * @note This file is generated - don't edit it directly
   */

  #include <node_api.h>
  #include <stdlib.h> // abort()

  ${getNodeApiFunctions()
    .map((fn) => generateFunction({ ...fn, extern: true, body: "abort();" }))
    .join("\n")}
`;

await fs.promises.mkdir(OUTPUT_PATH, { recursive: true });
const outputPath = path.join(OUTPUT_PATH, "node_api_stub.cpp");
await fs.promises.writeFile(outputPath, source.trim(), "utf-8");
const { status, stderr } = cp.spawnSync("clang-format", ["-i", outputPath], {
  encoding: "utf8",
});
assert.equal(status, 0, `Failed to format ${outputPath}: ${stderr}`);
