/**
 * Verifies an addon built with `--node-api-linkage hermes` links Hermes
 * directly and that every Node-API function it imports is exported by the real
 * Hermes library, reporting Node-API functions that library doesn't export.
 *
 * Usage: verify-hermes-linkage.mts <addon-binary> <hermes-binary>
 *
 * On Linux, set LLVM_BIN to a directory with llvm-nm and llvm-readelf (e.g. the NDK's).
 */
import assert from "node:assert/strict";
import cp from "node:child_process";
import path from "node:path";

import { nodeApiHeaders } from "node-api-stub";

const [addonPath, hermesPath] = process.argv.slice(2);
assert(addonPath && hermesPath, "Usage: <addon-binary> <hermes-binary>");

const isDarwin = process.platform === "darwin";

function llvmTool(name: string) {
  const { LLVM_BIN } = process.env;
  return LLVM_BIN ? path.join(LLVM_BIN, name) : name;
}

function run(command: string, args: string[]) {
  return cp.execFileSync(command, args, {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
}

function getDependencies(binaryPath: string) {
  if (isDarwin) {
    return run("otool", ["-L", binaryPath])
      .split("\n")
      .filter((line) => /^\s/.test(line))
      .map((line) => line.trim().split(" ")[0]);
  } else {
    return [
      ...run(llvmTool("llvm-readelf"), ["-d", binaryPath]).matchAll(
        /Shared library: \[(.+)\]/g,
      ),
    ].map(([, name]) => name);
  }
}

function getNodeApiSymbols(binaryPath: string, filter: string[]) {
  const args = isDarwin ? filter : ["-D", ...filter];
  const output = run(isDarwin ? "nm" : llvmTool("llvm-nm"), [
    ...args,
    binaryPath,
  ]);
  return new Set(
    output
      .split("\n")
      .map((line) => line.trim().split(/\s+/).at(-1) ?? "")
      // Mach-O prefixes C symbols with an underscore
      .map((name) => (isDarwin ? name.replace(/^_/, "") : name))
      .filter((name) => /^(napi|node_api)_/.test(name)),
  );
}

function fail(message: string): never {
  console.log(`::error::${message}`);
  process.exit(1);
}

const dependencies = getDependencies(addonPath);
console.log(`Dependencies of ${addonPath}:`);
for (const dependency of dependencies) {
  console.log(`  ${dependency}`);
}
if (!dependencies.some((name) => name.includes("hermesvm"))) {
  fail(`Expected ${addonPath} to link hermesvm`);
}
if (dependencies.some((name) => name.includes("weak-node-api"))) {
  fail(`Expected ${addonPath} not to link weak-node-api`);
}

const imported = getNodeApiSymbols(addonPath, ["--undefined-only"]);
const exported = getNodeApiSymbols(hermesPath, [
  "--defined-only",
  "--extern-only",
]);

if (imported.size === 0) {
  fail(`Found no Node-API imports in ${addonPath}`);
}
const missing = [...imported].filter((name) => !exported.has(name));
if (missing.length > 0) {
  fail(
    `${hermesPath} doesn't export Node-API functions imported by ${addonPath}: ${missing.join(", ")}`,
  );
}
console.log(
  `All ${imported.size} Node-API functions imported by the addon are exported by ${hermesPath}`,
);

const { js_native_api_symbols, node_api_symbols } = nodeApiHeaders.symbols.v10;
const unexported = [...js_native_api_symbols, ...node_api_symbols].filter(
  (name) => !exported.has(name),
);
if (unexported.length > 0) {
  console.log(
    `::warning::${hermesPath} doesn't export Node-API functions the stub does: ${unexported.join(", ")}`,
  );
} else {
  console.log(`${hermesPath} exports every Node-API function the stub does`);
}
