import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  getDefaultEnvironment,
  StdioClientTransport,
} from "@modelcontextprotocol/sdk/client/stdio.js";
import { describe, expect, it } from "vitest";
import { handoffInput, projectInput } from "../../../packages/test-support/src/index.js";

interface PortableServerConfig {
  type: "stdio";
  command: string;
  args: string[];
  cwd: string;
  envFile: string;
}

const workspaceRoot = resolve(import.meta.dirname, "../../..");
const workspaceVariable = `$${"{workspaceFolder}"}`;
const portableConfiguration = JSON.parse(
  readFileSync(resolve(workspaceRoot, ".mcp.json"), "utf8"),
) as { servers: { relay: PortableServerConfig } };

const expectedToolNames = [
  "create_checkpoint",
  "create_handoff",
  "get_handoff",
  "get_latest_checkpoint",
  "get_project",
  "get_project_context",
  "list_project_history",
  "list_projects",
  "upsert_project",
];

const structured = (result: unknown): Record<string, unknown> =>
  (result as { structuredContent: Record<string, unknown> }).structuredContent;

const connectThroughPortableConfig = async (databasePath: string): Promise<Client> => {
  const configured = portableConfiguration.servers.relay;
  expect(configured.type).toBe("stdio");
  expect(configured.cwd).toBe(workspaceVariable);
  expect(configured.envFile).toBe(`${workspaceVariable}/.env`);

  const client = new Client({ name: "vscode-portable-config-e2e", version: "1.0.0" });
  await client.connect(
    new StdioClientTransport({
      command: configured.command,
      args: configured.args,
      cwd: workspaceRoot,
      env: {
        ...getDefaultEnvironment(),
        RELAY_DATABASE_PATH: databasePath,
        RELAY_TUNNEL_PRINCIPAL: "principal-vscode-interoperability",
      },
      stderr: "pipe",
    }),
  );
  return client;
};

describe("Relay portable independent-client configuration", () => {
  it("discovers, writes, restarts, and reads through the configured stdio process", async () => {
    const directory = mkdtempSync(join(tmpdir(), "relay-vscode-e2e-"));
    const databasePath = join(directory, "relay.db");
    let client: Client | undefined;

    try {
      client = await connectThroughPortableConfig(databasePath);
      const tools = await client.listTools();
      expect(tools.tools.map((tool) => tool.name).sort()).toEqual(expectedToolNames);

      const createdProject = await client.callTool({
        name: "upsert_project",
        arguments: projectInput({
          slug: "vscode-interoperability",
          name: "VS Code Interoperability",
          description: "Exercise Relay from a portable independent MCP client configuration.",
          idempotency_key: "vscode-project-key-0001",
        }),
      });
      const projectId = (structured(createdProject).project as Record<string, unknown>)
        .id as string;

      const createdHandoff = await client.callTool({
        name: "create_handoff",
        arguments: handoffInput(projectId, {
          title: "VS Code independent-client handoff",
          objective:
            "Prove that an independent MCP client can use Relay without a custom contract.",
          summary: "The portable VS Code configuration invoked Relay over stdio.",
          acceptance_criteria: ["A restarted client retrieves this exact handoff."],
          recommended_next_action: "Restart the configured process and retrieve project context.",
          source: { surface: "other", label: "Visual Studio Code" },
          idempotency_key: "vscode-handoff-key-0001",
        }),
      });
      const handoffId = structured(createdHandoff).handoff_id as string;

      await client.close();
      client = undefined;

      client = await connectThroughPortableConfig(databasePath);
      const resumed = await client.callTool({
        name: "get_project_context",
        arguments: { slug: "vscode-interoperability", detail_level: "standard" },
      });
      const context = structured(resumed);
      expect((context.project as Record<string, unknown>).id).toBe(projectId);
      expect((context.latest_handoff as Record<string, unknown>).id).toBe(handoffId);

      const retrievedHandoff = await client.callTool({
        name: "get_handoff",
        arguments: { handoff_id: handoffId },
      });
      expect(
        (structured(retrievedHandoff).handoff as Record<string, unknown>).source as unknown,
      ).toEqual({
        surface: "other",
        label: "Visual Studio Code",
      });
    } finally {
      if (client) await client.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
