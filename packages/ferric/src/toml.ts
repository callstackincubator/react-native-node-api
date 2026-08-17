/**
 * The tables of a TOML document, mapped to the keys they declare. This is only
 * precise enough to answer "is this declared?" for the manifests Cargo writes —
 * values (and the tables nested inside inline tables or arrays) are ignored.
 */
export function parseTomlTables(contents: string) {
  const result = new Map<string, Set<string>>();
  let currentTable = "";
  result.set(currentTable, new Set());
  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith("#")) {
      continue;
    }
    const table = trimmed.match(/^\[\[?\s*([^\]]+?)\s*\]\]?/);
    if (table) {
      currentTable = table[1];
      if (!result.has(currentTable)) {
        result.set(currentTable, new Set());
      }
      continue;
    }
    const key = trimmed.match(/^("[^"]*"|[A-Za-z0-9_.-]+)\s*=/);
    if (key) {
      result.get(currentTable)?.add(unquote(key[1]));
    }
  }
  return result;
}

/**
 * Determine if a table declares a key, either directly (`napi = "3"` under
 * `[dependencies]`) or as a sub-table (`[dependencies.napi]`).
 */
export function hasTomlKey(
  tables: Map<string, Set<string>>,
  table: string,
  key: string,
) {
  return (
    tables.get(table)?.has(key) === true ||
    tables.has(`${table}.${key}`) ||
    tables.has(`${table}."${key}"`)
  );
}

function unquote(value: string) {
  return value.startsWith('"') ? value.slice(1, -1) : value;
}
