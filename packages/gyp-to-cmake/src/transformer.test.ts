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

  describe("cflags", () => {
    it("should add cflags as target-specific compile options", () => {
      const output = bindingGypToCmakeLists({
        projectName: "some-project",
        gyp: {
          targets: [
            {
              target_name: "foo",
              sources: ["foo.cc"],
              cflags: ["-fPIC", "-Wall", "-DNAME=value with space"],
            },
          ],
        },
      });

      assert(
        output.includes(
          "target_compile_options(foo PRIVATE -fPIC -Wall -DNAME=value\\ with\\ space)",
        ),
        `Expected output to include target_compile_options:\n${output}`,
      );
    });

    it("should expand cflags command output into compile options", () => {
      const output = bindingGypToCmakeLists({
        projectName: "some-project",
        gyp: {
          targets: [
            {
              target_name: "foo",
              sources: ["foo.cc"],
              cflags: ["<!@echo -fPIC -Wall"],
            },
          ],
        },
      });

      assert(
        output.includes("target_compile_options(foo PRIVATE -fPIC -Wall)"),
        `Expected expanded cflags in target_compile_options:\n${output}`,
      );
    });
  });

  describe("namespaced targets", () => {
    const gyp = {
      targets: [{ target_name: "addon", sources: ["addon.cc"] }],
    };

    it("should not namespace or set OUTPUT_NAME by default", () => {
      const output = bindingGypToCmakeLists({
        projectName: "some-project",
        gyp,
      });

      assert(
        output.includes("add_library(addon SHARED addon.cc"),
        `Expected an un-namespaced target:\n${output}`,
      );
      assert(
        !output.includes("OUTPUT_NAME"),
        `Expected no OUTPUT_NAME when not namespacing:\n${output}`,
      );
    });

    it("should prefix the target name with the project name", () => {
      const output = bindingGypToCmakeLists({
        projectName: "some-project",
        gyp,
        namespacedTargets: true,
      });

      assert(
        output.includes("add_library(some-project-addon SHARED addon.cc"),
        `Expected a namespaced target:\n${output}`,
      );
      assert(
        !output.includes("add_library(addon "),
        `Expected no un-namespaced target:\n${output}`,
      );
    });

    it("should reference the namespaced target in target-specific commands", () => {
      const output = bindingGypToCmakeLists({
        projectName: "some-project",
        gyp: {
          targets: [
            {
              target_name: "addon",
              sources: ["addon.cc"],
              include_dirs: ["include"],
              defines: ["FOO"],
              cflags: ["-fPIC"],
            },
          ],
        },
        namespacedTargets: true,
        weakNodeApi: true,
        compileFeatures: ["cxx_std_17"],
      });

      for (const command of [
        "target_link_libraries(some-project-addon PRIVATE weak-node-api)",
        "target_include_directories(some-project-addon PRIVATE include)",
        "target_compile_definitions(some-project-addon PRIVATE FOO)",
        "target_compile_options(some-project-addon PRIVATE -fPIC)",
        "target_compile_features(some-project-addon PRIVATE cxx_std_17)",
      ]) {
        assert(
          output.includes(command),
          `Expected output to include "${command}":\n${output}`,
        );
      }
    });

    it("should keep the artifact name un-namespaced in both Apple branches", () => {
      const output = bindingGypToCmakeLists({
        projectName: "some-project",
        gyp,
        namespacedTargets: true,
      });

      // CMake names the framework bundle after OUTPUT_NAME, so both the
      // framework and the plain shared library branch need it. Otherwise the
      // prebuild ends up named after the namespaced target.
      assert.equal(
        output.match(/OUTPUT_NAME addon$/gm)?.length,
        2,
        `Expected OUTPUT_NAME in both branches:\n${output}`,
      );
    });

    it("should set OUTPUT_NAME when Apple framework support is disabled", () => {
      const output = bindingGypToCmakeLists({
        projectName: "some-project",
        gyp,
        namespacedTargets: true,
        appleFramework: false,
      });

      assert(
        output.includes("set_target_properties(some-project-addon PROPERTIES"),
        `Expected properties on the namespaced target:\n${output}`,
      );
      assert.equal(
        output.match(/OUTPUT_NAME addon$/gm)?.length,
        1,
        `Expected a single OUTPUT_NAME:\n${output}`,
      );
    });
  });
});
