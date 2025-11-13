import type { FunctionDecl } from "../../src/node-api-functions.js";
import { generateFunction } from "./shared.js";

/**
 * Generates source code for a version script for the given Node API version.
 */
export function generateHeader() {
  return `
    #pragma once

    #include <node_api.h>
    #include <stdio.h> // fprintf()
    #include <stdlib.h> // abort()
    
    #include "NodeApiHost.hpp"
    
    typedef void(*InjectHostFunction)(const NodeApiHost&);
    extern "C" void inject_weak_node_api_host(const NodeApiHost& host);
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

    /**
     * @brief Global instance of the injected Node-API host.
     *
     * This variable holds the function table for Node-API calls.
     * It is set via inject_weak_node_api_host() before any Node-API function is dispatched.
     * All Node-API calls are routed through this host.
     */
    NodeApiHost g_host;
    void inject_weak_node_api_host(const NodeApiHost& host) {
      g_host = host;
    };
    
    // Generate function calling into the host
    ${functions.map(generateFunctionImpl).join("\n")}
  `;
}
