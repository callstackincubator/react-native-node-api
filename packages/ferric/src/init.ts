import { Command } from "@commander-js/extra-typings";
import fs from "node:fs";
import fsPromise from "node:fs/promises";
import path from "node:path";
import { oraPromise } from "ora";
import { prettyPath } from "react-native-node-api";

export const initCommand = new Command("init")
  .description("Generate the project scaffold")
  .argument("<name>", "Type the project name")
  .action(async (str) => {
    const projectName = str && str.length > 0 ? str : "ferric_project";
    const generatePath = path.join(process.cwd(), projectName);
    await oraPromise(
      generateProject({ outputPath: generatePath, projectName }),
      {
        text: "Generating project",
        successText: `Generated project ${prettyPath(generatePath)}`,
        failText: (error) => `Failed to generate the project: ${error.message}`,
      },
    );
  });

async function replaceStrInFile(
  filePath: string,
  oldStr: string,
  newStr: string,
) {
  const content = await fsPromise.readFile(filePath, "utf8");
  const updatedContent = content.replaceAll(oldStr, newStr);
  await fsPromise.writeFile(filePath, updatedContent, "utf8");
}

function createFolder(path: string) {
  if (!fs.existsSync(path)) {
    fs.mkdirSync(path);
  }
}

async function copyAllTemplateFiles(outputFilePath: string) {
  const templateDir = path.join(import.meta.dirname, "templates");
  await fsPromise.cp(templateDir, outputFilePath, {
    recursive: true,
  });
  await fsPromise.rename(
    `${outputFilePath}/lib.rs`,
    `${outputFilePath}/src/lib.rs`,
  );
  await fsPromise.rename(
    `${outputFilePath}/gitignore`,
    `${outputFilePath}/.gitignore`,
  );
}

async function generateProject({
  outputPath,
  projectName,
}: {
  outputPath: string;
  projectName: string;
}) {
  createFolder(outputPath);
  createFolder(`${outputPath}/src`);
  await copyAllTemplateFiles(outputPath);
  await replaceStrInFile(
    `${outputPath}/package.json`,
    "project_name",
    projectName,
  );
  await replaceStrInFile(
    `${outputPath}/Cargo.toml`,
    "project_name",
    projectName,
  );
}
