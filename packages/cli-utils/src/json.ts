import assert from "node:assert/strict";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

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

export function parseJsonObject(contents: string) {
  const value: unknown = JSON.parse(contents);
  assert(isRecord(value), "Expected a JSON object");
  return value;
}

export function getObjectProperty(value: Record<string, unknown>, key: string) {
  const property = value[key];
  if (property === undefined) {
    return undefined;
  }
  assert(isRecord(property), `Expected "${key}" to be an object`);
  return property;
}

export function getStringArrayProperty(
  value: Record<string, unknown>,
  key: string,
) {
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
