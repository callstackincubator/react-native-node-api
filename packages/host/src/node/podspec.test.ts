import assert from "node:assert/strict";
import { describe, it } from "node:test";
import cp from "node:child_process";

describe("Podspec", () => {
  // We cannot support prebuilds of React Native Core since we're patching JSI
  it(
    "should error when RCT_USE_PREBUILT_RNCORE is set",
    // We cannot call `pod` on non-macOS systems
    { skip: process.platform !== "darwin" },
    () => {
      const { status, stdout } = cp.spawnSync("pod", ["spec", "lint"], {
        env: { ...process.env, RCT_USE_PREBUILT_RNCORE: "1" },
        encoding: "utf-8",
      });

      assert.notEqual(status, 0);
      assert.match(
        stdout,
        /React Native Node-API cannot reliably patch JSI when React Native Core is prebuilt/,
      );
    },
  );
});
