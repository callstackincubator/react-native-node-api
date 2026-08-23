import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import { build } from "@expo/plist/build/build.js";

import { verifyFrameworkInfoPlist } from "./verify-prebuilds.mjs";

async function writeInfoPlist(
  directory: string,
  contents: Record<string, unknown>,
) {
  const infoPlistPath = path.join(directory, "Info.plist");
  await fs.promises.writeFile(infoPlistPath, build(contents), "utf8");
  return infoPlistPath;
}

describe("verifyFrameworkInfoPlist", () => {
  it("accepts the expected executable and escaped bundle identifier", async (context) => {
    const directory = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), "verify-framework-plist-"),
    );
    context.after(() => fs.promises.rm(directory, { recursive: true }));
    const infoPlistPath = await writeInfoPlist(directory, {
      CFBundleExecutable: "my_addon",
      CFBundleIdentifier: "com.callstackincubator.node-api.my-addon",
    });

    await verifyFrameworkInfoPlist(infoPlistPath, "my_addon");
  });

  it("rejects an unexpected executable", async (context) => {
    const directory = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), "verify-framework-plist-"),
    );
    context.after(() => fs.promises.rm(directory, { recursive: true }));
    const infoPlistPath = await writeInfoPlist(directory, {
      CFBundleExecutable: "wrong-addon",
      CFBundleIdentifier: "com.callstackincubator.node-api.my-addon",
    });

    await assert.rejects(
      () => verifyFrameworkInfoPlist(infoPlistPath, "my-addon"),
      /Unexpected CFBundleExecutable/,
    );
  });

  it("rejects an unexpected bundle identifier", async (context) => {
    const directory = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), "verify-framework-plist-"),
    );
    context.after(() => fs.promises.rm(directory, { recursive: true }));
    const infoPlistPath = await writeInfoPlist(directory, {
      CFBundleExecutable: "my-addon",
      CFBundleIdentifier: "com.example.wrong",
    });

    await assert.rejects(
      () => verifyFrameworkInfoPlist(infoPlistPath, "my-addon"),
      /Unexpected CFBundleIdentifier/,
    );
  });
});
