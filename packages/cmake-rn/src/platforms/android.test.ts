import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { toDefineArguments } from "../helpers.js";
import { buildCommonDefinitions } from "./android.js";

function baseArgs(
  overrides: Partial<Parameters<typeof buildCommonDefinitions>[0]> = {},
) {
  return {
    configuration: "Release" as const,
    ndkPath: "/opt/ndk",
    androidSdkVersion: "24",
    ccachePath: null,
    define: [],
    ...overrides,
  };
}

describe("buildCommonDefinitions", () => {
  it("defaults ANDROID_STL to c++_shared", () => {
    const args = toDefineArguments(buildCommonDefinitions(baseArgs()));
    const index = args.indexOf("-D");
    assert(index >= 0);
    assert(args.includes("ANDROID_STL=c++_shared"));
  });

  it("lets a consumer override ANDROID_STL via --define", () => {
    // CMake resolves a cache variable passed multiple times via `-D` to its
    // *last* occurrence on the command line, so what matters is which
    // ANDROID_STL entry comes last - not merely that c++_static is present.
    const args = toDefineArguments(
      buildCommonDefinitions(
        baseArgs({ define: [{ ANDROID_STL: "c++_static" }] }),
      ),
    );
    const stlEntries = args.filter((arg) => arg.startsWith("ANDROID_STL="));
    assert.deepEqual(stlEntries, [
      "ANDROID_STL=c++_shared",
      "ANDROID_STL=c++_static",
    ]);
  });

  it("applies the user's --define after (so it wins over) every default", () => {
    const definitions = buildCommonDefinitions(
      baseArgs({ define: [{ ANDROID_STL: "c++_static" }] }),
    );
    // The user-provided define must be the last entry, since CMake resolves
    // a -D variable passed multiple times to its last occurrence.
    assert.deepEqual(definitions.at(-1), { ANDROID_STL: "c++_static" });
  });

  it("includes ccache launcher variables when a ccache path is given", () => {
    const args = toDefineArguments(
      buildCommonDefinitions(baseArgs({ ccachePath: "/usr/bin/ccache" })),
    );
    assert(args.includes("CMAKE_C_COMPILER_LAUNCHER=/usr/bin/ccache"));
    assert(args.includes("CMAKE_CXX_COMPILER_LAUNCHER=/usr/bin/ccache"));
  });
});
