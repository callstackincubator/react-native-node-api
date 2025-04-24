import { TestContext } from "node:test";
import os from "node:os";
import fs from "node:fs";
import path from "node:path";

export function setupTempDirectory(
  context: TestContext,
  files: Record<string, string>
) {
  const tempDirectoryPath = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "babel-transform-test-"))
  );

  context.after(() => {
    fs.rmSync(tempDirectoryPath, { recursive: true, force: true });
  });

  for (const [filePath, content] of Object.entries(files)) {
    const fullPath = path.join(tempDirectoryPath, filePath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content, "utf8");
  }

  return tempDirectoryPath;
}
