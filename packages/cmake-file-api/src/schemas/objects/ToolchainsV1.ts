import * as z from "zod";

const ToolchainCompilerImplicit = z.object({
  includeDirectories: z.array(z.string()).optional(),
  linkDirectories: z.array(z.string()).optional(),
  linkFrameworkDirectories: z.array(z.string()).optional(),
  linkLibraries: z.array(z.string()).optional(),
});

const ToolchainCompiler = z.object({
  path: z.string().optional(),
  id: z.string().optional(),
  version: z.string().optional(),
  target: z.string().optional(),
  implicit: ToolchainCompilerImplicit,
});

const Toolchain = z.object({
  language: z.string(),
  compiler: ToolchainCompiler,
  sourceFileExtensions: z.array(z.string()).optional(),
});

export const ToolchainsV1_0 = z.object({
  kind: z.literal("toolchains"),
  version: z.object({
    major: z.literal(1),
    minor: z.number().int().nonnegative(),
  }),
  toolchains: z.array(Toolchain),
});

export const ToolchainsV1 = z.union([ToolchainsV1_0]);

export const toolchainsSchemaPerVersion = {
  "1.0": ToolchainsV1_0,
} as const satisfies Record<string, z.ZodType>;
