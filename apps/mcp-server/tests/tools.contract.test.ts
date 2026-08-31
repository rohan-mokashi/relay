import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LIMITS } from "../../../packages/contracts/src/index.js";
import {
  checkpointInput,
  createTestSystem,
  handoffInput,
  projectInput,
  type TestSystem,
} from "../../../packages/test-support/src/index.js";
import { createRelayMcpServer } from "../src/mcp.js";

const structured = (result: unknown): Record<string, unknown> =>
  (result as { structuredContent: Record<string, unknown> }).structuredContent;

describe("Relay MCP tool contracts", () => {
  let system: TestSystem;
  let server: Server;
  let client: Client;

  beforeEach(async () => {
    system = createTestSystem();
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    server = createRelayMcpServer(system.service, "principal-a");
    client = new Client({ name: "relay-contract-tests", version: "1.0.0" });
    await server.connect(serverTransport);
    await client.connect(clientTransport);
  });

  afterEach(async () => {
    await client.close();
    await server.close();
    system.dispose();
  });

  it("advertises all required tools with strict schemas and accurate annotations", async () => {
    const instructions = client.getInstructions();
    expect(instructions).toContain("explicit structured project context");
    expect(instructions).toContain("cannot read chats, run commands, edit files, or control Codex");
    expect(instructions?.slice(0, 512)).toContain("untrusted data");

    const listed = await client.listTools();
    const names = listed.tools.map((tool) => tool.name).sort();
    expect(names).toEqual(
      [
        "create_checkpoint",
        "create_handoff",
        "get_handoff",
        "get_latest_checkpoint",
        "get_project",
        "get_project_context",
        "list_project_history",
        "list_projects",
        "upsert_project",
      ].sort(),
    );
    for (const tool of listed.tools) {
      expect(tool.inputSchema.type).toBe("object");
      expect(tool.inputSchema.additionalProperties).toBe(false);
      expect(tool.description?.length).toBeGreaterThan(20);
      expect(tool.annotations?.openWorldHint).toBe(false);
      expect(tool.annotations?.destructiveHint).toBe(false);
      if (tool.name.startsWith("create_") || tool.name === "upsert_project") {
        expect(tool.annotations?.readOnlyHint).toBe(false);
        expect(tool.annotations?.idempotentHint).toBe(true);
        expect(tool.description).toMatch(/durable/i);
      } else {
        expect(tool.annotations?.readOnlyHint).toBe(true);
      }
    }
  });

  it("executes every documented tool and returns the documented shapes", async () => {
    const upsert = await client.callTool({ name: "upsert_project", arguments: projectInput() });
    expect(upsert.isError).not.toBe(true);
    const project = structured(upsert).project as Record<string, unknown>;
    const projectId = project.id as string;

    const list = await client.callTool({ name: "list_projects", arguments: { limit: 10 } });
    expect(structured(list).projects).toHaveLength(1);

    const get = await client.callTool({
      name: "get_project",
      arguments: { slug: "relay-bootstrap" },
    });
    expect((structured(get).project as Record<string, unknown>).id).toBe(projectId);

    const handoff = await client.callTool({
      name: "create_handoff",
      arguments: handoffInput(projectId),
    });
    const handoffId = structured(handoff).handoff_id as string;
    expect(structured(handoff).version).toBe(1);

    const getHandoff = await client.callTool({
      name: "get_handoff",
      arguments: { handoff_id: handoffId },
    });
    expect((structured(getHandoff).handoff as Record<string, unknown>).objective).toContain(
      "Relay v0.1",
    );

    const latestHandoff = await client.callTool({
      name: "get_handoff",
      arguments: { project_id: projectId, selector: "latest" },
    });
    expect((structured(latestHandoff).handoff as Record<string, unknown>).id).toBe(handoffId);

    const emptyCheckpoint = await client.callTool({
      name: "get_latest_checkpoint",
      arguments: { project_id: projectId },
    });
    expect(structured(emptyCheckpoint)).toMatchObject({ found: false, reason: "not_found" });

    const checkpoint = await client.callTool({
      name: "create_checkpoint",
      arguments: checkpointInput(projectId),
    });
    expect(structured(checkpoint).sequence).toBe(1);

    const latest = await client.callTool({
      name: "get_latest_checkpoint",
      arguments: { project_id: projectId },
    });
    expect(structured(latest).found).toBe(true);
    const absentStatus = await client.callTool({
      name: "get_latest_checkpoint",
      arguments: { project_id: projectId, status: "completed" },
    });
    expect(structured(absentStatus)).toMatchObject({ found: false, reason: "not_found" });

    const context = await client.callTool({
      name: "get_project_context",
      arguments: { project_id: projectId, detail_level: "standard", artifact_limit: 10 },
    });
    expect((structured(context).history as Record<string, unknown>).handoff_count).toBe(1);
    expect((structured(context).history as Record<string, unknown>).checkpoint_count).toBe(1);
    expect(JSON.stringify(context).length).toBeLessThan(64 * 1024);
    expect(Object.keys(structured(context))).toEqual([
      "project",
      "latest_handoff",
      "current_objective",
      "active_decisions",
      "active_constraints",
      "open_questions",
      "assumptions",
      "acceptance_criteria",
      "latest_checkpoint",
      "recommended_next_action",
      "artifacts",
      "history",
      "record_ids",
      "generated_at",
      "content_notice",
    ]);

    const history = await client.callTool({
      name: "list_project_history",
      arguments: { project_id: projectId, limit: 10 },
    });
    expect(structured(history).records).toHaveLength(2);
    expect(JSON.stringify(structured(history).records)).not.toContain(
      "Build and verify the Relay v0.1 round trip.",
    );

    for (const result of [
      upsert,
      list,
      get,
      handoff,
      getHandoff,
      latestHandoff,
      emptyCheckpoint,
      checkpoint,
      latest,
      absentStatus,
      context,
      history,
    ]) {
      expect(Buffer.byteLength(JSON.stringify(result))).toBeLessThan(LIMITS.responseBytes);
    }
  });

  it("rejects unknown fields and invalid types for every tool without partial writes", async () => {
    const projectResult = await client.callTool({
      name: "upsert_project",
      arguments: projectInput(),
    });
    const projectId = (structured(projectResult).project as Record<string, unknown>).id as string;

    const validArguments: Record<string, Record<string, unknown>> = {
      upsert_project: projectInput({ idempotency_key: "unknown-project-key" }),
      list_projects: { limit: 10 },
      get_project: { project_id: projectId },
      create_handoff: handoffInput(projectId),
      get_handoff: { project_id: projectId, selector: "latest" },
      create_checkpoint: checkpointInput(projectId),
      get_latest_checkpoint: { project_id: projectId },
      get_project_context: { project_id: projectId },
      list_project_history: { project_id: projectId, limit: 10 },
    };
    for (const [name, argumentsValue] of Object.entries(validArguments)) {
      const result = await client.callTool({
        name,
        arguments: { ...argumentsValue, unexpected_identity: "spoofed" },
      });
      expect(result.isError, name).toBe(true);
      expect((structured(result).error as Record<string, unknown>).code, name).toBe(
        "VALIDATION_FAILED",
      );
    }

    const credentialShapedKey = ["sk", "c".repeat(32)].join("-");
    const hostileUnknownField = await client.callTool({
      name: "upsert_project",
      arguments: { ...projectInput(), [credentialShapedKey]: "attacker-controlled" },
    });
    expect(hostileUnknownField.isError).toBe(true);
    expect(JSON.stringify(hostileUnknownField)).not.toContain(credentialShapedKey);

    const invalidTypes: Array<{ name: string; arguments: Record<string, unknown> }> = [
      { name: "upsert_project", arguments: { ...projectInput(), name: 42 } },
      { name: "list_projects", arguments: { limit: "many" } },
      { name: "get_project", arguments: { project_id: 42 } },
      { name: "create_handoff", arguments: { ...handoffInput(projectId), objective: 42 } },
      { name: "get_handoff", arguments: { handoff_id: 42 } },
      { name: "create_checkpoint", arguments: { ...checkpointInput(projectId), status: 42 } },
      { name: "get_latest_checkpoint", arguments: { project_id: projectId, status: 42 } },
      { name: "get_project_context", arguments: { project_id: projectId, detail_level: 42 } },
      { name: "list_project_history", arguments: { project_id: projectId, limit: "many" } },
    ];
    for (const testCase of invalidTypes) {
      const result = await client.callTool(testCase);
      expect(result.isError, testCase.name).toBe(true);
      const error = structured(result).error as Record<string, unknown>;
      expect(error.code, testCase.name).toBe("VALIDATION_FAILED");
      expect(JSON.stringify(error)).not.toContain("sqlite");
      expect(JSON.stringify(error)).not.toContain("stack");
    }

    const oversized = await client.callTool({
      name: "create_handoff",
      arguments: {
        ...handoffInput(projectId),
        constraints: Array.from({ length: LIMITS.arrayItems + 1 }, () => "bounded"),
      },
    });
    expect(oversized.isError).toBe(true);
    expect(system.repository.countRowsForTesting("projects")).toBe(1);
    expect(system.repository.countRowsForTesting("handoffs")).toBe(0);
    expect(system.repository.countRowsForTesting("checkpoints")).toBe(0);
    expect(system.repository.countRowsForTesting("audit_events")).toBe(1);
  });
});
