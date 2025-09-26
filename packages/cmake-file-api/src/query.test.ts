import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, type TestContext } from "node:test";

import {
  createSharedStatelessQuery,
  createClientStatelessQuery,
  createClientStatefulQuery,
  type StatefulQuery,
} from "./query.js";

function createTempBuildDir(context: TestContext) {
  const tmpPath = fs.mkdtempSync(path.join(os.tmpdir(), "cmake-api-test-"));

  context.after(() => {
    fs.rmSync(tmpPath, { recursive: true, force: true });
  });

  return tmpPath;
}

describe("createSharedStatelessQuery", () => {
  it("creates a shared stateless query file", async function (context) {
    const buildPath = createTempBuildDir(context);

    await createSharedStatelessQuery(buildPath, "codemodel", "2");

    const queryPath = path.join(buildPath, ".cmake/api/v1/query/codemodel-v2");
    assert(fs.existsSync(queryPath), "Query file should exist");

    const content = fs.readFileSync(queryPath, "utf-8");
    assert.strictEqual(content, "", "Query file should be empty");
  });

  it("creates directory structure recursively", async function (context) {
    const buildPath = createTempBuildDir(context);

    await createSharedStatelessQuery(buildPath, "cache", "2");

    const queryDir = path.join(buildPath, ".cmake/api/v1/query");
    assert(fs.existsSync(queryDir), "Query directory should exist");

    const queryPath = path.join(queryDir, "cache-v2");
    assert(fs.existsSync(queryPath), "Query file should exist");
  });

  it("supports all object kinds", async function (context) {
    const buildPath = createTempBuildDir(context);
    const kinds = [
      "codemodel",
      "configureLog",
      "cache",
      "cmakeFiles",
      "toolchains",
    ] as const;

    for (const kind of kinds) {
      await createSharedStatelessQuery(buildPath, kind, "1");

      const queryPath = path.join(buildPath, `.cmake/api/v1/query/${kind}-v1`);
      assert(fs.existsSync(queryPath), `Query file for ${kind} should exist`);
    }
  });
});

describe("createClientStatelessQuery", () => {
  it("creates a client stateless query file", async function (context) {
    const buildPath = createTempBuildDir(context);

    await createClientStatelessQuery(buildPath, "my-client", "codemodel", "2");

    const queryPath = path.join(
      buildPath,
      ".cmake/api/v1/query/client-my-client/codemodel-v2",
    );
    assert(fs.existsSync(queryPath), "Client query file should exist");

    const content = fs.readFileSync(queryPath, "utf-8");
    assert.strictEqual(content, "", "Client query file should be empty");
  });

  it("creates client directory structure", async function (context) {
    const buildPath = createTempBuildDir(context);

    await createClientStatelessQuery(buildPath, "test-client", "cache", "2");

    const clientDir = path.join(
      buildPath,
      ".cmake/api/v1/query/client-test-client",
    );
    assert(fs.existsSync(clientDir), "Client directory should exist");

    const queryPath = path.join(clientDir, "cache-v2");
    assert(fs.existsSync(queryPath), "Client query file should exist");
  });

  it("supports multiple clients", async function (context) {
    const buildPath = createTempBuildDir(context);

    await createClientStatelessQuery(buildPath, "client-a", "codemodel", "2");
    await createClientStatelessQuery(buildPath, "client-b", "cache", "2");

    const clientAPath = path.join(
      buildPath,
      ".cmake/api/v1/query/client-client-a/codemodel-v2",
    );
    const clientBPath = path.join(
      buildPath,
      ".cmake/api/v1/query/client-client-b/cache-v2",
    );

    assert(fs.existsSync(clientAPath), "Client A query should exist");
    assert(fs.existsSync(clientBPath), "Client B query should exist");
  });
});

describe("createClientStatefulQuery", () => {
  it("creates a client stateful query file with simple request", async function (context) {
    const buildPath = createTempBuildDir(context);

    const query: StatefulQuery = {
      requests: [{ kind: "codemodel", version: 2 }],
    };

    await createClientStatefulQuery(buildPath, "my-client", query);

    const queryPath = path.join(
      buildPath,
      ".cmake/api/v1/query/client-my-client/query.json",
    );
    assert(fs.existsSync(queryPath), "Stateful query file should exist");

    const content = fs.readFileSync(queryPath, "utf-8");
    const parsed = JSON.parse(content) as StatefulQuery;

    assert.deepStrictEqual(parsed, query, "Parsed query should match input");
  });

  it("creates stateful query with complex version specifications", async function (context) {
    const buildPath = createTempBuildDir(context);

    const query: StatefulQuery = {
      requests: [
        {
          kind: "codemodel",
          version: [2, { major: 1, minor: 5 }],
        },
        {
          kind: "cache",
          version: { major: 2, minor: 0 },
        },
        {
          kind: "toolchains",
        },
      ],
      client: { name: "test-tool", version: "1.0.0" },
    };

    await createClientStatefulQuery(buildPath, "advanced-client", query);

    const queryPath = path.join(
      buildPath,
      ".cmake/api/v1/query/client-advanced-client/query.json",
    );
    const content = fs.readFileSync(queryPath, "utf-8");
    const parsed = JSON.parse(content) as StatefulQuery;

    assert.deepStrictEqual(parsed, query, "Complex query should be preserved");
  });

  it("creates well-formatted JSON", async function (context) {
    const buildPath = createTempBuildDir(context);

    const query: StatefulQuery = {
      requests: [
        { kind: "codemodel", version: 2 },
        { kind: "cache", version: 2 },
      ],
    };

    await createClientStatefulQuery(buildPath, "format-test", query);

    const queryPath = path.join(
      buildPath,
      ".cmake/api/v1/query/client-format-test/query.json",
    );
    const content = fs.readFileSync(queryPath, "utf-8");

    // Should be pretty-printed with 2-space indentation
    assert(content.includes("  "), "JSON should be indented");
    assert(content.includes("\n"), "JSON should have newlines");

    // Should be valid JSON
    assert.doesNotThrow(() => JSON.parse(content), "Should be valid JSON");
  });

  it("supports client-specific data in requests", async function (context) {
    const buildPath = createTempBuildDir(context);

    const query: StatefulQuery = {
      requests: [
        {
          kind: "codemodel",
          version: 2,
          client: { requestId: "req-001", priority: "high" },
        },
      ],
      client: { sessionId: "session-123" },
    };

    await createClientStatefulQuery(buildPath, "custom-client", query);

    const queryPath = path.join(
      buildPath,
      ".cmake/api/v1/query/client-custom-client/query.json",
    );
    const content = fs.readFileSync(queryPath, "utf-8");
    const parsed = JSON.parse(content) as StatefulQuery;

    assert.deepStrictEqual(parsed.requests[0]?.client, {
      requestId: "req-001",
      priority: "high",
    });
    assert.deepStrictEqual(parsed.client, { sessionId: "session-123" });
  });
});
