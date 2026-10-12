import assert from "node:assert/strict";
import fs from "node:fs";

import plist from "@expo/plist";
import * as bplist from "bplist-parser";

/**
 * Reads and parses a plist file in either XML or binary format.
 */
export async function readAndParsePlist(plistPath: string): Promise<unknown> {
  assert(fs.existsSync(plistPath), `Expected an Info.plist: ${plistPath}`);
  try {
    const contents = await fs.promises.readFile(plistPath);
    if (contents.subarray(0, 6).toString("ascii") === "bplist") {
      const [result] = bplist.parseBuffer<unknown>(contents);
      return result;
    }
    return plist.parse(contents.toString("utf-8")) as unknown;
  } catch (cause) {
    throw new Error(`Failed to read and parse plist at path "${plistPath}"`, {
      cause,
    });
  }
}
