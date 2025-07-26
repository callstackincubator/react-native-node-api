import { createRequire } from "node:module";
import path from "node:path";
import fs from "node:fs";
import assert from "node:assert/strict";

const require = createRequire(import.meta.url);

/**
 * @returns path of the directory containing the headers which provide the Node-API C API (node_api.h and js_native_api.h)
 */
export function getNodeApiHeadersPath(): string {
  try {
    const packagePath = path.dirname(
      require.resolve("node-api-headers/package.json"),
    );
    const result = path.join(packagePath, "include");
    const stat = fs.statSync(packagePath);
    assert(stat.isDirectory(), `Expected ${packagePath} to be a directory`);
    return result;
  } catch (error) {
    throw new Error(
      `Failed resolve Node-API headers: Did you install the 'node-api-headers' package?`,
      {
        cause: error,
      },
    );
  }
}

/**
 * @returns path of the directory containing the headers which provide the Node-API C++ wrapper (napi.h)
 */
export function getNodeAddonHeadersPath(): string {
  try {
    const packagePath = path.dirname(
      require.resolve("node-addon-api/package.json"),
    );
    return packagePath;
  } catch (error) {
    throw new Error(
      `Failed resolve Node-API addon headers: Did you install the 'node-addon-api' package?`,
      {
        cause: error,
      },
    );
  }
}
