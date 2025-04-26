import cp from "node:child_process";

import type { GypBinding } from "./gyp.js";

const DEFAULT_NAPI_VERSION = 8;

export type GypToCmakeListsOptions = {
  gyp: GypBinding;
  projectName: string;
  napiVersion?: number;
  executeCmdExpansions?: boolean;
  unsupportedBehaviour?: "skip" | "warn" | "throw";
};

function isCmdExpansion(value: string) {
  const trimmedValue = value.trim();
  return trimmedValue.startsWith("<!");
}

function escapePath(source: string) {
  return source.replace(/ /g, "\\ ");
}

/**
 * @see {@link https://github.com/cmake-js/cmake-js?tab=readme-ov-file#usage} for details on the template used
 * @returns The contents of a CMakeLists.txt file
 */
export function bindingGypToCmakeLists({
  gyp,
  projectName,
  napiVersion = DEFAULT_NAPI_VERSION,
  executeCmdExpansions = true,
  unsupportedBehaviour = "skip",
}: GypToCmakeListsOptions): string {
  function mapExpansion(value: string): string[] {
    if (!isCmdExpansion(value)) {
      return [value];
    } else if (executeCmdExpansions) {
      const cmd = value.trim().replace(/^<!@?/, "");
      const output = cp.execSync(cmd, { encoding: "utf-8" }).trim();
      // Split on whitespace, if the expansion starts with "<!@"
      return value.trim().startsWith("<!@") ? output.split(/\s/) : [output];
    } else if (unsupportedBehaviour === "throw") {
      throw new Error(`Unsupported command expansion: ${value}`);
    } else if (unsupportedBehaviour === "warn") {
      console.warn(`Unsupported command expansion: ${value}`);
    }
    return [value];
  }

  const lines: string[] = [
    "cmake_minimum_required(VERSION 3.15)",
    //"cmake_policy(SET CMP0091 NEW)",
    //"cmake_policy(SET CMP0042 NEW)",
    `project(${projectName})`,
    "",
    `add_compile_definitions(-DNAPI_VERSION=${napiVersion})`,
  ];

  for (const target of gyp.targets) {
    const { target_name: targetName } = target;

    // TODO: Handle "conditions"
    // TODO: Handle "defines"
    // TODO: Handle "cflags"
    // TODO: Handle "ldflags"

    const escapedJoinedSources = target.sources
      .flatMap(mapExpansion)
      .map(escapePath)
      .join(" ");

    const escapedJoinedIncludes = (target.include_dirs || [])
      .flatMap(mapExpansion)
      .map(escapePath)
      .join(" ");

    lines.push(
      "",
      `add_library(${targetName} SHARED ${escapedJoinedSources} \${CMAKE_JS_SRC})`,
      `set_target_properties(${targetName} PROPERTIES PREFIX "" SUFFIX ".node")`,
      `target_include_directories(${targetName} PRIVATE ${escapedJoinedIncludes} \${CMAKE_JS_INC})`,
      `target_link_libraries(${targetName} PRIVATE \${CMAKE_JS_LIB})`,
      `target_compile_features(${targetName} PRIVATE cxx_std_17)`
      // or
      // `set_target_properties(${targetName} PROPERTIES CXX_STANDARD 11 CXX_STANDARD_REQUIRED YES CXX_EXTENSIONS NO)`,
    );
  }

  // Adding this post-amble from the template, although not used by react-native-node-api-modules
  lines.push(
    "",
    "if(MSVC AND CMAKE_JS_NODELIB_DEF AND CMAKE_JS_NODELIB_TARGET)",
    "  # Generate node.lib",
    "  execute_process(COMMAND ${CMAKE_AR} /def:${CMAKE_JS_NODELIB_DEF} /out:${CMAKE_JS_NODELIB_TARGET} ${CMAKE_STATIC_LINKER_FLAGS})",
    "endif()"
  );

  return lines.join("\n");
}
