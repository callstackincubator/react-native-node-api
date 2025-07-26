import { TestContext } from "node:test";
import os from "node:os";
import fs from "node:fs";
import path from "node:path";

export interface FileMap {
  [key: string]: string | FileMap;
}

function writeFiles(fromPath: string, files: FileMap) {
  for (const [filePath, content] of Object.entries(files)) {
    const fullPath = path.join(fromPath, filePath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    if (typeof content === "string") {
      fs.writeFileSync(fullPath, content, "utf8");
    } else {
      writeFiles(fullPath, content);
    }
  }
}

export function setupTempDirectory(context: TestContext, files: FileMap) {
  const tempDirectoryPath = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "react-native-node-api-test-")),
  );

  context.after(() => {
    fs.rmSync(tempDirectoryPath, { recursive: true, force: true });
  });

  writeFiles(tempDirectoryPath, files);

  return tempDirectoryPath;
}
