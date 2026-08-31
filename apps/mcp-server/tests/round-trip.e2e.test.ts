import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { describe, expect, it } from "vitest";
import { RelayService } from "../../../packages/domain/src/service.js";
import { SqliteRelayRepository } from "../../../packages/persistence-sqlite/src/index.js";
import {
  checkpointInput,
  handoffInput,
  projectInput,
} from "../../../packages/test-support/src/index.js";
import { DevTokenAuthenticator } from "../src/auth.js";
import { createRelayHttpServer, type RelayHttpServer } from "../src/http.js";
import { SafeLogger } from "../src/logger.js";
import { PrincipalRateLimiter } from "../src/rate-limit.js";

const tokenA = "relay-e2e-token-a-1234567890";
const tokenB = "relay-e2e-token-b-1234567890";

const structured = (result: unknown): Record<string, unknown> =>
  (result as { structuredContent: Record<string, unknown> }).structuredContent;

const connect = async (url: string, token: string): Promise<Client> => {
  const client = new Client({ name: "relay-e2e-test", version: "1.0.0" });
  await client.connect(
    new StreamableHTTPClientTransport(new URL(url), {
      requestInit: { headers: { authorization: `Bearer ${token}` } },
    }),
  );
  return client;
};

const startRelay = async (
  databasePath: string,
): Promise<{
  repository: SqliteRelayRepository;
  relay: RelayHttpServer;
  url: string;
}> => {
  const repository = new SqliteRelayRepository(databasePath);
  repository.migrate();
  const relay = createRelayHttpServer({
    service: new RelayService(repository),
    authenticator: new DevTokenAuthenticator(
      new Map([
        [tokenA, "principal-a"],
        [tokenB, "principal-b"],
      ]),
    ),
    logger: new SafeLogger(() => undefined),
    rateLimiter: new PrincipalRateLimiter(1_000),
  });
  const { url } = await relay.listen(0, "127.0.0.1");
  return { repository, relay, url };
};

describe("Relay cross-surface round trip", () => {
  it("survives idempotent replay and process restart over Streamable HTTP", async () => {
    const directory = mkdtempSync(join(tmpdir(), "relay-e2e-"));
    const databasePath = join(directory, "relay.db");
    let first: Awaited<ReturnType<typeof startRelay>> | undefined;
    let second: Awaited<ReturnType<typeof startRelay>> | undefined;
    const clients: Client[] = [];

    try {
      first = await startRelay(databasePath);
      const chatgptClient = await connect(first.url, tokenA);
      const isolatedClient = await connect(first.url, tokenB);
      clients.push(chatgptClient, isolatedClient);

      const projectInputValue = projectInput();
      const projectResult = await chatgptClient.callTool({
        name: "upsert_project",
        arguments: projectInputValue,
      });
      const projectId = (structured(projectResult).project as Record<string, unknown>).id as string;

      const handoffInputValue = handoffInput(projectId);
      const handoffResult = await chatgptClient.callTool({
        name: "create_handoff",
        arguments: handoffInputValue,
      });
      const handoffId = structured(handoffResult).handoff_id as string;

      const nodeVersion = execFileSync(process.execPath, ["--version"], {
        encoding: "utf8",
      }).trim();
      expect(nodeVersion).toMatch(/^v\d+\./);
      const checkpointInputValue = checkpointInput(projectId, {
        status: "completed",
        summary: `The local verification command completed with ${nodeVersion}.`,
        work_completed: ["Read the handoff, performed the implementation step, and verified it."],
        verification: [
          {
            kind: "test",
            command: "node --version",
            status: "passed",
            summary: `Observed ${nodeVersion} from the local Node executable.`,
            observed_at: new Date().toISOString(),
          },
        ],
        recommended_next_action: "Retrieve this checkpoint from the originating surface.",
      });
      const checkpointResult = await chatgptClient.callTool({
        name: "create_checkpoint",
        arguments: checkpointInputValue,
      });
      const checkpointId = structured(checkpointResult).checkpoint_id as string;

      const replayedProject = await chatgptClient.callTool({
        name: "upsert_project",
        arguments: projectInputValue,
      });
      const replayedHandoff = await chatgptClient.callTool({
        name: "create_handoff",
        arguments: handoffInputValue,
      });
      const replayedCheckpoint = await chatgptClient.callTool({
        name: "create_checkpoint",
        arguments: checkpointInputValue,
      });
      expect((structured(replayedProject).project as Record<string, unknown>).id).toBe(projectId);
      expect(structured(replayedHandoff).handoff_id).toBe(handoffId);
      expect(structured(replayedCheckpoint).checkpoint_id).toBe(checkpointId);

      const beforeRestart = await chatgptClient.callTool({
        name: "get_project_context",
        arguments: { project_id: projectId },
      });
      expect((structured(beforeRestart).history as Record<string, unknown>).handoff_count).toBe(1);
      expect((structured(beforeRestart).history as Record<string, unknown>).checkpoint_count).toBe(
        1,
      );

      const isolatedList = await isolatedClient.callTool({
        name: "list_projects",
        arguments: { limit: 20 },
      });
      expect(structured(isolatedList).projects).toEqual([]);

      for (const client of clients.splice(0)) await client.close();
      await first.relay.close();
      first.repository.close();
      first = undefined;

      second = await startRelay(databasePath);
      const resumedClient = await connect(second.url, tokenA);
      clients.push(resumedClient);
      const afterRestart = await resumedClient.callTool({
        name: "get_project_context",
        arguments: { slug: "relay-bootstrap", detail_level: "standard" },
      });
      const resumed = structured(afterRestart);
      expect((resumed.project as Record<string, unknown>).id).toBe(projectId);
      expect((resumed.latest_handoff as Record<string, unknown>).id).toBe(handoffId);
      expect((resumed.latest_checkpoint as Record<string, unknown>).id).toBe(checkpointId);
      expect(JSON.stringify(resumed.latest_checkpoint)).toContain(nodeVersion);
      expect(resumed.recommended_next_action).toBe(
        "Retrieve this checkpoint from the originating surface.",
      );
    } finally {
      for (const client of clients.splice(0)) {
        try {
          await client.close();
        } catch {
          // A prior assertion may have already torn down a transport.
        }
      }
      if (second) {
        await second.relay.close();
        second.repository.close();
      }
      if (first) {
        await first.relay.close();
        first.repository.close();
      }
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
