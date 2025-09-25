import fs from "node:fs";
import path from "node:path";

export async function createQuery(
  buildPath: string,
  kind: "codemodel" | "configureLog" | "cache" | "cmakeFiles" | "toolchains",
  majorVersion: string,
) {
  const queryPath = path.join(
    buildPath,
    `.cmake/api/v1/query/${kind}-v${majorVersion}`,
  );
  await fs.promises.mkdir(path.dirname(queryPath), { recursive: true });
  await fs.promises.writeFile(queryPath, "");
}
