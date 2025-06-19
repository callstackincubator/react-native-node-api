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
            sources: ["file\\with\\win32\\seperator.cc"],
          },
        ],
      },
    });

    assert(output.includes("add_library(foo SHARED file/with/win32/seperator.cc"));
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
});
