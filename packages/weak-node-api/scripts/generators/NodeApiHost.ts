import type { FunctionDecl } from "../../src/node-api-functions.js";

export function generateFunctionDecl({
  returnType,
  name,
  argumentTypes,
}: FunctionDecl) {
  return `${returnType} (*${name})(${argumentTypes.join(", ")});`;
}

export function generateHeader(functions: FunctionDecl[]) {
  return `
    #pragma once

    #include <node_api.h>
    
    // Ideally we would have just used NAPI_NO_RETURN, but
    // __declspec(noreturn) (when building with Microsoft Visual C++) cannot be used on members of a struct
    // TODO: If we targeted C++23 we could use std::unreachable()

    #if defined(__GNUC__)
    #define WEAK_NODE_API_UNREACHABLE __builtin_unreachable()
    #else
    #define WEAK_NODE_API_UNREACHABLE __assume(0)
    #endif
    
    // Generate the struct of function pointers
    struct NodeApiHost {
      ${functions.map(generateFunctionDecl).join("\n")}
    };
  `;
}
