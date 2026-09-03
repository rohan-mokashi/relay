import { PGlite } from "@electric-sql/pglite";
import type { Pool, QueryResultRow } from "pg";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  ListProjectHistoryInputSchema,
  ListProjectsInputSchema,
} from "../../contracts/src/index.js";
import { RelayError, RelayService } from "../../domain/src/index.js";
import {
  checkpointInput,
  handoffInput,
  principalA,
  principalB,
  projectInput,
} from "../../test-support/src/index.js";
import { PostgresRelayRepository } from "../src/index.js";

describe("PostgreSQL Relay repository", () => {
  let database: PGlite;
  let pool: Pool;
  let repository: PostgresRelayRepository;
  let service: RelayService;

  beforeEach(async () => {
    database = await PGlite.create();
    const query = async <Row extends QueryResultRow>(text: string, values: unknown[] = []) => {
      if (values.length === 0 && text.split(";").length > 2) {
        await database.exec(text);
        return { rows: [] as Row[], fields: [], command: "", rowCount: 0, oid: 0 };
      }
      const result = await database.query<Row>(text, values);
      return {
        ...result,
        command: "",
        rowCount: result.rows.length > 0 ? result.rows.length : (result.affectedRows ?? 0),
        oid: 0,
      };
    };
    const client = { query, release: () => undefined };
    pool = {
      query,
      connect: async () => client,
      end: async () => database.close(),
    } as unknown as Pool;
    repository = new PostgresRelayRepository("postgresql://unused", {
      pool,
      migration: { advisoryLock: false },
    });
    await repository.migrate();
    service = new RelayService(repository);
  });

  afterEach(async () => {
    await pool.end();
  });

  it("applies ordered migrations once and can rerun them", async () => {
    await repository.migrate();
    expect(await repository.countRowsForTesting("schema_migrations")).toBe(1);
    await pool.query("UPDATE schema_migrations SET checksum = 'drift'");
    await expect(repository.migrate()).rejects.toThrow(/does not match its checksum/);
  });

  it("round-trips projects, immutable records, artifacts, and history", async () => {
    const project = (await service.upsertProject(principalA, projectInput())).project;
    const handoff = await service.createHandoff(
      principalA,
      handoffInput(project.id, {
        artifacts: [
          { kind: "repo_path", label: "Specification", uri: "repo://MVP_SPEC.md", metadata: {} },
        ],
      }),
    );
    const checkpoint = await service.createCheckpoint(principalA, checkpointInput(project.id));
    const context = await service.getProjectContext(principalA, {
      project_id: project.id,
      detail_level: "standard",
      artifact_limit: 20,
    });
    const history = await service.listProjectHistory(
      principalA,
      ListProjectHistoryInputSchema.parse({ project_id: project.id, limit: 20 }),
    );

    expect(context.latest_handoff?.id).toBe(handoff.handoff_id);
    expect(context.latest_checkpoint?.id).toBe(checkpoint.checkpoint_id);
    expect(context.artifacts).toHaveLength(1);
    expect(history.records.map((record) => record.type).sort()).toEqual(["checkpoint", "handoff"]);
    expect(await repository.countRowsForTesting("audit_events")).toBe(3);
  });

  it("replays identical mutations and rejects changed idempotent payloads", async () => {
    const input = projectInput();
    const first = await service.upsertProject(principalA, input);
    const replay = await service.upsertProject(principalA, input);
    expect(replay).toEqual(first);
    expect(await repository.countRowsForTesting("projects")).toBe(1);
    expect(await repository.countRowsForTesting("audit_events")).toBe(1);

    await expect(
      service.upsertProject(principalA, projectInput({ name: "Changed name" })),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
  });

  it("rolls back the complete mutation when audit persistence fails", async () => {
    repository.setFailAuditWritesForTesting(true);
    await expect(service.upsertProject(principalA, projectInput())).rejects.toThrow(
      "Injected audit write failure",
    );
    expect(await repository.countRowsForTesting("projects")).toBe(0);
    expect(await repository.countRowsForTesting("idempotency_keys")).toBe(0);
  });

  it("enforces immutable handoffs, checkpoints, and append-only audit events", async () => {
    const project = (await service.upsertProject(principalA, projectInput())).project;
    const handoff = await service.createHandoff(principalA, handoffInput(project.id));
    const checkpoint = await service.createCheckpoint(principalA, checkpointInput(project.id));

    await expect(
      pool.query("UPDATE handoffs SET title = 'changed' WHERE id = $1", [handoff.handoff_id]),
    ).rejects.toThrow(/immutable/);
    await expect(
      pool.query("DELETE FROM checkpoints WHERE id = $1", [checkpoint.checkpoint_id]),
    ).rejects.toThrow(/immutable/);
    await expect(pool.query("DELETE FROM audit_events")).rejects.toThrow(/immutable/);
  });

  it("isolates tenant principals and paginates without duplicates", async () => {
    for (let index = 0; index < 5; index += 1) {
      await service.upsertProject(
        principalA,
        projectInput({
          slug: `postgres-project-${index}`,
          name: `Postgres Project ${index}`,
          idempotency_key: `postgres-page-key-${index}`,
        }),
      );
    }
    const first = await service.listProjects(
      principalA,
      ListProjectsInputSchema.parse({ limit: 2 }),
    );
    const second = await service.listProjects(
      principalA,
      ListProjectsInputSchema.parse({ limit: 2, cursor: first.nextCursor ?? undefined }),
    );
    expect(new Set([...first.items, ...second.items].map((project) => project.id)).size).toBe(4);

    expect(
      (await service.listProjects(principalB, ListProjectsInputSchema.parse({ limit: 20 }))).items,
    ).toEqual([]);
    await expect(
      service.getProject(principalB, { project_id: first.items[0]?.id }),
    ).rejects.toBeInstanceOf(RelayError);
  });
});
