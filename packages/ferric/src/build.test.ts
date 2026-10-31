import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import { applyChanges } from "@react-native-node-api/cli-utils";

import { buildCommand } from "./build.js";
import { planInit } from "./init.js";

describe("ferric build", { skip: process.platform === "win32" }, () => {
  it("builds a crate outside the current directory with --cwd", async (context) => {
    const tempPath = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), "ferric-build-test-")),
    );
    context.after(() => {
      fs.rmSync(tempPath, { recursive: true, force: true });
    });
    const packagePath = path.join(tempPath, "addon");
    const { changes } = await planInit({ packagePath, crateName: "addon" });
    await applyChanges(changes);

    await buildCommand.parseAsync(["--dts-only", "--cwd", packagePath], {
      from: "user",
    });

    assert.match(
      fs.readFileSync(path.join(packagePath, "addon.d.ts"), "utf8"),
      /export declare function /,
    );
    assert(fs.existsSync(path.join(packagePath, "addon.js")));
  });
});
