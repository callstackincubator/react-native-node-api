import cp from "node:child_process";
import path from "node:path";

import type { GypBinding } from "./gyp.js";

const DEFAULT_NAPI_VERSION = 8;

export type GypToCmakeListsOptions = {
  gyp: GypBinding;
  projectName: string;
  napiVersion?: number;
  executeCmdExpansions?: boolean;
  unsupportedBehaviour?: "skip" | "warn" | "throw";
  transformWinPathsToPosix?: boolean;
  compileFeatures?: string[];
  defineNapiVersion?: boolean;
  weakNodeApi?: boolean;
  appleFramework?: boolean;
};

function isCmdExpansion(value: string) {
  const trimmedValue = value.trim();
  return trimmedValue.startsWith("<!");
}

function escapeSpaces(source: string) {
  return source.replace(/ /g, "\\ ");
}

/**
 * Escapes any input to match a CFBundleIdentifier
 * See https://developer.apple.com/documentation/bundleresources/information-property-list/cfbundleidentifier
 */
export function escapeBundleIdentifier(input: string) {
  return input.replaceAll("__", ".").replace(/[^A-Za-z0-9-.]/g, "-");
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
  transformWinPathsToPosix = true,
  defineNapiVersion = true,
  weakNodeApi = false,
  appleFramework = true,
  compileFeatures = [],
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

  function transformPath(input: string) {
    if (transformWinPathsToPosix) {
      return input.split(path.win32.sep).join(path.posix.sep);
    } else {
      return input;
    }
  }

  const lines: string[] = [
    "cmake_minimum_required(VERSION 3.15...3.31)",
    //"cmake_policy(SET CMP0091 NEW)",
    //"cmake_policy(SET CMP0042 NEW)",
    `project(${projectName})`,
    "",
    // Declaring a project-wide NAPI_VERSION as a fallback for targets that don't explicitly set it
    // This is only needed when using cmake-js, as it is injected by cmake-rn
    ...(defineNapiVersion
      ? [`add_compile_definitions(NAPI_VERSION=${napiVersion})`]
      : []),
  ];

  if (weakNodeApi) {
    lines.push(`find_package(weak-node-api REQUIRED CONFIG)`, "");
  }

  for (const target of gyp.targets) {
    const { target_name: targetName, defines = [] } = target;

    // TODO: Handle "conditions"
    // TODO: Handle "cflags"
    // TODO: Handle "ldflags"

    const escapedSources = target.sources
      .flatMap(mapExpansion)
      .map(transformPath)
      .map(escapeSpaces);

    const escapedIncludes = (target.include_dirs || [])
      .flatMap(mapExpansion)
      .map(transformPath)
      .map(escapeSpaces);

    const escapedDefines = defines
      .flatMap(mapExpansion)
      .map(transformPath)
      .map(escapeSpaces);

    const libraries = [];
    if (weakNodeApi) {
      libraries.push("weak-node-api");
    } else {
      libraries.push("${CMAKE_JS_LIB}");
      escapedSources.push("${CMAKE_JS_SRC}");
      escapedIncludes.push("${CMAKE_JS_INC}");
    }

    function setTargetPropertiesLines(
      properties: Record<string, string>,
      indent = "",
    ): string[] {
      return [
        `${indent}set_target_properties(${targetName} PROPERTIES`,
        ...Object.entries(properties).map(
          ([key, value]) => `${indent}  ${key} ${value ? value : '""'}`,
        ),
        `${indent} )`,
      ];
    }

    lines.push(`add_library(${targetName} SHARED ${escapedSources.join(" ")})`);

    if (appleFramework) {
      lines.push(
        "",
        'option(BUILD_APPLE_FRAMEWORK "Wrap addon in an Apple framework" ON)',
        "",
        "if(APPLE AND BUILD_APPLE_FRAMEWORK)",
        ...setTargetPropertiesLines(
          {
            FRAMEWORK: "TRUE",
            MACOSX_FRAMEWORK_IDENTIFIER: escapeBundleIdentifier(
              `${projectName}.${targetName}`,
            ),
            MACOSX_FRAMEWORK_SHORT_VERSION_STRING: "1.0",
            MACOSX_FRAMEWORK_BUNDLE_VERSION: "1.0",
            XCODE_ATTRIBUTE_SKIP_INSTALL: "NO",
          },
          "  ",
        ),
        "else()",
        ...setTargetPropertiesLines(
          {
            PREFIX: "",
            SUFFIX: ".node",
          },
          "  ",
        ),
        "endif()",
        "",
      );
    } else {
      lines.push(
        ...setTargetPropertiesLines({
          PREFIX: "",
          SUFFIX: ".node",
        }),
      );
    }

    if (libraries.length > 0) {
      lines.push(
        `target_link_libraries(${targetName} PRIVATE ${libraries.join(" ")})`,
      );
    }

    if (escapedIncludes.length > 0) {
      lines.push(
        `target_include_directories(${targetName} PRIVATE ${escapedIncludes.join(
          " ",
        )})`,
      );
    }

    if (escapedDefines.length > 0) {
      lines.push(
        `target_compile_definitions(${targetName} PRIVATE ${escapedDefines.join(" ")})`,
      );
    }

    if (compileFeatures.length > 0) {
      lines.push(
        `target_compile_features(${targetName} PRIVATE ${compileFeatures.join(" ")})`,
      );
    }

    // `set_target_properties(${targetName} PROPERTIES CXX_STANDARD 11 CXX_STANDARD_REQUIRED YES CXX_EXTENSIONS NO)`,
  }

  if (!weakNodeApi) {
    // This is required by cmake-js to generate the import library for node.lib on Windows
    lines.push(
      "",
      "if(MSVC AND CMAKE_JS_NODELIB_DEF AND CMAKE_JS_NODELIB_TARGET)",
      "  # Generate node.lib",
      "  execute_process(COMMAND ${CMAKE_AR} /def:${CMAKE_JS_NODELIB_DEF} /out:${CMAKE_JS_NODELIB_TARGET} ${CMAKE_STATIC_LINKER_FLAGS})",
      "endif()",
    );
  }

  return lines.join("\n");
}
