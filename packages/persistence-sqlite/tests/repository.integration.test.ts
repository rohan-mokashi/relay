import { once } from "node:events";
import { DatabaseSync } from "node:sqlite";
import { Worker } from "node:worker_threads";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  ListProjectHistoryInputSchema,
  ListProjectsInputSchema,
} from "../../contracts/src/index.js";
import { RelayError } from "../../domain/src/index.js";
import {
  checkpointInput,
  createTestSystem,
  handoffInput,
  principalA,
  projectInput,
  type TestSystem,
} from "../../test-support/src/index.js";
import { SqliteRelayRepository } from "../src/index.js";

describe("SQLite Relay repository", () => {
  let system: TestSystem;

  beforeEach(() => {
    system = createTestSystem();
  });

  afterEach(() => {
    system.dispose();
  });

  it("migrates cleanly, reruns deterministically, and enables foreign keys", () => {
    system.repository.migrate();
    const diagnostics = system.repository.diagnosticsForTesting();
    expect(diagnostics.foreignKeys).toBe(true);
    expect(diagnostics.tables).toEqual(
      expect.arrayContaining([
        "principals",
        "projects",
        "project_memberships",
        "handoffs",
        "checkpoints",
        "artifacts",
        "record_artifacts",
        "idempotency_keys",
        "audit_events",
      ]),
    );
  });

  it("returns the original result for an identical mutation retry", async () => {
    const input = projectInput();
    const first = await system.service.upsertProject(principalA, input);
    const replay = await system.service.upsertProject(principalA, input);
    expect(replay).toEqual(first);
    expect(system.repository.countRowsForTesting("projects")).toBe(1);
    expect(system.repository.countRowsForTesting("audit_events")).toBe(1);
  });

  it("rejects idempotency-key payload mismatches", async () => {
    await system.service.upsertProject(principalA, projectInput());
    try {
      await system.service.upsertProject(principalA, projectInput({ name: "Changed Name" }));
      throw new Error("expected idempotency conflict");
    } catch (caught) {
      expect(caught).toBeInstanceOf(RelayError);
      expect((caught as RelayError).code).toBe("IDEMPOTENCY_CONFLICT");
    }
  });

  it("rolls back a domain write when the audit write fails", async () => {
    system.repository.setFailAuditWritesForTesting(true);
    await expect(system.service.upsertProject(principalA, projectInput())).rejects.toThrow(
      "Injected audit write failure",
    );
    expect(system.repository.countRowsForTesting("projects")).toBe(0);
    expect(system.repository.countRowsForTesting("audit_events")).toBe(0);
    expect(system.repository.countRowsForTesting("idempotency_keys")).toBe(0);
  });

  it("rolls back handoff artifacts and idempotency when its audit write fails", async () => {
    const project = (await system.service.upsertProject(principalA, projectInput())).project;
    system.repository.setFailAuditWritesForTesting(true);
    await expect(
      system.service.createHandoff(
        principalA,
        handoffInput(project.id, {
          artifacts: [
            { kind: "repo_path", label: "Specification", uri: "repo://MVP_SPEC.md", metadata: {} },
          ],
        }),
      ),
    ).rejects.toThrow("Injected audit write failure");
    expect(system.repository.countRowsForTesting("handoffs")).toBe(0);
    expect(system.repository.countRowsForTesting("artifacts")).toBe(0);
    expect(system.repository.countRowsForTesting("audit_events")).toBe(1);
    expect(system.repository.countRowsForTesting("idempotency_keys")).toBe(1);
  });

  it("creates one audit event for every successful mutation", async () => {
    const project = (await system.service.upsertProject(principalA, projectInput())).project;
    await system.service.createHandoff(principalA, handoffInput(project.id));
    await system.service.createCheckpoint(principalA, checkpointInput(project.id));
    expect(system.repository.countRowsForTesting("audit_events")).toBe(3);
    expect(system.repository.countRowsForTesting("idempotency_keys")).toBe(3);
  });

  it("coalesces truly concurrent identical writes from separate workers", async () => {
    const workerUrl = new URL("./idempotency-worker.ts", import.meta.url);
    const workers = [
      new Worker(workerUrl, {
        workerData: { databasePath: system.databasePath, requestId: "worker-a" },
        execArgv: ["--import", "tsx"],
      }),
      new Worker(workerUrl, {
        workerData: { databasePath: system.databasePath, requestId: "worker-b" },
        execArgv: ["--import", "tsx"],
      }),
    ];

    try {
      const ready = await Promise.all(workers.map((worker) => once(worker, "message")));
      expect(ready.map(([message]) => message)).toEqual([{ kind: "ready" }, { kind: "ready" }]);
      const results = workers.map((worker) => once(worker, "message"));
      for (const worker of workers) worker.postMessage({ kind: "go" });
      const completed = (await Promise.all(results)).map(([message]) => message) as Array<{
        kind: string;
        result?: unknown;
        message?: string;
      }>;
      expect(completed.map((message) => message.kind)).toEqual(["result", "result"]);
      expect(completed[0]?.result).toEqual(completed[1]?.result);
    } finally {
      await Promise.all(workers.map((worker) => worker.terminate()));
    }

    expect(system.repository.countRowsForTesting("projects")).toBe(1);
    expect(system.repository.countRowsForTesting("audit_events")).toBe(1);
    expect(system.repository.countRowsForTesting("idempotency_keys")).toBe(1);
  });

  it("serializes concurrent service requests on its single connection", async () => {
    const results = await Promise.all(
      Array.from({ length: 8 }, (_, index) =>
        system.service.upsertProject(
          { ...principalA, requestId: `concurrent-request-${index}` },
          projectInput({
            slug: `concurrent-project-${index}`,
            name: `Concurrent Project ${index}`,
            idempotency_key: `concurrent-project-key-${index}`,
          }),
        ),
      ),
    );
    expect(new Set(results.map((result) => result.project.id)).size).toBe(8);
    expect(system.repository.countRowsForTesting("projects")).toBe(8);
    expect(system.repository.countRowsForTesting("audit_events")).toBe(8);
  });

  it("paginates deterministically without duplicate records", async () => {
    for (let index = 0; index < 5; index += 1) {
      await system.service.upsertProject(
        principalA,
        projectInput({
          slug: `project-${index}`,
          name: `Project ${index}`,
          idempotency_key: `project-page-${index}`,
        }),
      );
    }
    const first = await system.service.listProjects(
      principalA,
      ListProjectsInputSchema.parse({ limit: 2 }),
    );
    const second = await system.service.listProjects(
      principalA,
      ListProjectsInputSchema.parse({ limit: 2, cursor: first.nextCursor }),
    );
    expect(first.items).toHaveLength(2);
    expect(second.items).toHaveLength(2);
    expect(new Set([...first.items, ...second.items].map((project) => project.id)).size).toBe(4);
  });

  it("paginates mixed history deterministically and filters record types", async () => {
    const project = (await system.service.upsertProject(principalA, projectInput())).project;
    await system.service.createHandoff(principalA, handoffInput(project.id));
    await system.service.createHandoff(
      principalA,
      handoffInput(project.id, {
        title: "Second handoff",
        idempotency_key: "handoff-key-0002",
      }),
    );
    await system.service.createCheckpoint(principalA, checkpointInput(project.id));
    await system.service.createCheckpoint(
      principalA,
      checkpointInput(project.id, { idempotency_key: "checkpoint-key-0002" }),
    );

    const first = await system.service.listProjectHistory(
      principalA,
      ListProjectHistoryInputSchema.parse({ project_id: project.id, limit: 2 }),
    );
    const second = await system.service.listProjectHistory(
      principalA,
      ListProjectHistoryInputSchema.parse({
        project_id: project.id,
        limit: 2,
        cursor: first.next_cursor ?? undefined,
      }),
    );
    expect(first.next_cursor).not.toBeNull();
    expect(new Set([...first.records, ...second.records].map((record) => record.id)).size).toBe(4);

    const handoffs = await system.service.listProjectHistory(
      principalA,
      ListProjectHistoryInputSchema.parse({
        project_id: project.id,
        record_types: ["handoff"],
        limit: 10,
      }),
    );
    expect(handoffs.records).toHaveLength(2);
    expect(handoffs.records.every((record) => record.type === "handoff")).toBe(true);
  });

  it("enforces handoff, checkpoint, and audit immutability in SQLite", async () => {
    const project = (await system.service.upsertProject(principalA, projectInput())).project;
    const handoff = await system.service.createHandoff(principalA, handoffInput(project.id));
    const checkpoint = await system.service.createCheckpoint(
      principalA,
      checkpointInput(project.id),
    );
    system.repository.close();

    const database = new DatabaseSync(system.databasePath);
    try {
      expect(() =>
        database
          .prepare("UPDATE handoffs SET title = 'changed' WHERE id = ?")
          .run(handoff.handoff_id),
      ).toThrow(/immutable/);
      expect(() =>
        database.prepare("DELETE FROM checkpoints WHERE id = ?").run(checkpoint.checkpoint_id),
      ).toThrow(/immutable/);
      expect(() => database.prepare("DELETE FROM audit_events").run()).toThrow(/append-only/);
    } finally {
      database.close();
    }
  });

  it("can construct an isolated in-memory adapter directly", () => {
    const repository = new SqliteRelayRepository(":memory:");
    try {
      repository.migrate();
      expect(repository.diagnosticsForTesting().foreignKeys).toBe(true);
    } finally {
      repository.close();
    }
  });
});
