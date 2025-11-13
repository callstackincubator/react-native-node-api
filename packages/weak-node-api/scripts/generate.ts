import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import cp from "node:child_process";

import {
  FunctionDecl,
  getNodeApiFunctions,
} from "../src/node-api-functions.js";

import * as weakNodeApiGenerator from "./generators/weak-node-api.js";
import * as hostGenerator from "./generators/NodeApiHost.js";
import * as multiHostGenerator from "./generators/NodeApiMultiHost.js";

export const OUTPUT_PATH = path.join(import.meta.dirname, "../generated");

type GenerateFileOptions = {
  functions: FunctionDecl[];
  fileName: string;
  generator: (functions: FunctionDecl[]) => string;
  headingComment?: string;
};

async function generateFile({
  functions,
  fileName,
  generator,
  headingComment = "",
}: GenerateFileOptions) {
  const generated = generator(functions);
  const output = `
    /**
     * @file ${fileName}
     * ${headingComment
       .trim()
       .split("\n")
       .map((l) => l.trim())
       .join("\n* ")}
     *
     * @note This file is generated - don't edit it directly
     */

    ${generated}
  `;
  const outputPath = path.join(OUTPUT_PATH, fileName);
  await fs.promises.writeFile(outputPath, output.trim(), "utf-8");
  const { status, stderr = "No error output" } = cp.spawnSync(
    "clang-format",
    ["-i", outputPath],
    {
      encoding: "utf8",
    },
  );
  assert.equal(status, 0, `Failed to format ${fileName}: ${stderr}`);
}

async function run() {
  await fs.promises.mkdir(OUTPUT_PATH, { recursive: true });

  const functions = getNodeApiFunctions();
  await generateFile({
    functions,
    fileName: "NodeApiHost.hpp",
    generator: hostGenerator.generateHeader,
    headingComment: `
      @brief NodeApiHost struct.
     
      This header provides a struct of Node-API functions implemented by a host to inject its implementations.
    `,
  });
  await generateFile({
    functions,
    fileName: "weak_node_api.hpp",
    generator: weakNodeApiGenerator.generateHeader,
    headingComment: `
      @brief Weak Node-API host injection interface.
     
      This header provides the struct and injection function for deferring Node-API function calls from addons into a Node-API host.
    `,
  });
  await generateFile({
    functions,
    fileName: "weak_node_api.cpp",
    generator: weakNodeApiGenerator.generateSource,
    headingComment: `
      @brief Weak Node-API host injection implementation.
     
      Provides the implementation for deferring Node-API function calls from addons into a Node-API host.
    `,
  });
  await generateFile({
    functions,
    fileName: "NodeApiMultiHost.hpp",
    generator: multiHostGenerator.generateHeader,
    headingComment: `
      @brief Weak Node-API multi-host injection interface.
     
      This header provides the struct for deferring Node-API function calls from addons into multiple Node-API host implementations.
    `,
  });
  await generateFile({
    functions,
    fileName: "NodeApiMultiHost.cpp",
    generator: multiHostGenerator.generateSource,
    headingComment: `
      @brief Weak Node-API multi-host injection implementation.
     
      Provides the implementation for deferring Node-API function calls from addons into multiple Node-API host implementations.
    `,
  });
}

run().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
