import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { getResolvedFeatures, type CargoResolvedMetadata } from "./features.js";

const NAPI_SYS_ID =
  "registry+https://github.com/rust-lang/crates.io-index#napi-sys@3.4.0";
const NAPI_ID =
  "registry+https://github.com/rust-lang/crates.io-index#napi@3.14.2";

function createMetadata(napiSysFeatures: string[]): CargoResolvedMetadata {
  return {
    packages: [
      { id: NAPI_SYS_ID, name: "napi-sys" },
      { id: NAPI_ID, name: "napi" },
    ],
    resolve: {
      nodes: [
        { id: NAPI_SYS_ID, features: napiSysFeatures },
        { id: NAPI_ID, features: ["default", "dyn-symbols"] },
      ],
    },
  };
}

describe("getResolvedFeatures", () => {
  it("returns the features resolved for the package", () => {
    const features = getResolvedFeatures(
      createMetadata(["dyn-symbols", "napi1"]),
      "napi-sys",
    );
    assert.deepEqual([...features], ["dyn-symbols", "napi1"]);
  });

  it("ignores features of other packages", () => {
    const features = getResolvedFeatures(createMetadata(["napi1"]), "napi-sys");
    assert.deepEqual([...features], ["napi1"]);
  });

  it("returns no features when the package isn't a dependency", () => {
    const metadata = createMetadata(["napi1"]);
    assert.equal(getResolvedFeatures(metadata, "missing").size, 0);
    assert.equal(
      getResolvedFeatures({ ...metadata, resolve: null }, "napi-sys").size,
      0,
    );
  });
});
