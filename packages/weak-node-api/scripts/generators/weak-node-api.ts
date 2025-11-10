import type { FunctionDecl } from "../../src/node-api-functions.js";
import { generateFunction } from "./shared.js";

export function generateFunctionDecl({
  returnType,
  name,
  argumentTypes,
}: FunctionDecl) {
  return `${returnType} (*${name})(${argumentTypes.join(", ")});`;
}

/**
 * Generates source code for a version script for the given Node API version.
 */
export function generateHeader(functions: FunctionDecl[]) {
  return `
    #pragma once

    #include <node_api.h> // Node-API
    #include <stdio.h> // fprintf()
    #include <stdlib.h> // abort()

    // Ideally we would have just used NAPI_NO_RETURN, but
    // __declspec(noreturn) (when building with Microsoft Visual C++) cannot be used on members of a struct
    // TODO: If we targeted C++23 we could use std::unreachable()

    #if defined(__GNUC__)
    #define WEAK_NODE_API_UNREACHABLE __builtin_unreachable()
    #else
    #define WEAK_NODE_API_UNREACHABLE __assume(0)
    #endif
    
    // Generate the struct of function pointers
    struct WeakNodeApiHost {
      ${functions.map(generateFunctionDecl).join("\n")}
    };
    typedef void(*InjectHostFunction)(const WeakNodeApiHost&);
    extern "C" void inject_weak_node_api_host(const WeakNodeApiHost& host);
  `;
}

function generateFunctionImpl(fn: FunctionDecl) {
  const { name, returnType, argumentTypes } = fn;
  return generateFunction({
    ...fn,
    extern: true,
    body: `
        if (g_host.${name} == nullptr) {
          fprintf(stderr, "Node-API function '${name}' called before it was injected!\\n");
          abort();
        }
        ${returnType === "void" ? "" : "return "} g_host.${name}(
          ${argumentTypes.map((_, index) => `arg${index}`).join(", ")}
        );
      `,
  });
}

/**
 * Generates source code for a version script for the given Node API version.
 */
export function generateSource(functions: FunctionDecl[]) {
  return `
    #include "weak_node_api.hpp"

    WeakNodeApiHost g_host;
    void inject_weak_node_api_host(const WeakNodeApiHost& host) {
      g_host = host;
    };
    
    // Generate function calling into the host
    ${functions.map(generateFunctionImpl).join("\n")}
  `;
}
