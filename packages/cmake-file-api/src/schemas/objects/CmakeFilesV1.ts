import * as z from "zod";

const CmakeFilesInput = z.object({
  path: z.string(),
  isGenerated: z.boolean().optional(),
  isExternal: z.boolean().optional(),
  isCMake: z.boolean().optional(),
});

const CmakeFilesGlobDependent = z.object({
  expression: z.string(),
  recurse: z.boolean().optional(),
  listDirectories: z.boolean().optional(),
  followSymlinks: z.boolean().optional(),
  relative: z.string().optional(),
  paths: z.array(z.string()),
});

export const CmakeFilesV1_0 = z.object({
  kind: z.literal("cmakeFiles"),
  version: z.object({
    major: z.literal(1),
    minor: z.number().max(0),
  }),
  paths: z.object({
    source: z.string(),
    build: z.string(),
  }),
  inputs: z.array(CmakeFilesInput),
});

export const CmakeFilesV1_1 = CmakeFilesV1_0.extend({
  version: z.object({
    major: z.literal(1),
    minor: z.number().min(1),
  }),
  globsDependent: z.array(CmakeFilesGlobDependent).optional(),
});

export const CmakeFilesV1 = z.union([CmakeFilesV1_0, CmakeFilesV1_1]);
