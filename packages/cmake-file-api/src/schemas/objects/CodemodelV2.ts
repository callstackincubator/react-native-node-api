import * as z from "zod";

const index = z.number().int().nonnegative();

const MinimumCMakeVersion = z.object({
  string: z.string(),
});

const DirectoryV2_0 = z.object({
  source: z.string(),
  build: z.string(),
  parentIndex: index.optional(),
  childIndexes: z.array(index).optional(),
  projectIndex: index,
  targetIndexes: z.array(index).optional(),
  minimumCMakeVersion: MinimumCMakeVersion.optional(),
  hasInstallRule: z.boolean().optional(),
});

const DirectoryV2_3 = DirectoryV2_0.extend({
  jsonFile: z.string(),
});

const Project = z.object({
  name: z.string(),
  parentIndex: index.optional(),
  childIndexes: z.array(index).optional(),
  directoryIndexes: z.array(index),
  targetIndexes: z.array(index).optional(),
});

const Target = z.object({
  name: z.string(),
  id: z.string(),
  directoryIndex: index,
  projectIndex: index,
  jsonFile: z.string(),
});

const ConfigurationV2_0 = z.object({
  name: z.string(),
  directories: z.array(DirectoryV2_0),
  projects: z.array(Project),
  targets: z.array(Target),
});

const ConfigurationV2_3 = ConfigurationV2_0.extend({
  directories: z.array(DirectoryV2_3),
});

export const CodemodelV2_0 = z.object({
  kind: z.literal("codemodel"),
  version: z.object({
    major: z.literal(2),
    minor: z.number().max(2),
  }),
  paths: z.object({
    source: z.string(),
    build: z.string(),
  }),
  configurations: z.array(ConfigurationV2_0),
});

export const CodemodelV2_3 = CodemodelV2_0.extend({
  version: z.object({
    major: z.literal(2),
    minor: z.number().min(3),
  }),
  configurations: z.array(ConfigurationV2_3),
});

export const CodemodelV2 = z.union([CodemodelV2_0, CodemodelV2_3]);

export const codemodelFilesSchemaPerVersion = {
  "2.0": CodemodelV2_0,
  "2.3": CodemodelV2_3,
} as const satisfies Record<string, z.ZodType>;
