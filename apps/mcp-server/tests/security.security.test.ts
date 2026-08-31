import { createServer, type Server } from "node:http";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LIMITS } from "../../../packages/contracts/src/index.js";
import {
  checkpointInput,
  createTestSystem,
  handoffInput,
  projectInput,
  type TestSystem,
} from "../../../packages/test-support/src/index.js";
import { DevTokenAuthenticator } from "../src/auth.js";
import { createRelayHttpServer, type RelayHttpServer } from "../src/http.js";
import { SafeLogger } from "../src/logger.js";
import { PrincipalRateLimiter } from "../src/rate-limit.js";

const tokenA = "relay-test-token-a-1234567890";
const tokenB = "relay-test-token-b-1234567890";

const asRecord = (result: unknown): Record<string, unknown> =>
  (result as { structuredContent: Record<string, unknown> }).structuredContent;

const connect = async (url: string, token: string): Promise<Client> => {
  const client = new Client({ name: "relay-security-test", version: "1.0.0" });
  await client.connect(
    new StreamableHTTPClientTransport(new URL(url), {
      requestInit: { headers: { authorization: `Bearer ${token}` } },
    }),
  );
  return client;
};

describe("Relay transport security", () => {
  let system: TestSystem;
  let relay: RelayHttpServer;
  let url: string;
  let logs: string[];
  const clients: Client[] = [];

  beforeEach(async () => {
    system = createTestSystem();
    logs = [];
    relay = createRelayHttpServer({
      service: system.service,
      authenticator: new DevTokenAuthenticator(
        new Map([
          [tokenA, "principal-a"],
          [tokenB, "principal-b"],
        ]),
      ),
      logger: new SafeLogger((line) => logs.push(line)),
      rateLimiter: new PrincipalRateLimiter(1_000),
    });
    ({ url } = await relay.listen(0, "127.0.0.1"));
  });

  afterEach(async () => {
    for (const client of clients.splice(0)) {
      try {
        await client.close();
      } catch {
        // The server may already be closed by a specific test.
      }
    }
    await relay.close();
    system.dispose();
  });

  it("rejects missing and invalid credentials with a safe challenge", async () => {
    const invalidAuthorization = `Bearer ${["invalid", "test", "token", "0000"].join("-")}`;
    for (const authorization of [undefined, invalidAuthorization]) {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(authorization ? { authorization } : {}),
        },
        body: "{}",
      });
      expect(response.status).toBe(401);
      expect(response.headers.get("www-authenticate")).toContain("Bearer");
      const body = (await response.json()) as { error: Record<string, unknown> };
      expect(body.error.code).toBe("AUTHENTICATION_REQUIRED");
      expect(JSON.stringify(body)).not.toContain("invalid-test-token");
    }
  });

  it("authenticates health and unknown-path responses", async () => {
    for (const path of ["/healthz", "/not-an-endpoint"]) {
      const anonymous = await fetch(new URL(path, url));
      expect(anonymous.status, path).toBe(401);
      expect(((await anonymous.json()) as { error: { code: string } }).error.code, path).toBe(
        "AUTHENTICATION_REQUIRED",
      );
    }

    const health = await fetch(new URL("/healthz", url), {
      headers: { authorization: `Bearer ${tokenA}` },
    });
    expect(health.status).toBe(200);
    expect(await health.json()).toEqual({ status: "ok" });

    const unknown = await fetch(new URL("/not-an-endpoint", url), {
      headers: { authorization: `Bearer ${tokenA}` },
    });
    expect(unknown.status).toBe(404);
  });

  it("isolates project listings and record IDs between principals", async () => {
    const clientA = await connect(url, tokenA);
    const clientB = await connect(url, tokenB);
    clients.push(clientA, clientB);
    const created = await clientA.callTool({ name: "upsert_project", arguments: projectInput() });
    const project = asRecord(created).project as Record<string, unknown>;
    const projectId = project.id as string;
    const handoff = await clientA.callTool({
      name: "create_handoff",
      arguments: handoffInput(projectId, {
        artifacts: [
          { kind: "repo_path", label: "Specification", uri: "repo://MVP_SPEC.md", metadata: {} },
        ],
      }),
    });
    const handoffId = asRecord(handoff).handoff_id as string;
    const handoffDetail = await clientA.callTool({
      name: "get_handoff",
      arguments: { handoff_id: handoffId },
    });
    const artifactId = (
      (asRecord(handoffDetail).handoff as Record<string, unknown>).artifact_refs as string[]
    )[0];
    expect(artifactId).toBeDefined();
    await clientA.callTool({
      name: "create_checkpoint",
      arguments: checkpointInput(projectId),
    });

    const list = await clientB.callTool({ name: "list_projects", arguments: { limit: 20 } });
    expect(asRecord(list).projects).toEqual([]);

    const forbiddenReads = [
      { name: "get_project", arguments: { project_id: projectId } },
      { name: "get_project", arguments: { slug: "relay-bootstrap" } },
      { name: "get_project_context", arguments: { project_id: projectId } },
      { name: "get_handoff", arguments: { handoff_id: handoffId } },
      { name: "get_handoff", arguments: { project_id: projectId, selector: "latest" } },
      { name: "get_latest_checkpoint", arguments: { project_id: projectId } },
      { name: "list_project_history", arguments: { project_id: projectId, limit: 20 } },
    ];
    for (const request of forbiddenReads) {
      const result = await clientB.callTool(request);
      expect(result.isError, request.name).toBe(true);
      expect((asRecord(result).error as Record<string, unknown>).code, request.name).toBe(
        "NOT_FOUND",
      );
    }

    const forbiddenWrite = await clientB.callTool({
      name: "create_checkpoint",
      arguments: checkpointInput(projectId, {
        idempotency_key: "principal-b-forbidden-checkpoint",
      }),
    });
    expect(forbiddenWrite.isError).toBe(true);
    expect((asRecord(forbiddenWrite).error as Record<string, unknown>).code).toBe("NOT_FOUND");

    const bProjectResult = await clientB.callTool({
      name: "upsert_project",
      arguments: projectInput({
        name: "Principal B Relay",
        idempotency_key: "principal-b-project-key",
      }),
    });
    const bProjectId = (asRecord(bProjectResult).project as Record<string, unknown>).id as string;
    expect(bProjectId).not.toBe(projectId);

    const crossPrincipalReference = await clientB.callTool({
      name: "create_handoff",
      arguments: handoffInput(bProjectId, {
        artifact_refs: artifactId ? [artifactId] : [],
        idempotency_key: "principal-b-cross-reference",
      }),
    });
    expect(crossPrincipalReference.isError).toBe(true);
    expect((asRecord(crossPrincipalReference).error as Record<string, unknown>).code).toBe(
      "VALIDATION_FAILED",
    );

    const unchanged = await clientA.callTool({
      name: "get_project",
      arguments: { project_id: projectId },
    });
    expect((asRecord(unchanged).project as Record<string, unknown>).name).toBe("Relay Bootstrap");
  });

  it("rate limits principals independently and resets the fixed window", () => {
    let now = 0;
    const limiter = new PrincipalRateLimiter(1, () => now);
    limiter.consume("principal-a");
    expect(() => limiter.consume("principal-a")).toThrow(/rate limit/i);
    expect(() => limiter.consume("principal-b")).not.toThrow();
    now = 60_000;
    expect(() => limiter.consume("principal-a")).not.toThrow();
  });

  it("rejects oversized requests before persistence", async () => {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({ oversized: "x".repeat(LIMITS.requestBytes + 1) }),
    });
    expect(response.status).toBe(413);
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe(
      "PAYLOAD_TOO_LARGE",
    );
    expect(system.repository.countRowsForTesting("projects")).toBe(0);
  });

  it("uses parameterized search for SQL metacharacters", async () => {
    const client = await connect(url, tokenA);
    clients.push(client);
    await client.callTool({ name: "upsert_project", arguments: projectInput() });
    const result = await client.callTool({
      name: "list_projects",
      arguments: { query: "%' OR 1=1 --", limit: 20 },
    });
    expect(asRecord(result).projects).toEqual([]);
    expect(system.repository.countRowsForTesting("projects")).toBe(1);
  });

  it("rejects traversal artifact paths without a partial handoff", async () => {
    const client = await connect(url, tokenA);
    clients.push(client);
    const created = await client.callTool({ name: "upsert_project", arguments: projectInput() });
    const projectId = (asRecord(created).project as Record<string, unknown>).id as string;
    const input = handoffInput(projectId);
    const result = await client.callTool({
      name: "create_handoff",
      arguments: {
        ...input,
        artifacts: [{ kind: "repo_path", label: "Traversal", uri: "repo://../outside.txt" }],
      },
    });
    expect(result.isError).toBe(true);
    expect((asRecord(result).error as Record<string, unknown>).code).toBe("VALIDATION_FAILED");
    expect(system.repository.countRowsForTesting("handoffs")).toBe(0);
  });

  it("stores artifact URLs as inert metadata and never fetches them", async () => {
    let requests = 0;
    const sentinel: Server = createServer((_request, response) => {
      requests += 1;
      response.end("unexpected");
    });
    await new Promise<void>((resolve) => sentinel.listen(0, "127.0.0.1", resolve));
    const address = sentinel.address();
    if (!address || typeof address === "string") throw new Error("sentinel failed to listen");

    try {
      const client = await connect(url, tokenA);
      clients.push(client);
      const created = await client.callTool({ name: "upsert_project", arguments: projectInput() });
      const projectId = (asRecord(created).project as Record<string, unknown>).id as string;
      const result = await client.callTool({
        name: "create_handoff",
        arguments: handoffInput(projectId, {
          artifacts: [
            {
              kind: "url",
              label: "Inert URL",
              uri: `http://127.0.0.1:${address.port}/must-not-fetch`,
              metadata: {},
            },
          ],
        }),
      });
      expect(result.isError).not.toBe(true);
      expect(requests).toBe(0);
    } finally {
      await new Promise<void>((resolve, reject) =>
        sentinel.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });

  it("keeps tokens and capsule bodies out of default logs", async () => {
    const client = await connect(url, tokenA);
    clients.push(client);
    const confidential = "confidential-capsule-body-should-never-be-logged";
    const created = await client.callTool({
      name: "upsert_project",
      arguments: projectInput({ description: confidential }),
    });
    expect(created.isError).not.toBe(true);
    await client.callTool({ name: `unknown-${confidential}`, arguments: {} });
    await client.callTool({
      name: "get_project_context",
      arguments: { project_id: confidential },
    });
    const credentialShapedRequestId = ["sk", "d".repeat(32)].join("-");
    await fetch(url, {
      method: "POST",
      headers: {
        authorization: `Bearer ${tokenA}`,
        "content-type": "application/json",
        "x-request-id": credentialShapedRequestId,
      },
      body: "{}",
    });
    const output = logs.join("\n");
    expect(output).not.toContain(tokenA);
    expect(output).not.toContain(confidential);
    expect(output).not.toContain(credentialShapedRequestId);
    expect(output).not.toContain("authorization");
    for (const line of logs) expect(() => JSON.parse(line)).not.toThrow();
  });
});
