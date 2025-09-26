import * as z from "zod";

export const ReplyFileReferenceV1 = z.object({
  kind: z.enum([
    "codemodel",
    "configureLog",
    "cache",
    "cmakeFiles",
    "toolchains",
  ]),
  version: z.object({
    major: z.number(),
    minor: z.number(),
  }),
  jsonFile: z.string(),
});

const ReplyErrorObject = z.object({
  error: z.string(),
});

const ClientStatefulQueryResponse = z.object({
  client: z.unknown().optional(),
  requests: z
    .array(
      z.object({
        kind: z.string(),
        version: z
          .union([
            z.number(),
            z.object({
              major: z.number(),
              minor: z.number().optional(),
            }),
            z.array(
              z.union([
                z.number(),
                z.object({
                  major: z.number(),
                  minor: z.number().optional(),
                }),
              ]),
            ),
          ])
          .optional(),
        client: z.unknown().optional(),
      }),
    )
    .optional(),
  responses: z.array(ReplyFileReferenceV1).optional(),
});

export const IndexReplyV1 = z.object({
  cmake: z.object({
    version: z.object({
      major: z.number(),
      minor: z.number(),
      patch: z.number(),
      suffix: z.string(),
      string: z.string(),
      isDirty: z.boolean(),
    }),
    paths: z.object({
      cmake: z.string(),
      ctest: z.string(),
      cpack: z.string(),
      root: z.string(),
    }),
    generator: z.object({
      multiConfig: z.boolean(),
      name: z.string(),
      platform: z.string().optional(),
    }),
  }),
  objects: z.array(ReplyFileReferenceV1),
  reply: z.record(
    z.string(),
    z
      .union([
        // For <kind>-v<major> entries and <unknown> entries
        ReplyFileReferenceV1,
        ReplyErrorObject,
        // For client-<client> entries - nested object structure
        z.record(
          z.string(),
          z.union([
            ReplyFileReferenceV1,
            ReplyErrorObject,
            ClientStatefulQueryResponse, // For query.json
          ]),
        ),
      ])
      .optional(),
  ),
});
