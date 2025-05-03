import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { include_dir as includeSourcePath } from "node-api-headers";

const includeDestinationPath = path.join(__dirname, "../include");
assert(fs.existsSync(includeSourcePath), `Expected ${includeSourcePath}`);
console.log(`Copying ${includeSourcePath} to ${includeDestinationPath}`);
fs.cpSync(includeSourcePath, includeDestinationPath, { recursive: true });
