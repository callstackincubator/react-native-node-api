import assert from "node:assert";
import { describe, it } from "node:test";

import { bindingGypToCmakeLists } from "./transformer.js";

describe("bindingGypToCmakeLists", () => {
  it("should declare a project name", () => {
    const output = bindingGypToCmakeLists({
      projectName: "some-project",
      gyp: { targets: [] },
    });
    assert(output.includes("project(some-project)"));
  });

  it("should declare target libraries", () => {
    const output = bindingGypToCmakeLists({
      projectName: "some-project",
      gyp: {
        targets: [
          {
            target_name: "foo",
            sources: ["foo.cc"],
          },
          {
            target_name: "bar",
            sources: ["bar.cc"],
          },
        ],
      },
    });

    assert(output.includes("add_library(foo SHARED foo.cc"));
    assert(output.includes("add_library(bar SHARED bar.cc"));
  });

  it("transform \\ to / in source filenames", () => {
    const output = bindingGypToCmakeLists({
      projectName: "some-project",
      gyp: {
        targets: [
          {
            target_name: "foo",
            sources: ["file\\with\\win32\\separator.cc"],
          },
        ],
      },
    });

    assert(
      output.includes("add_library(foo SHARED file/with/win32/separator.cc"),
    );
  });

  it("escapes spaces in source filenames", () => {
    const output = bindingGypToCmakeLists({
      projectName: "some-project",
      gyp: {
        targets: [
          {
            target_name: "foo",
            sources: ["file with spaces.cc"],
          },
        ],
      },
    });

    assert(output.includes("add_library(foo SHARED file\\ with\\ spaces.cc"));
  });

  describe("command expansions", () => {
    it("should expand", () => {
      const output = bindingGypToCmakeLists({
        projectName: "some-project",
        gyp: {
          targets: [
            {
              target_name: "foo",
              sources: ["<!echo bar baz"],
            },
          ],
        },
      });

      // Adding \ between bar and baz, as we expect the "bar baz" to be handled like a path with spaces
      assert(output.includes("add_library(foo SHARED bar\\ baz"));
    });

    it("should expand into lists when prefixed with '@'", () => {
      const output = bindingGypToCmakeLists({
        projectName: "some-project",
        gyp: {
          targets: [
            {
              target_name: "foo",
              sources: ["<!@echo bar baz"],
            },
          ],
        },
      });

      assert(output.includes("add_library(foo SHARED bar baz"));
    });
  });

  describe("defines", () => {
    it("should add defines as target-specific compile definitions", () => {
      const output = bindingGypToCmakeLists({
        projectName: "some-project",
        gyp: {
          targets: [
            {
              target_name: "foo",
              sources: ["foo.cc"],
              defines: ["FOO", "BAR=value"],
            },
          ],
        },
      });

      assert(
        output.includes(
          "target_compile_definitions(foo PRIVATE FOO BAR=value)",
        ),
        `Expected output to include target_compile_definitions:\n${output}`,
      );
    });
  });
});
