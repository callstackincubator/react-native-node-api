import assert from "node:assert/strict";
import path from "node:path";
import cp from "node:child_process";

import {
  type NodeApiVersion,
  symbols,
  include_dir as nodeApiIncludePath,
} from "node-api-headers";
import { z } from "zod";

const clangAstDump = z.object({
  kind: z.literal("TranslationUnitDecl"),
  inner: z.array(
    z.object({
      kind: z.string(),
      name: z.string().optional(),
      type: z
        .object({
          qualType: z.string(),
        })
        .optional(),
    }),
  ),
});

/**
 * Generates source code for a version script for the given Node API version.
 * @param version
 */
export function getNodeApiHeaderAST(version: NodeApiVersion) {
  const output = cp.execFileSync(
    "clang",
    [
      // Declare the Node API version
      "-D",
      `NAPI_VERSION=${version.replace(/^v/, "")}`,
      // Pass the next option directly to the Clang frontend
      "-Xclang",
      // Ask the Clang frontend to dump the AST
      "-ast-dump=json",
      // Parse and analyze the source file but not compile it
      "-fsyntax-only",
      // Include from the node-api-headers package
      `-I${nodeApiIncludePath}`,
      path.join(nodeApiIncludePath, "node_api.h"),
    ],
    {
      encoding: "utf-8",
      // Emitting the AST can produce a lot of output
      maxBuffer: 1024 * 1024 * 10,
    },
  );
  const parsed = JSON.parse(output);
  return clangAstDump.parse(parsed);
}

export type FunctionDecl = {
  name: string;
  kind: "engine" | "runtime";
  returnType: string;
  noReturn: boolean;
  argumentTypes: string[];
  libraryPath: string;
  fallbackReturnStatement: string;
};

export function getNodeApiFunctions(version: NodeApiVersion = "v8") {
  const root = getNodeApiHeaderAST(version);
  assert.equal(root.kind, "TranslationUnitDecl");
  assert(Array.isArray(root.inner));
  const foundSymbols = new Set();

  const symbolsPerInterface = symbols[version];
  const engineSymbols = new Set(symbolsPerInterface.js_native_api_symbols);
  const runtimeSymbols = new Set(symbolsPerInterface.node_api_symbols);
  const allSymbols = new Set([...engineSymbols, ...runtimeSymbols]);

  const nodeApiFunctions: FunctionDecl[] = [];

  for (const node of root.inner) {
    const { name, kind } = node;
    if (kind === "FunctionDecl" && name && allSymbols.has(name)) {
      assert(name, "Expected a name");
      foundSymbols.add(name);
      assert(node.type, `Expected type for ${node.name}`);

      const match = node.type.qualType.match(
        /^(?<returnType>[^(]+) \((?<argumentTypes>[^)]+)\)/,
      );
      assert(
        match && match.groups,
        `Failed to parse function type: ${node.type.qualType}`,
      );
      const { returnType, argumentTypes } = match.groups;
      assert(
        returnType,
        `Failed to get return type from ${node.type.qualType}`,
      );
      assert(
        argumentTypes,
        `Failed to get argument types from ${argumentTypes}`,
      );
      assert(
        returnType === "napi_status" || returnType === "void",
        `Expected return type to be napi_status, got ${returnType}`,
      );

      nodeApiFunctions.push({
        name,
        returnType,
        noReturn: node.type.qualType.includes("__attribute__((noreturn))"),
        kind: engineSymbols.has(name) ? "engine" : "runtime",
        argumentTypes: argumentTypes
          .split(",")
          .map((arg) => arg.trim().replace("_Bool", "bool")),
        // Defer to the right library
        libraryPath: engineSymbols.has(name)
          ? "libhermes.so"
          : "libnode-api-host.so",
        fallbackReturnStatement:
          returnType === "void"
            ? "abort();"
            : "return napi_status::napi_generic_failure;",
      });
    }
  }
  for (const knownSymbol of allSymbols) {
    if (!foundSymbols.has(knownSymbol)) {
      throw new Error(
        `Missing symbol '${knownSymbol}' in the AST for Node API ${version}`,
      );
    }
  }

  return nodeApiFunctions;
}
