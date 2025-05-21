import assert from "node:assert/strict";
import fs from "node:fs";

import { parse } from "gyp-parser";

export type GypTarget = {
  target_name: string;
  sources: string[];
  include_dirs?: string[];
  defines?: string[];
};

export type GypBinding = {
  targets: GypTarget[];
};

function assertNoExtraProperties<T extends object>(
  input: T,
  expectedKeys: string[]
) {
  for (const key of Object.keys(input)) {
    if (!expectedKeys.includes(key)) {
      throw new Error(`Unexpected property: ${key}`);
    }
  }
}

export function assertTarget(
  target: unknown,
  disallowUnknownProperties = false
): asserts target is GypTarget {
  assert(typeof target === "object" && target !== null, "Expected an object");
  assert("target_name" in target, "Expected a 'target_name' property");
  assert("sources" in target, "Expected a 'sources' property");
  const { sources } = target;
  assert(Array.isArray(sources), "Expected a 'sources' array");
  assert(
    sources.every((source) => typeof source === "string"),
    "Expected all sources to be strings"
  );
  if ("include_dirs" in target) {
    const { include_dirs } = target;
    assert(
      Array.isArray(include_dirs),
      "Expected 'include_dirs' to be an array"
    );
    assert(
      include_dirs.every((dir) => typeof dir === "string"),
      "Expected all include_dirs to be strings"
    );
  }
  if (disallowUnknownProperties) {
    assertNoExtraProperties(target, ["target_name", "sources", "include_dirs"]);
  }
}

export function assertBinding(
  json: unknown,
  disallowUnknownProperties = false
): asserts json is GypBinding {
  assert(typeof json === "object" && json !== null, "Expected an object");
  assert("targets" in json, "Expected a 'targets' property");
  const { targets } = json;
  assert(Array.isArray(targets), "Expected a 'targets' array");
  for (const target of targets) {
    assertTarget(target, disallowUnknownProperties);
  }
  if (disallowUnknownProperties) {
    assertNoExtraProperties(json, ["targets"]);
  }
}

export function readBindingFile(
  path: string,
  disallowUnknownProperties = false
): GypBinding {
  try {
    const contents = fs.readFileSync(path, "utf-8");
    const json = parse(contents);
    assertBinding(json, disallowUnknownProperties);
    return json;
  } catch (err) {
    throw new Error("Failed to parse binding.gyp file", { cause: err });
  }
}
