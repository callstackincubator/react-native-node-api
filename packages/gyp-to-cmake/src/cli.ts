import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { packageDirectorySync } from "pkg-dir";
import { readPackageSync } from "read-pkg";

import {
  Command,
  Option,
  prettyPath,
  wrapAction,
} from "@react-native-node-api/cli-utils";

import { readBindingFile } from "./gyp.js";
import {
  bindingGypToCmakeLists,
  type GypToCmakeListsOptions,
} from "./transformer.js";

export type TransformOptions = Omit<GypToCmakeListsOptions, "gyp"> & {
  disallowUnknownProperties: boolean;
};

export function generateProjectName(gypPath: string) {
  const packagePath = packageDirectorySync({ cwd: path.dirname(gypPath) });
  assert(packagePath, "Expected the binding.gyp file to be inside a package");
  const { name } = readPackageSync({ cwd: packagePath });
  return name
    .replace(/^@/g, "")
    .replace(/\//g, "--")
    .replace(/[^a-zA-Z0-9_]/g, "_");
}

export function transformBindingGypFile(
  gypPath: string,
  {
    disallowUnknownProperties,
    projectName,
    ...restOfOptions
  }: TransformOptions,
) {
  const parentPath = path.dirname(gypPath);
  const cmakeListsPath = path.join(parentPath, "CMakeLists.txt");
  console.log(
    `Transforming ${prettyPath(gypPath)} → ${prettyPath(cmakeListsPath)}`,
  );

  const gyp = readBindingFile(gypPath, disallowUnknownProperties);
  const result = bindingGypToCmakeLists({
    gyp,
    projectName,
    ...restOfOptions,
  });
  fs.writeFileSync(cmakeListsPath, result, "utf-8");
}

export function transformBindingGypsRecursively(
  directoryPath: string,
  options: Omit<TransformOptions, "projectName">,
) {
  const entries = fs.readdirSync(directoryPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(directoryPath, entry.name);
    if (entry.isDirectory()) {
      transformBindingGypsRecursively(fullPath, options);
    } else if (entry.isFile() && entry.name === "binding.gyp") {
      transformBindingGypFile(fullPath, {
        ...options,
        projectName: generateProjectName(fullPath),
      });
    }
  }
}

const projectNameOption = new Option(
  "--project-name <name>",
  "Project name to use in CMakeLists.txt",
).default(undefined, "Uses name from the surrounding package.json");

export const program = new Command("gyp-to-cmake")
  .description("Transform binding.gyp to CMakeLists.txt")
  .option(
    "--no-path-transforms",
    "Don't transform output from command expansions (replacing '\\' with '/')",
  )
  .option("--weak-node-api", "Link against the weak-node-api library", false)
  .option("--define-napi-version", "Define NAPI_VERSION for all targets", false)
  .option(
    "--no-apple-framework",
    "Disable emitting target properties to produce Apple frameworks",
  )
  .option("--cpp <version>", "C++ standard version", "17")
  .addOption(projectNameOption)
  .argument(
    "[path]",
    "Path to the binding.gyp file or directory to traverse recursively",
    process.cwd(),
  )
  .action(
    wrapAction(
      (
        targetPath: string,
        {
          pathTransforms,
          cpp,
          defineNapiVersion,
          weakNodeApi,
          appleFramework,
          projectName,
        },
      ) => {
        const options: Omit<TransformOptions, "projectName"> = {
          unsupportedBehaviour: "throw",
          disallowUnknownProperties: false,
          transformWinPathsToPosix: pathTransforms,
          compileFeatures: cpp ? [`cxx_std_${cpp}`] : [],
          defineNapiVersion,
          weakNodeApi,
          appleFramework,
        };
        const stat = fs.statSync(targetPath);
        if (stat.isFile()) {
          transformBindingGypFile(targetPath, {
            ...options,
            projectName: projectName ?? generateProjectName(targetPath),
          });
        } else if (stat.isDirectory()) {
          transformBindingGypsRecursively(targetPath, options);
        } else {
          throw new Error(
            `Expected either a file or a directory: ${targetPath}`,
          );
        }
      },
    ),
  );
