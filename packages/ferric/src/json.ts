import assert from "node:assert/strict";

/**
 * Indentation used by the first indented line, so rewrites of a hand-maintained
 * JSON file keep the style it was checked in with.
 */
export function detectJsonIndentation(contents: string) {
  const match = contents.match(/\n(\s+)\S/);
  return match ? match[1] : "  ";
}

export function stringifyJson(value: unknown, indentation = "  ") {
  return JSON.stringify(value, null, indentation) + "\n";
}

export function parseJsonObject(contents: string): Record<string, unknown> {
  const value: unknown = JSON.parse(contents);
  assert(
    typeof value === "object" && value !== null && !Array.isArray(value),
    "Expected a JSON object",
  );
  return Object.fromEntries(Object.entries(value));
}

export function getObjectProperty(
  value: Record<string, unknown>,
  key: string,
): Record<string, unknown> | undefined {
  const property = value[key];
  if (property === undefined) {
    return undefined;
  }
  assert(
    typeof property === "object" &&
      property !== null &&
      !Array.isArray(property),
    `Expected "${key}" to be an object`,
  );
  return Object.fromEntries(Object.entries(property));
}

export function getStringArrayProperty(
  value: Record<string, unknown>,
  key: string,
): string[] | undefined {
  const property = value[key];
  if (property === undefined) {
    return undefined;
  }
  assert(Array.isArray(property), `Expected "${key}" to be an array`);
  const result: string[] = [];
  for (const item of property) {
    assert(typeof item === "string", `Expected "${key}" to contain strings`);
    result.push(item);
  }
  return result;
}
