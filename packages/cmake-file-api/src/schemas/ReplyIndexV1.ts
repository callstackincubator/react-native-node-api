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

const VersionNumber = z.number();

const VersionObject = z.object({
  major: z.number(),
  minor: z.number().optional(),
});

const VersionSpec = z.union([
  VersionNumber,
  VersionObject,
  z.array(z.union([VersionNumber, VersionObject])),
]);

const QueryRequest = z.object({
  kind: z.string(),
  version: VersionSpec.optional(),
  client: z.unknown().optional(),
});

const ClientStatefulQueryReply = z.object({
  client: z.unknown().optional(),
  requests: z.array(QueryRequest).optional(),
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
        ReplyFileReferenceV1,
        ReplyErrorObject,
        z.record(
          z.string(),
          z.union([
            ReplyFileReferenceV1,
            ReplyErrorObject,
            ClientStatefulQueryReply,
          ]),
        ),
      ])
      .optional(),
  ),
});

const ReplyErrorIndexFileReference = ReplyFileReferenceV1.extend({
  kind: z.enum(["configureLog"]),
});

const ClientStatefulQueryReplyForErrorIndex = ClientStatefulQueryReply.extend({
  responses: z.array(ReplyErrorIndexFileReference).optional(),
});

export const ReplyErrorIndex = IndexReplyV1.extend({
  objects: z.array(ReplyErrorIndexFileReference),
  reply: z.record(
    z.string(),
    z
      .union([
        ReplyErrorIndexFileReference,
        ReplyErrorObject,
        z.record(
          z.string(),
          z.union([
            ReplyErrorIndexFileReference,
            ReplyErrorObject,
            ClientStatefulQueryReplyForErrorIndex,
          ]),
        ),
      ])
      .optional(),
  ),
});
