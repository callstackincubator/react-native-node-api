import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { nodeApiHeaders } from "../src/node-api-functions.js";
const { include_dir: includeSourcePath } = nodeApiHeaders;

const includeDestinationPath = path.join(import.meta.dirname, "../include");
assert(fs.existsSync(includeSourcePath), `Expected ${includeSourcePath}`);
console.log(`Copying ${includeSourcePath} to ${includeDestinationPath}`);
fs.cpSync(includeSourcePath, includeDestinationPath, { recursive: true });
