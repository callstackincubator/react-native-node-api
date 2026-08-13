import assert from "node:assert/strict";
import path from "node:path";
import { describe, it } from "node:test";

import { createOutputPathResolver, expandTemplate } from "./output-path.js";
import { getArtifactName } from "./helpers.js";

describe("expandTemplate", () => {
  it("expands known placeholders", () => {
    assert.equal(
      expandTemplate("{build}/{configuration}", {
        build: "/tmp/build",
        configuration: "Release",
      }),
      "/tmp/build/Release",
    );
  });

  it("leaves unknown placeholders untouched, to allow a later pass", () => {
    assert.equal(
      expandTemplate("{targetSourceDir}/build/{configuration}", {
        configuration: "Release",
      }),
      "{targetSourceDir}/build/Release",
    );
  });
});

describe("createOutputPathResolver", () => {
  const source = path.resolve("/projects/my-app");

  it("resolves a top-level target next to the source directory", () => {
    const resolve = createOutputPathResolver(
      "{targetSourceDir}/build/Release",
      source,
    );
    // A single-addon project reports "." as the target's source directory,
    // which has to keep emitting where it always has.
    assert.equal(resolve("."), path.join(source, "build/Release"));
  });

  it("resolves each target of a multi-addon project next to its own sources", () => {
    const resolve = createOutputPathResolver(
      "{targetSourceDir}/build/Release",
      source,
    );
    assert.equal(
      resolve("examples/hello"),
      path.join(source, "examples/hello/build/Release"),
    );
    assert.equal(
      resolve("examples/goodbye"),
      path.join(source, "examples/goodbye/build/Release"),
    );
  });

  it("handles a target source directory outside the top-level source", () => {
    const resolve = createOutputPathResolver(
      "{targetSourceDir}/build/Release",
      source,
    );
    const outside = path.resolve("/elsewhere/vendored");
    assert.equal(resolve(outside), path.join(outside, "build/Release"));
  });

  it("supports a template without the placeholder", () => {
    const resolve = createOutputPathResolver("/tmp/out", source);
    assert.equal(resolve("examples/hello"), path.resolve("/tmp/out"));
  });
});

describe("getArtifactName", () => {
  it("derives the name from the artifact rather than the target", () => {
    // gyp-to-cmake --namespaced-targets builds "addon.node" from a target named
    // "<project>-addon", and the prebuild has to keep the artifact's name.
    assert.equal(getArtifactName("examples/hello/addon.node"), "addon");
  });

  it("handles framework artifacts", () => {
    assert.equal(getArtifactName("out/addon.framework/addon"), "addon");
  });

  it("strips the prefix CMake adds to shared libraries", () => {
    // weak-node-api does not clear PREFIX, so it builds a "libweak-node-api.so"
    // and has to keep emitting a "weak-node-api.android.node" — the path
    // packages/host/android/build.gradle points its jniLibs at.
    assert.equal(getArtifactName("libweak-node-api.so"), "weak-node-api");
  });
});
