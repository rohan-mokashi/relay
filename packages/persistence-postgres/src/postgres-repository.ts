import { createHash } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";
import { Pool, type PoolClient, type PoolConfig, type QueryResultRow } from "pg";
import {
  ArtifactSchema,
  CheckpointSchema,
  HandoffSchema,
  ProjectSchema,
  SCHEMA_VERSION,
  type Artifact,
  type ArtifactDefinition,
  type Checkpoint,
  type CheckpointStatus,
  type Handoff,
  type ListProjectHistoryInput,
  type ListProjectsInput,
  type Project,
  type UpsertProjectInput,
} from "../../contracts/src/index.js";
import { RelayError } from "../../domain/src/errors.js";
import type {
  CheckpointDraft,
  HandoffDraft,
  HistoryItem,
  Page,
  Principal,
  ProjectRecordIds,
  RelayRepository,
} from "../../domain/src/types.js";
import { applyPostgresMigrations, type PostgresMigrationOptions } from "./migrations.js";

export type PostgresSslMode = "verify-full" | "require" | "disable";

export interface PostgresRepositoryOptions {
  pool?: Pool;
  sslMode?: PostgresSslMode;
  migration?: PostgresMigrationOptions;
  failAuditWrites?: boolean;
}

interface ProjectRow extends QueryResultRow {
  id: string;
  slug: string;
  name: string;
  description: string;
  status: "active" | "archived";
  tags_json: unknown;
  created_at: string;
  updated_at: string;
  schema_version: number;
}

interface ArtifactRow extends QueryResultRow {
  id: string;
  project_id: string;
  kind: Artifact["kind"];
  label: string;
  uri: string;
  metadata_json: unknown;
  created_at: string;
  schema_version: number;
}

interface HandoffRow extends QueryResultRow {
  id: string;
  project_id: string;
  version: number;
  title: string;
  objective: string;
  summary: string;
  decisions_json: unknown;
  constraints_json: unknown;
  assumptions_json: unknown;
  open_questions_json: unknown;
  acceptance_criteria_json: unknown;
  recommended_next_action: string;
  source_json: unknown;
  supersedes_handoff_id: string | null;
  created_at: string;
  schema_version: number;
}

interface CheckpointRow extends QueryResultRow {
  id: string;
  project_id: string;
  sequence: number;
  status: CheckpointStatus;
  summary: string;
  work_completed_json: unknown;
  changed_files_json: unknown;
  verification_json: unknown;
  decisions_json: unknown;
  blockers_json: unknown;
  recommended_next_action: string;
  source_json: unknown;
  supersedes_checkpoint_id: string | null;
  created_at: string;
  schema_version: number;
}

interface HistoryRow extends QueryResultRow, HistoryItem {}

interface CursorValue {
  kind: "projects" | "history";
  sort: string;
  id: string;
}

const jsonValue = <T>(value: unknown): T =>
  (typeof value === "string" ? JSON.parse(value) : value) as T;

const encodeCursor = (cursor: CursorValue): string =>
  Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");

const decodeCursor = (
  cursor: string | undefined,
  kind: CursorValue["kind"],
): CursorValue | undefined => {
  if (!cursor) return undefined;
  try {
    const value = JSON.parse(
      Buffer.from(cursor, "base64url").toString("utf8"),
    ) as Partial<CursorValue>;
    if (value.kind !== kind || typeof value.sort !== "string" || typeof value.id !== "string") {
      throw new Error("invalid cursor shape");
    }
    return value as CursorValue;
  } catch {
    throw new RelayError("VALIDATION_FAILED", "Pagination cursor is invalid.", [
      { field: "cursor", message: "Use only a cursor returned by Relay" },
    ]);
  }
};

const escapeLike = (value: string): string => value.replace(/[\\%_]/g, "\\$&");

const sslFor = (mode: PostgresSslMode): PoolConfig["ssl"] => {
  if (mode === "disable") return false;
  return { rejectUnauthorized: mode === "verify-full" };
};

export class PostgresRelayRepository implements RelayRepository {
  private readonly pool: Pool;
  private readonly ownsPool: boolean;
  private readonly transaction = new AsyncLocalStorage<PoolClient>();
  private readonly migrationOptions: PostgresMigrationOptions;
  private failAuditWrites: boolean;

  constructor(connectionString: string, options: PostgresRepositoryOptions = {}) {
    this.ownsPool = !options.pool;
    this.pool =
      options.pool ??
      new Pool({
        connectionString,
        ssl: sslFor(options.sslMode ?? "verify-full"),
        max: 20,
      });
    this.migrationOptions = options.migration ?? {};
    this.failAuditWrites = options.failAuditWrites ?? false;
  }

  async withRequest<T>(operation: () => T | Promise<T>): Promise<T> {
    return await operation();
  }

  private async rows<Row extends QueryResultRow>(
    text: string,
    values: unknown[] = [],
  ): Promise<Row[]> {
    const client = this.transaction.getStore() ?? this.pool;
    const result = await client.query<Row>(text, values);
    return result.rows;
  }

  async migrate(): Promise<void> {
    const client = await this.pool.connect();
    try {
      await applyPostgresMigrations(client, this.migrationOptions);
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    if (this.ownsPool) await this.pool.end();
  }

  setFailAuditWritesForTesting(value: boolean): void {
    this.failAuditWrites = value;
  }

  async countRowsForTesting(table: string): Promise<number> {
    const allowed = new Set([
      "principals",
      "projects",
      "handoffs",
      "checkpoints",
      "artifacts",
      "idempotency_keys",
      "audit_events",
      "schema_migrations",
    ]);
    if (!allowed.has(table)) throw new Error("Unsupported test table.");
    const [row] = await this.rows<{ count: string | number }>(
      `SELECT COUNT(*) AS count FROM ${table}`,
    );
    return Number(row?.count ?? 0);
  }

  async ensurePrincipal(externalRef: string, now: string): Promise<Principal> {
    const hash = createHash("sha256").update(externalRef).digest("hex");
    const id = `usr_${hash.slice(0, 36)}`;
    await this.rows(
      `INSERT INTO principals (id, external_ref_hash, created_at)
       VALUES ($1, $2, $3)
       ON CONFLICT (external_ref_hash) DO NOTHING`,
      [id, hash, now],
    );
    const [row] = await this.rows<{ id: string; created_at: string }>(
      "SELECT id, created_at FROM principals WHERE external_ref_hash = $1",
      [hash],
    );
    if (!row) throw new Error("Failed to create principal");
    return { id: row.id, createdAt: row.created_at };
  }

  async withIdempotency<T>(
    principalId: string,
    toolName: string,
    key: string,
    payloadHash: string,
    now: string,
    operation: () => T | Promise<T>,
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      return await this.transaction.run(client, async () => {
        const reservation = await client.query(
          `INSERT INTO idempotency_keys
             (principal_id, tool_name, idempotency_key, payload_hash, result_json, created_at)
           VALUES ($1, $2, $3, $4, NULL, $5)
           ON CONFLICT (principal_id, tool_name, idempotency_key) DO NOTHING
           RETURNING principal_id`,
          [principalId, toolName, key, payloadHash, now],
        );

        if (!reservation.rowCount) {
          const existing = await client.query<{
            payload_hash: string;
            result_json: unknown;
          }>(
            `SELECT payload_hash, result_json FROM idempotency_keys
             WHERE principal_id = $1 AND tool_name = $2 AND idempotency_key = $3
             FOR UPDATE`,
            [principalId, toolName, key],
          );
          const row = existing.rows[0];
          if (!row) throw new Error("Idempotency record disappeared during replay.");
          if (row.payload_hash !== payloadHash) {
            throw new RelayError(
              "IDEMPOTENCY_CONFLICT",
              "The idempotency key was already used with a different payload.",
            );
          }
          if (row.result_json === null) throw new Error("Idempotency result was not committed.");
          await client.query("COMMIT");
          return jsonValue<T>(row.result_json);
        }

        const result = await operation();
        await client.query(
          `UPDATE idempotency_keys SET result_json = $4::jsonb
           WHERE principal_id = $1 AND tool_name = $2 AND idempotency_key = $3`,
          [principalId, toolName, key, JSON.stringify(result)],
        );
        await client.query("COMMIT");
        return result;
      });
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // Preserve the original failure.
      }
      throw error;
    } finally {
      client.release();
    }
  }

  private projectFromRow(row: ProjectRow): Project {
    return ProjectSchema.parse({
      id: row.id,
      slug: row.slug,
      name: row.name,
      description: row.description,
      status: row.status,
      tags: jsonValue<string[]>(row.tags_json),
      created_at: row.created_at,
      updated_at: row.updated_at,
      schema_version: row.schema_version,
    });
  }

  async getProjectById(principalId: string, projectId: string): Promise<Project | null> {
    const [row] = await this.rows<ProjectRow>(
      `SELECT p.id, p.slug, p.name, p.description, p.status, p.tags_json,
              p.created_at, p.updated_at, p.schema_version
       FROM projects p
       JOIN project_memberships m ON m.project_id = p.id
       WHERE p.id = $1 AND m.principal_id = $2`,
      [projectId, principalId],
    );
    return row ? this.projectFromRow(row) : null;
  }

  async getProjectBySlug(principalId: string, slug: string): Promise<Project | null> {
    const [row] = await this.rows<ProjectRow>(
      `SELECT p.id, p.slug, p.name, p.description, p.status, p.tags_json,
              p.created_at, p.updated_at, p.schema_version
       FROM projects p
       JOIN project_memberships m ON m.project_id = p.id
       WHERE p.slug = $1 AND m.principal_id = $2`,
      [slug, principalId],
    );
    return row ? this.projectFromRow(row) : null;
  }

  async upsertProject(
    principalId: string,
    input: Omit<UpsertProjectInput, "idempotency_key" | "slug"> & { slug: string },
    projectId: string,
    now: string,
  ): Promise<{ project: Project; created: boolean }> {
    await this.rows("SELECT id FROM principals WHERE id = $1 FOR UPDATE", [principalId]);
    const existing = await this.getProjectBySlug(principalId, input.slug);
    if (existing) {
      await this.rows(
        `UPDATE projects SET name = $1, description = $2, status = $3,
            tags_json = $4::jsonb, updated_at = $5
         WHERE id = $6 AND owner_principal_id = $7`,
        [
          input.name,
          input.description,
          input.status,
          JSON.stringify([...new Set(input.tags)]),
          now,
          existing.id,
          principalId,
        ],
      );
      const project = await this.getProjectById(principalId, existing.id);
      if (!project) throw new Error("Updated project could not be read");
      return { project, created: false };
    }

    await this.rows(
      `INSERT INTO projects
         (id, owner_principal_id, slug, name, description, status, tags_json,
          created_at, updated_at, schema_version)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $8, $9)`,
      [
        projectId,
        principalId,
        input.slug,
        input.name,
        input.description,
        input.status,
        JSON.stringify([...new Set(input.tags)]),
        now,
        SCHEMA_VERSION,
      ],
    );
    await this.rows(
      `INSERT INTO project_memberships (project_id, principal_id, role, created_at)
       VALUES ($1, $2, 'owner', $3)`,
      [projectId, principalId, now],
    );
    const project = await this.getProjectById(principalId, projectId);
    if (!project) throw new Error("Created project could not be read");
    return { project, created: true };
  }

  async listProjects(principalId: string, input: ListProjectsInput): Promise<Page<Project>> {
    const cursor = decodeCursor(input.cursor, "projects");
    const clauses = ["m.principal_id = $1"];
    const values: unknown[] = [principalId];
    if (input.query) {
      values.push(`%${escapeLike(input.query)}%`);
      clauses.push(
        `(p.name ILIKE $${values.length} ESCAPE '\\' OR p.slug ILIKE $${values.length} ESCAPE '\\')`,
      );
    }
    if (input.status) {
      values.push(input.status);
      clauses.push(`p.status = $${values.length}`);
    }
    for (const tag of input.tags ?? []) {
      values.push(tag);
      clauses.push(
        `EXISTS (SELECT 1 FROM jsonb_array_elements_text(p.tags_json) value WHERE lower(value) = lower($${values.length}))`,
      );
    }
    if (cursor) {
      values.push(cursor.sort, cursor.id);
      clauses.push(
        `(p.updated_at < $${values.length - 1} OR (p.updated_at = $${values.length - 1} AND p.id < $${values.length}))`,
      );
    }
    values.push(input.limit + 1);
    const rows = await this.rows<ProjectRow>(
      `SELECT p.id, p.slug, p.name, p.description, p.status, p.tags_json,
              p.created_at, p.updated_at, p.schema_version
       FROM projects p
       JOIN project_memberships m ON m.project_id = p.id
       WHERE ${clauses.join(" AND ")}
       ORDER BY p.updated_at DESC, p.id DESC
       LIMIT $${values.length}`,
      values,
    );
    const hasMore = rows.length > input.limit;
    const visible = rows.slice(0, input.limit);
    const last = visible.at(-1);
    return {
      items: visible.map((row) => this.projectFromRow(row)),
      nextCursor:
        hasMore && last
          ? encodeCursor({ kind: "projects", sort: last.updated_at, id: last.id })
          : null,
    };
  }

  async getProjectRecordIds(principalId: string, projectId: string): Promise<ProjectRecordIds> {
    if (!(await this.getProjectById(principalId, projectId))) {
      throw new RelayError("NOT_FOUND", "Project was not found.");
    }
    const [row] = await this.rows<{
      latest_handoff_id: string | null;
      latest_checkpoint_id: string | null;
    }>(
      `SELECT
         (SELECT id FROM handoffs WHERE project_id = $1 ORDER BY version DESC LIMIT 1) AS latest_handoff_id,
         (SELECT id FROM checkpoints WHERE project_id = $1 ORDER BY sequence DESC LIMIT 1) AS latest_checkpoint_id`,
      [projectId],
    );
    return {
      latestHandoffId: row?.latest_handoff_id ?? null,
      latestCheckpointId: row?.latest_checkpoint_id ?? null,
    };
  }

  private artifactFromRow(row: ArtifactRow): Artifact {
    return ArtifactSchema.parse({
      id: row.id,
      project_id: row.project_id,
      kind: row.kind,
      label: row.label,
      uri: row.uri,
      metadata: jsonValue(row.metadata_json),
      created_at: row.created_at,
      schema_version: row.schema_version,
    });
  }

  async createArtifacts(
    principalId: string,
    projectId: string,
    artifacts: Array<ArtifactDefinition & { id: string }>,
    now: string,
  ): Promise<Artifact[]> {
    if (!(await this.getProjectById(principalId, projectId))) {
      throw new RelayError("NOT_FOUND", "Project was not found.");
    }
    for (const artifact of artifacts) {
      await this.rows(
        `INSERT INTO artifacts
           (id, project_id, kind, label, uri, metadata_json, created_at, schema_version)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)`,
        [
          artifact.id,
          projectId,
          artifact.kind,
          artifact.label,
          artifact.uri,
          JSON.stringify(artifact.metadata),
          now,
          SCHEMA_VERSION,
        ],
      );
    }
    return await this.getArtifactsByIds(
      principalId,
      projectId,
      artifacts.map((artifact) => artifact.id),
    );
  }

  async getArtifactsByIds(
    principalId: string,
    projectId: string,
    artifactIds: string[],
  ): Promise<Artifact[]> {
    if (!(await this.getProjectById(principalId, projectId))) {
      throw new RelayError("NOT_FOUND", "Project was not found.");
    }
    if (artifactIds.length === 0) return [];
    const values: unknown[] = [projectId, principalId, ...artifactIds];
    const placeholders = artifactIds.map((_, index) => `$${index + 3}`).join(", ");
    const rows = await this.rows<ArtifactRow>(
      `SELECT a.id, a.project_id, a.kind, a.label, a.uri, a.metadata_json,
              a.created_at, a.schema_version
       FROM artifacts a
       JOIN project_memberships m ON m.project_id = a.project_id
       WHERE a.project_id = $1 AND m.principal_id = $2 AND a.id IN (${placeholders})
       ORDER BY a.id`,
      values,
    );
    return rows.map((row) => this.artifactFromRow(row));
  }

  async getProjectArtifacts(
    principalId: string,
    projectId: string,
    limit: number,
  ): Promise<Artifact[]> {
    if (!(await this.getProjectById(principalId, projectId))) {
      throw new RelayError("NOT_FOUND", "Project was not found.");
    }
    const rows = await this.rows<ArtifactRow>(
      `SELECT a.id, a.project_id, a.kind, a.label, a.uri, a.metadata_json,
              a.created_at, a.schema_version
       FROM artifacts a
       JOIN project_memberships m ON m.project_id = a.project_id
       WHERE a.project_id = $1 AND m.principal_id = $2
       ORDER BY a.created_at DESC, a.id DESC
       LIMIT $3`,
      [projectId, principalId, limit],
    );
    return rows.map((row) => this.artifactFromRow(row));
  }

  private async artifactIdsForRecord(
    type: "handoff" | "checkpoint",
    recordId: string,
  ): Promise<string[]> {
    const rows = await this.rows<{ artifact_id: string }>(
      `SELECT artifact_id FROM record_artifacts
       WHERE record_type = $1 AND record_id = $2 ORDER BY artifact_id`,
      [type, recordId],
    );
    return rows.map((row) => row.artifact_id);
  }

  private async handoffFromRow(row: HandoffRow): Promise<Handoff> {
    return HandoffSchema.parse({
      id: row.id,
      project_id: row.project_id,
      version: row.version,
      title: row.title,
      objective: row.objective,
      summary: row.summary,
      decisions: jsonValue(row.decisions_json),
      constraints: jsonValue(row.constraints_json),
      assumptions: jsonValue(row.assumptions_json),
      open_questions: jsonValue(row.open_questions_json),
      acceptance_criteria: jsonValue(row.acceptance_criteria_json),
      recommended_next_action: row.recommended_next_action,
      artifact_refs: await this.artifactIdsForRecord("handoff", row.id),
      source: jsonValue(row.source_json),
      supersedes_handoff_id: row.supersedes_handoff_id,
      created_at: row.created_at,
      schema_version: row.schema_version,
    });
  }

  async insertHandoff(principalId: string, draft: HandoffDraft): Promise<Handoff> {
    if (!(await this.getProjectById(principalId, draft.project_id))) {
      throw new RelayError("NOT_FOUND", "Project was not found.");
    }
    await this.rows("SELECT id FROM projects WHERE id = $1 FOR UPDATE", [draft.project_id]);
    const [ordinal] = await this.rows<{ value: number }>(
      "SELECT COALESCE(MAX(version), 0) + 1 AS value FROM handoffs WHERE project_id = $1",
      [draft.project_id],
    );
    await this.rows(
      `INSERT INTO handoffs
         (id, project_id, version, title, objective, summary, decisions_json,
          constraints_json, assumptions_json, open_questions_json, acceptance_criteria_json,
          recommended_next_action, source_json, supersedes_handoff_id, created_at, schema_version)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9::jsonb,
               $10::jsonb, $11::jsonb, $12, $13::jsonb, $14, $15, $16)`,
      [
        draft.id,
        draft.project_id,
        Number(ordinal?.value ?? 1),
        draft.title,
        draft.objective,
        draft.summary,
        JSON.stringify(draft.decisions ?? []),
        JSON.stringify(draft.constraints ?? []),
        JSON.stringify(draft.assumptions ?? []),
        JSON.stringify(draft.open_questions ?? []),
        JSON.stringify(draft.acceptance_criteria),
        draft.recommended_next_action,
        JSON.stringify(draft.source),
        draft.supersedes_handoff_id ?? null,
        draft.createdAt,
        SCHEMA_VERSION,
      ],
    );
    for (const artifactId of draft.artifactIds) {
      await this.rows(
        `INSERT INTO record_artifacts (record_type, record_id, artifact_id)
         VALUES ('handoff', $1, $2)`,
        [draft.id, artifactId],
      );
    }
    const handoff = await this.getHandoffById(principalId, draft.id);
    if (!handoff) throw new Error("Created handoff could not be read");
    return handoff;
  }

  async getHandoffById(principalId: string, handoffId: string): Promise<Handoff | null> {
    const [row] = await this.rows<HandoffRow>(
      `SELECT h.* FROM handoffs h
       JOIN project_memberships m ON m.project_id = h.project_id
       WHERE h.id = $1 AND m.principal_id = $2`,
      [handoffId, principalId],
    );
    return row ? await this.handoffFromRow(row) : null;
  }

  async getLatestHandoff(principalId: string, projectId: string): Promise<Handoff | null> {
    const [row] = await this.rows<HandoffRow>(
      `SELECT h.* FROM handoffs h
       JOIN project_memberships m ON m.project_id = h.project_id
       WHERE h.project_id = $1 AND m.principal_id = $2
       ORDER BY h.version DESC LIMIT 1`,
      [projectId, principalId],
    );
    return row ? await this.handoffFromRow(row) : null;
  }

  private async checkpointFromRow(row: CheckpointRow): Promise<Checkpoint> {
    return CheckpointSchema.parse({
      id: row.id,
      project_id: row.project_id,
      sequence: row.sequence,
      status: row.status,
      summary: row.summary,
      work_completed: jsonValue(row.work_completed_json),
      changed_files: jsonValue(row.changed_files_json),
      verification: jsonValue(row.verification_json),
      decisions: jsonValue(row.decisions_json),
      blockers: jsonValue(row.blockers_json),
      recommended_next_action: row.recommended_next_action,
      artifact_refs: await this.artifactIdsForRecord("checkpoint", row.id),
      source: jsonValue(row.source_json),
      supersedes_checkpoint_id: row.supersedes_checkpoint_id,
      created_at: row.created_at,
      schema_version: row.schema_version,
    });
  }

  async insertCheckpoint(principalId: string, draft: CheckpointDraft): Promise<Checkpoint> {
    if (!(await this.getProjectById(principalId, draft.project_id))) {
      throw new RelayError("NOT_FOUND", "Project was not found.");
    }
    await this.rows("SELECT id FROM projects WHERE id = $1 FOR UPDATE", [draft.project_id]);
    const [ordinal] = await this.rows<{ value: number }>(
      "SELECT COALESCE(MAX(sequence), 0) + 1 AS value FROM checkpoints WHERE project_id = $1",
      [draft.project_id],
    );
    await this.rows(
      `INSERT INTO checkpoints
         (id, project_id, sequence, status, summary, work_completed_json,
          changed_files_json, verification_json, decisions_json, blockers_json,
          recommended_next_action, source_json, supersedes_checkpoint_id, created_at,
          schema_version)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8::jsonb, $9::jsonb,
               $10::jsonb, $11, $12::jsonb, $13, $14, $15)`,
      [
        draft.id,
        draft.project_id,
        Number(ordinal?.value ?? 1),
        draft.status,
        draft.summary,
        JSON.stringify(draft.work_completed),
        JSON.stringify(draft.changed_files ?? []),
        JSON.stringify(draft.verification ?? []),
        JSON.stringify(draft.decisions ?? []),
        JSON.stringify(draft.blockers ?? []),
        draft.recommended_next_action,
        JSON.stringify(draft.source),
        draft.supersedes_checkpoint_id ?? null,
        draft.createdAt,
        SCHEMA_VERSION,
      ],
    );
    for (const artifactId of draft.artifactIds) {
      await this.rows(
        `INSERT INTO record_artifacts (record_type, record_id, artifact_id)
         VALUES ('checkpoint', $1, $2)`,
        [draft.id, artifactId],
      );
    }
    const checkpoint = await this.getCheckpointById(principalId, draft.id);
    if (!checkpoint) throw new Error("Created checkpoint could not be read");
    return checkpoint;
  }

  async getCheckpointById(principalId: string, checkpointId: string): Promise<Checkpoint | null> {
    const [row] = await this.rows<CheckpointRow>(
      `SELECT c.* FROM checkpoints c
       JOIN project_memberships m ON m.project_id = c.project_id
       WHERE c.id = $1 AND m.principal_id = $2`,
      [checkpointId, principalId],
    );
    return row ? await this.checkpointFromRow(row) : null;
  }

  async getLatestCheckpoint(
    principalId: string,
    projectId: string,
    status?: CheckpointStatus,
  ): Promise<Checkpoint | null> {
    const values: unknown[] = [projectId, principalId];
    const statusClause = status ? `AND c.status = $${values.push(status)}` : "";
    const [row] = await this.rows<CheckpointRow>(
      `SELECT c.* FROM checkpoints c
       JOIN project_memberships m ON m.project_id = c.project_id
       WHERE c.project_id = $1 AND m.principal_id = $2 ${statusClause}
       ORDER BY c.sequence DESC LIMIT 1`,
      values,
    );
    return row ? await this.checkpointFromRow(row) : null;
  }

  async countProjectRecords(
    principalId: string,
    projectId: string,
  ): Promise<{ handoffCount: number; checkpointCount: number }> {
    if (!(await this.getProjectById(principalId, projectId))) {
      throw new RelayError("NOT_FOUND", "Project was not found.");
    }
    const [row] = await this.rows<{
      handoff_count: string | number;
      checkpoint_count: string | number;
    }>(
      `SELECT
         (SELECT COUNT(*) FROM handoffs WHERE project_id = $1) AS handoff_count,
         (SELECT COUNT(*) FROM checkpoints WHERE project_id = $1) AS checkpoint_count`,
      [projectId],
    );
    return {
      handoffCount: Number(row?.handoff_count ?? 0),
      checkpointCount: Number(row?.checkpoint_count ?? 0),
    };
  }

  async listProjectHistory(
    principalId: string,
    input: ListProjectHistoryInput,
  ): Promise<Page<HistoryItem>> {
    const cursor = decodeCursor(input.cursor, "history");
    const types = input.record_types ?? ["handoff", "checkpoint"];
    const values: unknown[] = [input.project_id, principalId, ...types];
    const typePlaceholders = types.map((_, index) => `$${index + 3}`).join(", ");
    let cursorClause = "";
    if (cursor) {
      values.push(cursor.sort, cursor.id);
      cursorClause = `AND (created_at < $${values.length - 1} OR (created_at = $${values.length - 1} AND id < $${values.length}))`;
    }
    values.push(input.limit + 1);
    const rows = await this.rows<HistoryRow>(
      `SELECT id, type, ordinal, title, status, summary, created_at, supersedes_id
       FROM (
         SELECT h.id, 'handoff' AS type, h.version AS ordinal, h.title, NULL AS status,
                h.summary, h.created_at, h.supersedes_handoff_id AS supersedes_id
         FROM handoffs h
         JOIN project_memberships m ON m.project_id = h.project_id
         WHERE h.project_id = $1 AND m.principal_id = $2
         UNION ALL
         SELECT c.id, 'checkpoint' AS type, c.sequence AS ordinal,
                'Checkpoint ' || c.sequence AS title, c.status, c.summary, c.created_at,
                c.supersedes_checkpoint_id AS supersedes_id
         FROM checkpoints c
         JOIN project_memberships m ON m.project_id = c.project_id
         WHERE c.project_id = $1 AND m.principal_id = $2
       ) records
       WHERE type IN (${typePlaceholders}) ${cursorClause}
       ORDER BY created_at DESC, id DESC
       LIMIT $${values.length}`,
      values,
    );
    const hasMore = rows.length > input.limit;
    const visible = rows.slice(0, input.limit);
    const last = visible.at(-1);
    return {
      items: visible,
      nextCursor:
        hasMore && last
          ? encodeCursor({ kind: "history", sort: last.created_at, id: last.id })
          : null,
    };
  }

  async appendAudit(event: {
    id: string;
    principalId: string;
    projectId: string;
    action: string;
    targetType: string;
    targetId: string;
    requestId: string;
    createdAt: string;
    metadata?: Record<string, string | number | boolean | null>;
  }): Promise<void> {
    if (this.failAuditWrites) throw new Error("Injected audit write failure");
    if (!(await this.getProjectById(event.principalId, event.projectId))) {
      throw new RelayError("ACCESS_DENIED", "Project access was denied.");
    }
    await this.rows(
      `INSERT INTO audit_events
         (id, principal_id, project_id, action, target_type, target_id, request_id,
          metadata_json, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9)`,
      [
        event.id,
        event.principalId,
        event.projectId,
        event.action,
        event.targetType,
        event.targetId,
        event.requestId,
        JSON.stringify(event.metadata ?? {}),
        event.createdAt,
      ],
    );
  }
}
