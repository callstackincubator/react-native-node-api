import fs from "node:fs";
import path from "node:path";

import { spawn } from "bufout";

const PACKAGE_ROOT = path.join(import.meta.dirname, "..");

type TypeScriptDeclarationsOptions = {
  /**
   * Path to the directory containing the Cargo.toml file.
   */
  createPath: string;
  /**
   * Path to the output directory where the TypeScript declarations will be copied into.
   */
  outputPath: string;
  /**
   * File name of the generated TypeScript declarations (including .d.ts).
   */
  outputFilename: string;
};

export async function generateTypeScriptDeclarations({
  createPath,
  outputPath,
  outputFilename,
}: TypeScriptDeclarationsOptions) {
  // Using a temporary directory to avoid polluting crate with any other side-effects for generating TypeScript declarations
  const tempPath = fs.realpathSync(
    fs.mkdtempSync(path.join(PACKAGE_ROOT, "dts-tmp-"))
  );
  try {
    // Write a dummy package.json file to avoid errors from napi-rs
    await fs.promises.writeFile(
      path.join(tempPath, "package.json"),
      "{}",
      "utf8"
    );
    // Call into napi.rs to generate TypeScript declarations
    const napiCliPath = new URL(
      import.meta.resolve("@napi-rs/cli/scripts/index.js")
    ).pathname;
    await spawn(
      // TODO: Resolve the CLI path (not using npx because we don't want to npx to mess up the cwd)
      napiCliPath,
      [
        "build",
        "--dts",
        outputFilename,
        "--cargo-cwd",
        // This doesn't understand absolute paths
        path.relative(tempPath, createPath),
      ],
      {
        outputMode: "buffered",
        cwd: tempPath,
      }
    );
    // Copy out the generated TypeScript declarations
    await fs.promises.copyFile(
      path.join(tempPath, outputFilename),
      path.join(outputPath, outputFilename)
    );
  } finally {
    await fs.promises.rm(tempPath, { recursive: true, force: true });
  }
}
