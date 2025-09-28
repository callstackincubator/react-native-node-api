import { z } from "zod";

export const ConfigureLogV1_0 = z.object({
  kind: z.literal("configureLog"),
  version: z.object({
    major: z.literal(1),
    minor: z.literal(0),
  }),
  path: z.string(),
  eventKindNames: z.array(z.string()),
});

export const ConfigureLogV1 = z.union([ConfigureLogV1_0]);

export const configureLogSchemaPerVersion = {
  "1.0": ConfigureLogV1_0,
} as const satisfies Record<string, z.ZodType>;
