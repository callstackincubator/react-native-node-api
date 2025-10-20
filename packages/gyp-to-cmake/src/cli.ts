import fs from "node:fs";
import path from "node:path";
import {
  Command,
  prettyPath,
  wrapAction,
  Option,
} from "@react-native-node-api/cli-utils";

import { readBindingFile } from "./gyp.js";
import {
  bindingGypToCmakeLists,
  type GypToCmakeListsOptions,
} from "./transformer.js";

export type TransformOptions = Omit<
  GypToCmakeListsOptions,
  "gyp" | "projectName"
> & {
  disallowUnknownProperties: boolean;
  projectName?: string;
};

export function generateProjectName(gypPath: string) {
  return path.dirname(gypPath).replaceAll(path.sep, "-");
}

export function transformBindingGypFile(
  gypPath: string,
  {
    disallowUnknownProperties,
    projectName = generateProjectName(gypPath),
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
  options: TransformOptions,
) {
  const entries = fs.readdirSync(directoryPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(directoryPath, entry.name);
    if (entry.isDirectory()) {
      transformBindingGypsRecursively(fullPath, options);
    } else if (entry.isFile() && entry.name === "binding.gyp") {
      transformBindingGypFile(fullPath, options);
    }
  }
}

export const program = new Command("gyp-to-cmake")
  .description("Transform binding.gyp to CMakeLists.txt")
  .option(
    "--no-path-transforms",
    "Don't transform output from command expansions (replacing '\\' with '/')",
  )
  .option("--weak-node-api", "Link against the weak-node-api library", false)
  .option("--define-napi-version", "Define NAPI_VERSION for all targets", false)
  .option("--cpp <version>", "C++ standard version", "17")
  .argument(
    "[path]",
    "Path to the binding.gyp file or directory to traverse recursively",
    process.cwd(),
  )
  .action(
    wrapAction(
      (
        targetPath: string,
        { pathTransforms, cpp, defineNapiVersion, weakNodeApi },
      ) => {
        const options: TransformOptions = {
          unsupportedBehaviour: "throw",
          disallowUnknownProperties: false,
          transformWinPathsToPosix: pathTransforms,
          compileFeatures: cpp ? [`cxx_std_${cpp}`] : [],
          defineNapiVersion,
          weakNodeApi,
        };
        const stat = fs.statSync(targetPath);
        if (stat.isFile()) {
          transformBindingGypFile(targetPath, options);
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
