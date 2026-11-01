import type { FunctionDecl } from "../../src/node-api-functions.js";
import { generateFunction } from "./shared.js";

export function generateSource(functions: FunctionDecl[]) {
  return `
    #include <node_api.h>
    #include <stdlib.h> // abort()

    #define WEAK_NODE_API_UNREACHABLE __builtin_unreachable()

    ${functions
      .map((fn) => generateFunction({ ...fn, extern: true, body: "abort();" }))
      .join("\n")}
  `;
}
