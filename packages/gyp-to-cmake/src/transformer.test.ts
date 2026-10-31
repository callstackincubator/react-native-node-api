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

  describe("in-string expansions", () => {
    it("should expand commands inside a value", () => {
      const output = bindingGypToCmakeLists({
        projectName: "some-project",
        gyp: {
          targets: [
            {
              target_name: "foo",
              sources: ["foo.cc"],
              include_dirs: ["<!(echo some)/include"],
            },
          ],
        },
      });

      assert(
        output.includes("target_include_directories(foo PRIVATE some/include"),
        `Expected an expanded include directory:\n${output}`,
      );
    });

    it("should expand into lists when '<!@(...)' is the entire value", () => {
      const output = bindingGypToCmakeLists({
        projectName: "some-project",
        gyp: {
          targets: [{ target_name: "foo", sources: ["<!@(echo bar baz)"] }],
        },
      });

      assert(output.includes("add_library(foo SHARED bar baz"));
    });

    it("should expand module_root_dir to the source directory", () => {
      const output = bindingGypToCmakeLists({
        projectName: "some-project",
        gyp: {
          targets: [
            {
              target_name: "foo",
              sources: ["<(module_root_dir)/foo.cc"],
              cflags: ["-I<(module_root_dir)/inc"],
            },
          ],
        },
      });

      assert(
        output.includes(
          "add_library(foo SHARED ${CMAKE_CURRENT_SOURCE_DIR}/foo.cc",
        ),
        `Expected an expanded source:\n${output}`,
      );
      assert(
        output.includes(
          'target_compile_options(foo PRIVATE "SHELL:-I\\"${CMAKE_CURRENT_SOURCE_DIR}\\"/inc")',
        ),
        `Expected an expanded compile option:\n${output}`,
      );
    });

    it("should throw on unknown variables when asked to", () => {
      assert.throws(
        () =>
          bindingGypToCmakeLists({
            projectName: "some-project",
            unsupportedBehaviour: "throw",
            gyp: {
              targets: [{ target_name: "foo", sources: ["<(unknown)/foo.cc"] }],
            },
          }),
        /Unsupported variable expansion: <\(unknown\)/,
      );
    });
  });

  describe("cflags", () => {
    it("should add cflags as a single shell option", () => {
      const output = bindingGypToCmakeLists({
        projectName: "some-project",
        gyp: {
          targets: [
            {
              target_name: "foo",
              sources: ["foo.cc"],
              cflags: ["-fPIC", "-include a.h", "-include", "b.h"],
            },
          ],
        },
      });

      assert(
        output.includes(
          'target_compile_options(foo PRIVATE "SHELL:-fPIC -include a.h -include b.h")',
        ),
        `Expected output to include target_compile_options:\n${output}`,
      );
    });

    it("should only add cflags when not targeting Apple or Windows", () => {
      const output = bindingGypToCmakeLists({
        projectName: "some-project",
        gyp: {
          targets: [
            { target_name: "foo", sources: ["foo.cc"], cflags: ["-fPIC"] },
          ],
        },
      });

      assert(
        output.includes(
          'if(NOT APPLE AND NOT WIN32)\n  target_compile_options(foo PRIVATE "SHELL:-fPIC")\nendif()',
        ),
        `Expected guarded target_compile_options:\n${output}`,
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
        output.includes(
          'target_compile_options(foo PRIVATE "SHELL:-fPIC -Wall")',
        ),
        `Expected expanded cflags in target_compile_options:\n${output}`,
      );
    });
  });

  describe("ldflags", () => {
    it("should add ldflags as a single shell option", () => {
      const output = bindingGypToCmakeLists({
        projectName: "some-project",
        gyp: {
          targets: [
            {
              target_name: "foo",
              sources: ["foo.cc"],
              ldflags: ["-Wl,--as-needed", "-Wl,-rpath,'$$ORIGIN'"],
            },
          ],
        },
      });

      assert(
        output.includes(
          'target_link_options(foo PRIVATE "SHELL:-Wl,--as-needed -Wl,-rpath,\\$ORIGIN")',
        ),
        `Expected output to include target_link_options:\n${output}`,
      );
    });

    it("should expand ldflags command output into link options", () => {
      const output = bindingGypToCmakeLists({
        projectName: "some-project",
        gyp: {
          targets: [
            {
              target_name: "foo",
              sources: ["foo.cc"],
              ldflags: ["<!@echo -Wl,--as-needed -pthread"],
            },
          ],
        },
      });

      assert(
        output.includes(
          'target_link_options(foo PRIVATE "SHELL:-Wl,--as-needed -pthread")',
        ),
        `Expected expanded ldflags in target_link_options:\n${output}`,
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
        'target_compile_options(some-project-addon PRIVATE "SHELL:-fPIC")',
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
