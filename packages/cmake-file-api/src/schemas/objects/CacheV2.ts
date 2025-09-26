import * as z from "zod";

const CacheEntryProperty = z.object({
  name: z.string(),
  value: z.string(),
});

const CacheEntry = z.object({
  name: z.string(),
  value: z.string(),
  type: z.string(),
  properties: z.array(CacheEntryProperty),
});

export const CacheV2_0 = z.object({
  kind: z.literal("cache"),
  version: z.object({
    major: z.literal(2),
    minor: z.number().int().nonnegative(),
  }),
  entries: z.array(CacheEntry),
});

export const CacheV2 = z.union([CacheV2_0]);
