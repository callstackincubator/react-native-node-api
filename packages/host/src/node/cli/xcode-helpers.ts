import assert from "node:assert";
import path from "node:path";
import fs from "node:fs";

// Using xmldom here because this is what @expo/plist uses internally and we might as well re-use it here.
// Types come from packages/host/types/xmldom.d.ts (path mapping in tsconfig.node.json) to avoid pulling in lib "dom".
import { DOMParser } from "@xmldom/xmldom";

export type XcodeWorkspace = {
  version: string;
  fileRefs: {
    location: string;
  }[];
};

export async function readXcodeWorkspace(workspacePath: string) {
  const dataFilePath = path.join(workspacePath, "contents.xcworkspacedata");
  assert(
    fs.existsSync(dataFilePath),
    `Expected a contents.xcworkspacedata file at '${dataFilePath}'`,
  );
  const xml = await fs.promises.readFile(dataFilePath, "utf-8");
  const dom = new DOMParser().parseFromString(xml, "application/xml");
  const version = dom.documentElement.getAttribute("version") ?? "1.0";
  assert.equal(version, "1.0", "Unexpected workspace version");

  const result: XcodeWorkspace = {
    version,
    fileRefs: [],
  };
  const fileRefs = dom.documentElement.getElementsByTagName("FileRef");
  for (let i = 0; i < fileRefs.length; i++) {
    const fileRef = fileRefs.item(i);
    if (fileRef) {
      const location = fileRef.getAttribute("location");
      if (location) {
        result.fileRefs.push({
          location,
        });
      }
    }
  }
  return result;
}

export async function findXcodeWorkspace(fromPath: string) {
  // Check if the directory contains a Xcode workspace
  const xcodeWorkspace = fs.promises.glob(path.join("*.xcworkspace"), {
    cwd: fromPath,
  });

  for await (const workspace of xcodeWorkspace) {
    return path.join(fromPath, workspace);
  }

  // Check if the directory contain an ios directory and call recursively from that
  const iosDirectory = path.join(fromPath, "ios");
  if (fs.existsSync(iosDirectory)) {
    return findXcodeWorkspace(iosDirectory);
  }

  // TODO: Consider continuing searching in parent directories
  throw new Error(`No Xcode workspace found in '${fromPath}'`);
}

export async function findXcodeProject(fromPath: string) {
  // Read the workspace contents to find the first project
  const workspacePath = await findXcodeWorkspace(fromPath);
  const workspace = await readXcodeWorkspace(workspacePath);
  // Resolve the first project location to an absolute path
  assert(
    workspace.fileRefs.length > 0,
    "Expected at least one project in the workspace",
  );
  const [firstProject] = workspace.fileRefs;
  // Extract the path from the scheme (using a regex)
  const match = firstProject.location.match(/^([^:]*):(.*)$/);
  assert(match, "Expected a project path in the workspace");
  const [, scheme, projectPath] = match;
  assert(scheme, "Expected a scheme in the fileRef location");
  assert(projectPath, "Expected a path in the fileRef location");
  if (scheme === "absolute") {
    return projectPath;
  } else if (scheme === "group") {
    return path.resolve(path.dirname(workspacePath), projectPath);
  } else {
    throw new Error(`Unexpected scheme: ${scheme}`);
  }
}
