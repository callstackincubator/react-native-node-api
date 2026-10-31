import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, TestContext } from "node:test";

import { UsageError } from "@react-native-node-api/cli-utils";

import { ensureAvailableTargets } from "./targets.js";

const INSTALLED_TARGETS_FILENAME = "installed-targets.txt";

/** Fakes rustup, listing the targets from a file in its working directory. */
function setupFakeRustup(context: TestContext) {
  const tempPath = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "ferric-targets-test-")),
  );
  context.after(() => {
    fs.rmSync(tempPath, { recursive: true, force: true });
  });
  fs.writeFileSync(
    path.join(tempPath, "rustup"),
    `#!/bin/sh\ncat ${INSTALLED_TARGETS_FILENAME}\n`,
    { mode: 0o755 },
  );
  context.mock.property(process, "env", {
    ...process.env,
    PATH: `${tempPath}${path.delimiter}${process.env.PATH}`,
  });
  return tempPath;
}

describe(
  "ensureAvailableTargets",
  { skip: process.platform === "win32" },
  () => {
    it("reads the toolchain of the passed directory", (context) => {
      const cratePath = setupFakeRustup(context);
      fs.writeFileSync(
        path.join(cratePath, INSTALLED_TARGETS_FILENAME),
        "aarch64-apple-ios-sim\n",
      );
      ensureAvailableTargets(new Set(["aarch64-apple-ios-sim"]), cratePath);
    });

    it("suggests adding a missing target from that directory", (context) => {
      const cratePath = setupFakeRustup(context);
      fs.writeFileSync(path.join(cratePath, INSTALLED_TARGETS_FILENAME), "");
      assert.throws(
        () =>
          ensureAvailableTargets(new Set(["aarch64-apple-ios-sim"]), cratePath),
        (error) => {
          assert(error instanceof UsageError);
          assert.equal(
            error.fix?.command,
            `cd ${cratePath} && rustup target add aarch64-apple-ios-sim`,
          );
          return true;
        },
      );
    });
  },
);
