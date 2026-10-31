import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, TestContext } from "node:test";

import { determineCargoLibraryName, getCargoMetadata } from "./cargo.js";

function setupWorkspace(context: TestContext) {
  const workspacePath = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "ferric-cargo-test-")),
  );
  context.after(() => {
    fs.rmSync(workspacePath, { recursive: true, force: true });
  });
  fs.writeFileSync(
    path.join(workspacePath, "Cargo.toml"),
    '[workspace]\nmembers = ["alpha", "beta"]\nresolver = "2"\n',
  );
  for (const name of ["alpha", "beta"]) {
    const srcPath = path.join(workspacePath, name, "src");
    fs.mkdirSync(srcPath, { recursive: true });
    fs.writeFileSync(path.join(srcPath, "lib.rs"), "");
    fs.writeFileSync(
      path.join(workspacePath, name, "Cargo.toml"),
      `[package]\nname = "${name}"\nversion = "0.1.0"\nedition = "2021"\n\n[lib]\ncrate-type = ["cdylib"]\n`,
    );
  }
  return workspacePath;
}

describe("determineCargoLibraryName", () => {
  it("returns the library of the current workspace member", (context) => {
    const workspacePath = setupWorkspace(context);
    assert.equal(
      determineCargoLibraryName(path.join(workspacePath, "beta")),
      "beta",
    );
  });

  it("throws at a workspace root with multiple libraries", (context) => {
    const workspacePath = setupWorkspace(context);
    assert.throws(
      () => determineCargoLibraryName(workspacePath),
      /Expected exactly one cdylib target, got: alpha, beta/,
    );
  });
});

describe("getCargoMetadata", () => {
  it("resolves the target directory shared by a workspace", (context) => {
    context.mock.property(process, "env", {
      ...process.env,
      CARGO_TARGET_DIR: undefined,
    });
    const workspacePath = setupWorkspace(context);
    assert.equal(
      getCargoMetadata(path.join(workspacePath, "alpha")).target_directory,
      path.join(workspacePath, "target"),
    );
  });

  it("respects CARGO_TARGET_DIR", (context) => {
    const workspacePath = setupWorkspace(context);
    const targetPath = path.join(workspacePath, "custom-target");
    context.mock.property(process, "env", {
      ...process.env,
      CARGO_TARGET_DIR: targetPath,
    });
    assert.equal(
      getCargoMetadata(path.join(workspacePath, "alpha")).target_directory,
      targetPath,
    );
  });
});
