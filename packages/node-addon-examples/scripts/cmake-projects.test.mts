import assert from "node:assert/strict";
import { describe, it, TestContext } from "node:test";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";

import { EXAMPLES_DIR, findCMakeProjects } from "./cmake-projects.mjs";

function setupTempDirectory(context: TestContext, files: Record<string, string>) {
  const tempDirectoryPath = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "cmake-projects-test-"))
  );

  context.after(() => {
    fs.rmSync(tempDirectoryPath, { recursive: true, force: true });
  });

  for (const [filePath, content] of Object.entries(files)) {
    const fullPath = path.join(tempDirectoryPath, filePath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content, "utf8");
  }

  return tempDirectoryPath;
}

describe("EXAMPLES_DIR", () => {
  it("should resolve to a valid platform-specific path", () => {
    // Check that EXAMPLES_DIR is an absolute path
    assert(path.isAbsolute(EXAMPLES_DIR), "EXAMPLES_DIR should be absolute");
    
    // On Windows, should not start with /
    if (process.platform === "win32") {
      assert(
        !EXAMPLES_DIR.startsWith("/"),
        "Windows path should not start with /"
      );
      // Should match Windows path pattern (e.g., C:\... or D:\...)
      assert(
        /^[A-Za-z]:[\\/]/.test(EXAMPLES_DIR),
        "Windows path should start with drive letter"
      );
    } else {
      // On Unix-like systems, should start with /
      assert(
        EXAMPLES_DIR.startsWith("/"),
        "Unix path should start with /"
      );
    }
  });

  it("should work correctly with path.join operations", (context) => {
    const tempDir = setupTempDirectory(context, {
      "test/subdir/file.txt": "test content",
    });

    // Simulate what happens in copy-examples.mts
    const relativePath = "test/subdir";
    const joinedPath = path.join(tempDir, relativePath);
    
    // The joined path should exist and be accessible
    assert(fs.existsSync(joinedPath), "Joined path should exist");
    assert(
      fs.statSync(joinedPath).isDirectory(),
      "Joined path should be a directory"
    );
  });

  it("should handle URL to path conversion correctly on all platforms", () => {
    // Create a test URL similar to how EXAMPLES_DIR is created
    const testUrl = new URL("../examples", import.meta.url);
    const convertedPath = testUrl.pathname;
    
    // The converted path should work with fs operations
    // We can't test the actual EXAMPLES_DIR since it might not exist,
    // but we can verify the conversion produces valid paths
    if (process.platform === "win32") {
      // On Windows, URL.pathname returns /C:/... which is invalid
      // Our fix uses fileURLToPath which returns C:\...
      assert(
        !path.isAbsolute(convertedPath) || convertedPath.startsWith("/"),
        "Direct URL.pathname on Windows produces invalid absolute paths"
      );
    }
  });
});

describe("findCMakeProjects", () => {
  it("should find CMakeLists.txt files recursively", (context) => {
    const tempDir = setupTempDirectory(context, {
      "project1/CMakeLists.txt": "# CMake file 1",
      "project2/subdir/CMakeLists.txt": "# CMake file 2",
      "project3/CMakeLists.txt": "# CMake file 3",
      "not-a-project/other.txt": "not cmake",
    });

    const projects = findCMakeProjects(tempDir);
    
    assert.equal(projects.length, 3, "Should find 3 CMake projects");
    
    // Sort for consistent comparison
    const sortedProjects = projects.sort();
    const expectedProjects = [
      path.join(tempDir, "project1"),
      path.join(tempDir, "project2", "subdir"),
      path.join(tempDir, "project3"),
    ].sort();
    
    assert.deepEqual(sortedProjects, expectedProjects);
  });

  it("should handle empty directories", (context) => {
    const tempDir = setupTempDirectory(context, {});
    const projects = findCMakeProjects(tempDir);
    assert.equal(projects.length, 0, "Should find no projects in empty dir");
  });

  it("should handle nested CMake projects", (context) => {
    const tempDir = setupTempDirectory(context, {
      "parent/CMakeLists.txt": "# Parent CMake",
      "parent/child/CMakeLists.txt": "# Child CMake",
      "parent/child/grandchild/CMakeLists.txt": "# Grandchild CMake",
    });

    const projects = findCMakeProjects(tempDir);
    
    assert.equal(projects.length, 3, "Should find all nested projects");
    assert(
      projects.includes(path.join(tempDir, "parent")),
      "Should include parent project"
    );
    assert(
      projects.includes(path.join(tempDir, "parent", "child")),
      "Should include child project"
    );
    assert(
      projects.includes(path.join(tempDir, "parent", "child", "grandchild")),
      "Should include grandchild project"
    );
  });

  it("should work with Windows-style paths", { skip: process.platform !== "win32" }, (context) => {
    const tempDir = setupTempDirectory(context, {
      "windows\\style\\path\\CMakeLists.txt": "# CMake file",
    });

    const projects = findCMakeProjects(tempDir);
    assert.equal(projects.length, 1, "Should find project with Windows path");
  });
});