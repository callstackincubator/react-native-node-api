import cp from "node:child_process";
import path from "node:path";

import {
  gypFlagsToArguments,
  MODULE_ROOT_DIR_PLACEHOLDER,
  resolveModuleRootDir,
  splitShellWords,
  toCmakeShellOption,
} from "./flags.js";
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
  namespacedTargets?: boolean;
};

const KNOWN_VARIABLES: Record<string, string> = {
  module_root_dir: MODULE_ROOT_DIR_PLACEHOLDER,
};

/**
 * Matches the start of a gyp expansion: `<(var)`, `>(var)`, `<!(cmd)` or `<!@(cmd)`
 */
const EXPANSION_START = /[<>](!?)(@?)\(/g;

/**
 * Matches a command expansion spanning the entire value, without parentheses
 */
const LEGACY_CMD_EXPANSION = /^<!(@?)([^(@].*)$/s;

function findClosingParenthesis(input: string, openIndex: number) {
  let depth = 0;
  for (let i = openIndex; i < input.length; i++) {
    if (input[i] === "(") {
      depth++;
    } else if (input[i] === ")" && --depth === 0) {
      return i;
    }
  }
  return -1;
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
  namespacedTargets = false,
}: GypToCmakeListsOptions): string {
  function handleUnsupported(message: string) {
    if (unsupportedBehaviour === "throw") {
      throw new Error(message);
    } else if (unsupportedBehaviour === "warn") {
      console.warn(message);
    }
  }

  function executeCommand(command: string): string | null {
    if (executeCmdExpansions) {
      return cp.execSync(command, { encoding: "utf-8" }).trim();
    }
    handleUnsupported(`Unsupported command expansion: ${command}`);
    return null;
  }

  function mapExpansion(value: string): string[] {
    const legacyMatch = value.trim().match(LEGACY_CMD_EXPANSION);
    if (legacyMatch) {
      const [, list, command] = legacyMatch;
      const output = executeCommand(command);
      if (output === null) {
        return [value];
      }
      return list ? splitShellWords(output) : [output];
    }

    let result = "";
    let lastIndex = 0;
    for (const match of value.matchAll(EXPANSION_START)) {
      if (match.index < lastIndex) {
        continue;
      }
      const [start, command, list] = match;
      const openIndex = match.index + start.length - 1;
      const closeIndex = findClosingParenthesis(value, openIndex);
      if (closeIndex === -1) {
        break;
      }
      const expression = value.slice(match.index, closeIndex + 1);
      const content = value.slice(openIndex + 1, closeIndex);
      let replacement: string | null;
      if (command) {
        replacement = executeCommand(content);
        if (replacement !== null && list && expression === value.trim()) {
          return splitShellWords(replacement);
        }
      } else if (Object.hasOwn(KNOWN_VARIABLES, content.trim())) {
        replacement = KNOWN_VARIABLES[content.trim()];
      } else {
        handleUnsupported(`Unsupported variable expansion: ${expression}`);
        replacement = null;
      }
      result +=
        value.slice(lastIndex, match.index) + (replacement ?? expression);
      lastIndex = closeIndex + 1;
    }
    return [result + value.slice(lastIndex)];
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
    const {
      target_name: targetName,
      defines = [],
      cflags = [],
      ldflags = [],
    } = target;

    // TODO: Handle "conditions"

    const escapedSources = target.sources
      .flatMap(mapExpansion)
      .map(transformPath)
      .map(escapeSpaces)
      .map(resolveModuleRootDir);

    const escapedIncludes = (target.include_dirs || [])
      .flatMap(mapExpansion)
      .map(transformPath)
      .map(escapeSpaces)
      .map(resolveModuleRootDir);

    const escapedDefines = defines
      .flatMap(mapExpansion)
      .map(transformPath)
      .map(escapeSpaces)
      .map(resolveModuleRootDir);

    const compileArguments = gypFlagsToArguments(cflags.flatMap(mapExpansion));
    const linkArguments = gypFlagsToArguments(ldflags.flatMap(mapExpansion));

    const libraries = [];
    if (weakNodeApi) {
      libraries.push("weak-node-api");
    } else {
      libraries.push("${CMAKE_JS_LIB}");
      escapedSources.push("${CMAKE_JS_SRC}");
      escapedIncludes.push("${CMAKE_JS_INC}");
    }

    const actualTargetName = namespacedTargets
      ? `${projectName}-${targetName}`
      : targetName;

    // Namespacing only disambiguates the CMake target name: the artifact on disk
    // keeps the name the JS `require` expects, which is what cmake-rn derives the
    // final prebuild name from.
    const outputNameProperties: Record<string, string> = namespacedTargets
      ? { OUTPUT_NAME: targetName }
      : {};

    function setTargetPropertiesLines(
      properties: Record<string, string>,
      indent = "",
    ): string[] {
      return [
        `${indent}set_target_properties(${actualTargetName} PROPERTIES`,
        ...Object.entries(properties).map(
          ([key, value]) => `${indent}  ${key} ${value ? value : '""'}`,
        ),
        `${indent} )`,
      ];
    }

    lines.push(
      `add_library(${actualTargetName} SHARED ${escapedSources.join(" ")})`,
    );

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
            // CMake names the framework bundle after OUTPUT_NAME, so this has to
            // be set here too for the artifact to keep its non-namespaced name.
            ...outputNameProperties,
          },
          "  ",
        ),
        "else()",
        ...setTargetPropertiesLines(
          {
            PREFIX: "",
            SUFFIX: ".node",
            ...outputNameProperties,
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
          ...outputNameProperties,
        }),
      );
    }

    if (libraries.length > 0) {
      lines.push(
        `target_link_libraries(${actualTargetName} PRIVATE ${libraries.join(" ")})`,
      );
    }

    if (escapedIncludes.length > 0) {
      lines.push(
        `target_include_directories(${actualTargetName} PRIVATE ${escapedIncludes.join(
          " ",
        )})`,
      );
    }

    if (escapedDefines.length > 0) {
      lines.push(
        `target_compile_definitions(${actualTargetName} PRIVATE ${escapedDefines.join(" ")})`,
      );
    }

    if (compileArguments.length > 0 || linkArguments.length > 0) {
      // gyp only reads target-level cflags and ldflags when not generating for Apple or Windows
      lines.push("if(NOT APPLE AND NOT WIN32)");
      if (compileArguments.length > 0) {
        lines.push(
          `  target_compile_options(${actualTargetName} PRIVATE ${toCmakeShellOption(compileArguments)})`,
        );
      }
      if (linkArguments.length > 0) {
        lines.push(
          `  target_link_options(${actualTargetName} PRIVATE ${toCmakeShellOption(linkArguments)})`,
        );
      }
      lines.push("endif()");
    }

    if (compileFeatures.length > 0) {
      lines.push(
        `target_compile_features(${actualTargetName} PRIVATE ${compileFeatures.join(" ")})`,
      );
    }

    // `set_target_properties(${actualTargetName} PROPERTIES CXX_STANDARD 11 CXX_STANDARD_REQUIRED YES CXX_EXTENSIONS NO)`,
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
