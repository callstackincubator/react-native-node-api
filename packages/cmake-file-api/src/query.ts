import fs from "node:fs";
import path from "node:path";

/**
 * Creates a shared stateless query file for the specified object kind and major version.
 * These are stateless shared queries not owned by any specific client.
 *
 * @param buildPath Path to the build directory
 * @param kind Object kind to query for
 * @param majorVersion Major version number as string
 */
export async function createSharedStatelessQuery(
  buildPath: string,
  kind: "codemodel" | "configureLog" | "cache" | "cmakeFiles" | "toolchains",
  majorVersion: string,
) {
  const queryPath = path.join(
    buildPath,
    `.cmake/api/v1/query/${kind}-v${majorVersion}`,
  );
  await fs.promises.mkdir(path.dirname(queryPath), { recursive: true });
  await fs.promises.writeFile(queryPath, "");
}

/**
 * Creates a client stateless query file for the specified client, object kind and major version.
 * These are stateless queries owned by the specified client.
 *
 * @param buildPath Path to the build directory
 * @param clientName Unique identifier for the client
 * @param kind Object kind to query for
 * @param majorVersion Major version number as string
 */
export async function createClientStatelessQuery(
  buildPath: string,
  clientName: string,
  kind: "codemodel" | "configureLog" | "cache" | "cmakeFiles" | "toolchains",
  majorVersion: string,
) {
  const queryPath = path.join(
    buildPath,
    `.cmake/api/v1/query/client-${clientName}/${kind}-v${majorVersion}`,
  );
  await fs.promises.mkdir(path.dirname(queryPath), { recursive: true });
  await fs.promises.writeFile(queryPath, "");
}

/**
 * Version specification for stateful queries
 */
export type VersionSpec =
  | number // major version only
  | { major: number; minor?: number } // major with optional minor
  | (number | { major: number; minor?: number })[]; // array of version specs

/**
 * Request specification for stateful queries
 */
export interface QueryRequest {
  kind: "codemodel" | "configureLog" | "cache" | "cmakeFiles" | "toolchains";
  version?: VersionSpec;
  client?: unknown; // Reserved for client use
}

/**
 * Stateful query specification
 */
export interface StatefulQuery {
  requests: QueryRequest[];
  client?: unknown; // Reserved for client use
}

/**
 * Creates a client stateful query file (query.json) for the specified client.
 * These are stateful queries owned by the specified client that can request
 * specific versions and get only the most recent version recognized by CMake.
 *
 * @param buildPath Path to the build directory
 * @param clientName Unique identifier for the client
 * @param query Stateful query specification
 */
export async function createClientStatefulQuery(
  buildPath: string,
  clientName: string,
  query: StatefulQuery,
) {
  const queryPath = path.join(
    buildPath,
    `.cmake/api/v1/query/client-${clientName}/query.json`,
  );
  await fs.promises.mkdir(path.dirname(queryPath), { recursive: true });
  await fs.promises.writeFile(queryPath, JSON.stringify(query, null, 2));
}

/**
 * @deprecated Use createSharedStatelessQuery instead
 */
export const createQuery = createSharedStatelessQuery;
