import { createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import Database from "better-sqlite3";
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
import { applyMigrations } from "./migrations.js";

interface SqliteRepositoryOptions {
  migrationDirectory?: string;
  failAuditWrites?: boolean;
}

interface ProjectRow {
  id: string;
  slug: string;
  name: string;
  description: string;
  status: "active" | "archived";
  tags_json: string;
  created_at: string;
  updated_at: string;
  schema_version: number;
}

interface ArtifactRow {
  id: string;
  project_id: string;
  kind: Artifact["kind"];
  label: string;
  uri: string;
  metadata_json: string;
  created_at: string;
  schema_version: number;
}

interface HandoffRow {
  id: string;
  project_id: string;
  version: number;
  title: string;
  objective: string;
  summary: string;
  decisions_json: string;
  constraints_json: string;
  assumptions_json: string;
  open_questions_json: string;
  acceptance_criteria_json: string;
  recommended_next_action: string;
  source_json: string;
  supersedes_handoff_id: string | null;
  created_at: string;
  schema_version: number;
}

interface CheckpointRow {
  id: string;
  project_id: string;
  sequence: number;
  status: CheckpointStatus;
  summary: string;
  work_completed_json: string;
  changed_files_json: string;
  verification_json: string;
  decisions_json: string;
  blockers_json: string;
  recommended_next_action: string;
  source_json: string;
  supersedes_checkpoint_id: string | null;
  created_at: string;
  schema_version: number;
}

interface HistoryRow extends HistoryItem {}

interface CursorValue {
  kind: "projects" | "history";
  sort: string;
  id: string;
}

const parseJson = <T>(value: string): T => JSON.parse(value) as T;
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

export class SqliteRelayRepository implements RelayRepository {
  private readonly database: Database.Database;
  private failAuditWrites: boolean;
  private readonly migrationDirectory?: string;

  constructor(
    readonly databasePath: string,
    options: SqliteRepositoryOptions = {},
  ) {
    if (databasePath !== ":memory:") {
      mkdirSync(dirname(resolve(databasePath)), { recursive: true });
    }
    this.database = new Database(databasePath);
    this.database.pragma("foreign_keys = ON");
    this.database.pragma("busy_timeout = 5000");
    if (databasePath !== ":memory:") this.database.pragma("journal_mode = WAL");
    this.failAuditWrites = options.failAuditWrites ?? false;
    this.migrationDirectory = options.migrationDirectory;
  }

  migrate(): void {
    applyMigrations(this.database, this.migrationDirectory);
    this.database.pragma("foreign_keys = ON");
  }

  close(): void {
    if (this.database.open) this.database.close();
  }

  setFailAuditWritesForTesting(value: boolean): void {
    this.failAuditWrites = value;
  }

  diagnosticsForTesting(): { foreignKeys: boolean; tables: string[] } {
    const foreignKeys = this.database.pragma("foreign_keys", { simple: true }) === 1;
    const tables = (
      this.database
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
        .all() as Array<{ name: string }>
    ).map((row) => row.name);
    return { foreignKeys, tables };
  }

  countRowsForTesting(
    table:
      | "projects"
      | "handoffs"
      | "checkpoints"
      | "artifacts"
      | "idempotency_keys"
      | "audit_events",
  ): number {
    const row = this.database.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as {
      count: number;
    };
    return row.count;
  }

  ensurePrincipal(externalRef: string, now: string): Principal {
    const hash = createHash("sha256").update(externalRef).digest("hex");
    const id = `usr_${hash.slice(0, 36)}`;
    this.database
      .prepare(
        "INSERT OR IGNORE INTO principals (id, external_ref_hash, created_at) VALUES (?, ?, ?)",
      )
      .run(id, hash, now);
    const row = this.database
      .prepare("SELECT id, created_at FROM principals WHERE external_ref_hash = ?")
      .get(hash) as { id: string; created_at: string } | undefined;
    if (!row) throw new Error("Failed to create principal");
    return { id: row.id, createdAt: row.created_at };
  }

  withIdempotency<T>(
    principalId: string,
    toolName: string,
    key: string,
    payloadHash: string,
    now: string,
    operation: () => T,
  ): T {
    const execute = this.database.transaction(() => {
      const existing = this.database
        .prepare(
          `SELECT payload_hash, result_json
           FROM idempotency_keys
           WHERE principal_id = ? AND tool_name = ? AND idempotency_key = ?`,
        )
        .get(principalId, toolName, key) as
        | { payload_hash: string; result_json: string }
        | undefined;

      if (existing) {
        if (existing.payload_hash !== payloadHash) {
          throw new RelayError(
            "IDEMPOTENCY_CONFLICT",
            "The idempotency key was already used with a different payload.",
          );
        }
        return parseJson<T>(existing.result_json);
      }

      const result = operation();
      this.database
        .prepare(
          `INSERT INTO idempotency_keys
             (principal_id, tool_name, idempotency_key, payload_hash, result_json, created_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(principalId, toolName, key, payloadHash, JSON.stringify(result), now);
      return result;
    });

    return execute.immediate();
  }

  private projectFromRow(row: ProjectRow): Project {
    return ProjectSchema.parse({
      id: row.id,
      slug: row.slug,
      name: row.name,
      description: row.description,
      status: row.status,
      tags: parseJson<string[]>(row.tags_json),
      created_at: row.created_at,
      updated_at: row.updated_at,
      schema_version: row.schema_version,
    });
  }

  getProjectById(principalId: string, projectId: string): Project | null {
    const row = this.database
      .prepare(
        `SELECT p.id, p.slug, p.name, p.description, p.status, p.tags_json,
                p.created_at, p.updated_at, p.schema_version
         FROM projects p
         JOIN project_memberships m ON m.project_id = p.id
         WHERE p.id = ? AND m.principal_id = ?`,
      )
      .get(projectId, principalId) as ProjectRow | undefined;
    return row ? this.projectFromRow(row) : null;
  }

  getProjectBySlug(principalId: string, slug: string): Project | null {
    const row = this.database
      .prepare(
        `SELECT p.id, p.slug, p.name, p.description, p.status, p.tags_json,
                p.created_at, p.updated_at, p.schema_version
         FROM projects p
         JOIN project_memberships m ON m.project_id = p.id
         WHERE p.slug = ? AND m.principal_id = ?`,
      )
      .get(slug, principalId) as ProjectRow | undefined;
    return row ? this.projectFromRow(row) : null;
  }

  upsertProject(
    principalId: string,
    input: Omit<UpsertProjectInput, "idempotency_key" | "slug"> & { slug: string },
    projectId: string,
    now: string,
  ): { project: Project; created: boolean } {
    const existing = this.getProjectBySlug(principalId, input.slug);
    if (existing) {
      this.database
        .prepare(
          `UPDATE projects
           SET name = ?, description = ?, status = ?, tags_json = ?, updated_at = ?
           WHERE id = ? AND owner_principal_id = ?`,
        )
        .run(
          input.name,
          input.description,
          input.status,
          JSON.stringify([...new Set(input.tags)]),
          now,
          existing.id,
          principalId,
        );
      const project = this.getProjectById(principalId, existing.id);
      if (!project) throw new Error("Updated project could not be read");
      return { project, created: false };
    }

    this.database
      .prepare(
        `INSERT INTO projects
           (id, owner_principal_id, slug, name, description, status, tags_json,
            created_at, updated_at, schema_version)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        projectId,
        principalId,
        input.slug,
        input.name,
        input.description,
        input.status,
        JSON.stringify([...new Set(input.tags)]),
        now,
        now,
        SCHEMA_VERSION,
      );
    this.database
      .prepare(
        `INSERT INTO project_memberships (project_id, principal_id, role, created_at)
         VALUES (?, ?, 'owner', ?)`,
      )
      .run(projectId, principalId, now);
    const project = this.getProjectById(principalId, projectId);
    if (!project) throw new Error("Created project could not be read");
    return { project, created: true };
  }

  listProjects(principalId: string, input: ListProjectsInput): Page<Project> {
    const cursor = decodeCursor(input.cursor, "projects");
    const clauses = ["m.principal_id = @principalId"];
    const parameters: Record<string, unknown> = {
      principalId,
      limit: input.limit + 1,
    };

    if (input.query) {
      clauses.push(
        "(p.name LIKE @query ESCAPE '\\' COLLATE NOCASE OR p.slug LIKE @query ESCAPE '\\' COLLATE NOCASE)",
      );
      parameters.query = `%${escapeLike(input.query)}%`;
    }
    if (input.status) {
      clauses.push("p.status = @status");
      parameters.status = input.status;
    }
    for (const [index, tag] of (input.tags ?? []).entries()) {
      const name = `tag${index}`;
      clauses.push(
        `EXISTS (SELECT 1 FROM json_each(p.tags_json) j WHERE lower(CAST(j.value AS TEXT)) = lower(@${name}))`,
      );
      parameters[name] = tag;
    }
    if (cursor) {
      clauses.push(
        "(p.updated_at < @cursorSort OR (p.updated_at = @cursorSort AND p.id < @cursorId))",
      );
      parameters.cursorSort = cursor.sort;
      parameters.cursorId = cursor.id;
    }

    const rows = this.database
      .prepare(
        `SELECT p.id, p.slug, p.name, p.description, p.status, p.tags_json,
                p.created_at, p.updated_at, p.schema_version
         FROM projects p
         JOIN project_memberships m ON m.project_id = p.id
         WHERE ${clauses.join(" AND ")}
         ORDER BY p.updated_at DESC, p.id DESC
         LIMIT @limit`,
      )
      .all(parameters) as ProjectRow[];
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

  getProjectRecordIds(principalId: string, projectId: string): ProjectRecordIds {
    if (!this.getProjectById(principalId, projectId)) {
      throw new RelayError("NOT_FOUND", "Project was not found.");
    }
    const row = this.database
      .prepare(
        `SELECT
           (SELECT id FROM handoffs WHERE project_id = ? ORDER BY version DESC LIMIT 1) AS latest_handoff_id,
           (SELECT id FROM checkpoints WHERE project_id = ? ORDER BY sequence DESC LIMIT 1) AS latest_checkpoint_id`,
      )
      .get(projectId, projectId) as {
      latest_handoff_id: string | null;
      latest_checkpoint_id: string | null;
    };
    return {
      latestHandoffId: row.latest_handoff_id,
      latestCheckpointId: row.latest_checkpoint_id,
    };
  }

  private artifactFromRow(row: ArtifactRow): Artifact {
    return ArtifactSchema.parse({
      id: row.id,
      project_id: row.project_id,
      kind: row.kind,
      label: row.label,
      uri: row.uri,
      metadata: parseJson<Record<string, string | number | boolean | null>>(row.metadata_json),
      created_at: row.created_at,
      schema_version: row.schema_version,
    });
  }

  createArtifacts(
    principalId: string,
    projectId: string,
    artifacts: Array<ArtifactDefinition & { id: string }>,
    now: string,
  ): Artifact[] {
    if (!this.getProjectById(principalId, projectId)) {
      throw new RelayError("NOT_FOUND", "Project was not found.");
    }
    const insert = this.database.prepare(
      `INSERT INTO artifacts
         (id, project_id, kind, label, uri, metadata_json, created_at, schema_version)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const artifact of artifacts) {
      insert.run(
        artifact.id,
        projectId,
        artifact.kind,
        artifact.label,
        artifact.uri,
        JSON.stringify(artifact.metadata),
        now,
        SCHEMA_VERSION,
      );
    }
    return this.getArtifactsByIds(
      principalId,
      projectId,
      artifacts.map((artifact) => artifact.id),
    );
  }

  getArtifactsByIds(principalId: string, projectId: string, artifactIds: string[]): Artifact[] {
    if (!this.getProjectById(principalId, projectId)) {
      throw new RelayError("NOT_FOUND", "Project was not found.");
    }
    if (artifactIds.length === 0) return [];
    const placeholders = artifactIds.map(() => "?").join(", ");
    const rows = this.database
      .prepare(
        `SELECT a.id, a.project_id, a.kind, a.label, a.uri, a.metadata_json,
                a.created_at, a.schema_version
         FROM artifacts a
         JOIN project_memberships m ON m.project_id = a.project_id
         WHERE a.project_id = ? AND m.principal_id = ? AND a.id IN (${placeholders})
         ORDER BY a.id`,
      )
      .all(projectId, principalId, ...artifactIds) as ArtifactRow[];
    return rows.map((row) => this.artifactFromRow(row));
  }

  getProjectArtifacts(principalId: string, projectId: string, limit: number): Artifact[] {
    if (!this.getProjectById(principalId, projectId)) {
      throw new RelayError("NOT_FOUND", "Project was not found.");
    }
    const rows = this.database
      .prepare(
        `SELECT a.id, a.project_id, a.kind, a.label, a.uri, a.metadata_json,
                a.created_at, a.schema_version
         FROM artifacts a
         JOIN project_memberships m ON m.project_id = a.project_id
         WHERE a.project_id = ? AND m.principal_id = ?
         ORDER BY a.created_at DESC, a.id DESC
         LIMIT ?`,
      )
      .all(projectId, principalId, limit) as ArtifactRow[];
    return rows.map((row) => this.artifactFromRow(row));
  }

  private artifactIdsForRecord(type: "handoff" | "checkpoint", recordId: string): string[] {
    return (
      this.database
        .prepare(
          `SELECT artifact_id FROM record_artifacts
           WHERE record_type = ? AND record_id = ? ORDER BY artifact_id`,
        )
        .all(type, recordId) as Array<{ artifact_id: string }>
    ).map((row) => row.artifact_id);
  }

  private handoffFromRow(row: HandoffRow): Handoff {
    return HandoffSchema.parse({
      id: row.id,
      project_id: row.project_id,
      version: row.version,
      title: row.title,
      objective: row.objective,
      summary: row.summary,
      decisions: parseJson(row.decisions_json),
      constraints: parseJson(row.constraints_json),
      assumptions: parseJson(row.assumptions_json),
      open_questions: parseJson(row.open_questions_json),
      acceptance_criteria: parseJson(row.acceptance_criteria_json),
      recommended_next_action: row.recommended_next_action,
      artifact_refs: this.artifactIdsForRecord("handoff", row.id),
      source: parseJson(row.source_json),
      supersedes_handoff_id: row.supersedes_handoff_id,
      created_at: row.created_at,
      schema_version: row.schema_version,
    });
  }

  insertHandoff(principalId: string, draft: HandoffDraft): Handoff {
    if (!this.getProjectById(principalId, draft.project_id)) {
      throw new RelayError("NOT_FOUND", "Project was not found.");
    }
    const ordinal = this.database
      .prepare("SELECT COALESCE(MAX(version), 0) + 1 AS value FROM handoffs WHERE project_id = ?")
      .get(draft.project_id) as { value: number };
    this.database
      .prepare(
        `INSERT INTO handoffs
           (id, project_id, version, title, objective, summary, decisions_json,
            constraints_json, assumptions_json, open_questions_json, acceptance_criteria_json,
            recommended_next_action, source_json, supersedes_handoff_id, created_at, schema_version)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        draft.id,
        draft.project_id,
        ordinal.value,
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
      );
    const attach = this.database.prepare(
      "INSERT INTO record_artifacts (record_type, record_id, artifact_id) VALUES ('handoff', ?, ?)",
    );
    for (const artifactId of draft.artifactIds) attach.run(draft.id, artifactId);
    const handoff = this.getHandoffById(principalId, draft.id);
    if (!handoff) throw new Error("Created handoff could not be read");
    return handoff;
  }

  getHandoffById(principalId: string, handoffId: string): Handoff | null {
    const row = this.database
      .prepare(
        `SELECT h.*
         FROM handoffs h
         JOIN project_memberships m ON m.project_id = h.project_id
         WHERE h.id = ? AND m.principal_id = ?`,
      )
      .get(handoffId, principalId) as HandoffRow | undefined;
    return row ? this.handoffFromRow(row) : null;
  }

  getLatestHandoff(principalId: string, projectId: string): Handoff | null {
    const row = this.database
      .prepare(
        `SELECT h.*
         FROM handoffs h
         JOIN project_memberships m ON m.project_id = h.project_id
         WHERE h.project_id = ? AND m.principal_id = ?
         ORDER BY h.version DESC LIMIT 1`,
      )
      .get(projectId, principalId) as HandoffRow | undefined;
    return row ? this.handoffFromRow(row) : null;
  }

  private checkpointFromRow(row: CheckpointRow): Checkpoint {
    return CheckpointSchema.parse({
      id: row.id,
      project_id: row.project_id,
      sequence: row.sequence,
      status: row.status,
      summary: row.summary,
      work_completed: parseJson(row.work_completed_json),
      changed_files: parseJson(row.changed_files_json),
      verification: parseJson(row.verification_json),
      decisions: parseJson(row.decisions_json),
      blockers: parseJson(row.blockers_json),
      recommended_next_action: row.recommended_next_action,
      artifact_refs: this.artifactIdsForRecord("checkpoint", row.id),
      source: parseJson(row.source_json),
      supersedes_checkpoint_id: row.supersedes_checkpoint_id,
      created_at: row.created_at,
      schema_version: row.schema_version,
    });
  }

  insertCheckpoint(principalId: string, draft: CheckpointDraft): Checkpoint {
    if (!this.getProjectById(principalId, draft.project_id)) {
      throw new RelayError("NOT_FOUND", "Project was not found.");
    }
    const ordinal = this.database
      .prepare(
        "SELECT COALESCE(MAX(sequence), 0) + 1 AS value FROM checkpoints WHERE project_id = ?",
      )
      .get(draft.project_id) as { value: number };
    this.database
      .prepare(
        `INSERT INTO checkpoints
           (id, project_id, sequence, status, summary, work_completed_json,
            changed_files_json, verification_json, decisions_json, blockers_json,
            recommended_next_action, source_json, supersedes_checkpoint_id, created_at,
            schema_version)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        draft.id,
        draft.project_id,
        ordinal.value,
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
      );
    const attach = this.database.prepare(
      "INSERT INTO record_artifacts (record_type, record_id, artifact_id) VALUES ('checkpoint', ?, ?)",
    );
    for (const artifactId of draft.artifactIds) attach.run(draft.id, artifactId);
    const checkpoint = this.getCheckpointById(principalId, draft.id);
    if (!checkpoint) throw new Error("Created checkpoint could not be read");
    return checkpoint;
  }

  getCheckpointById(principalId: string, checkpointId: string): Checkpoint | null {
    const row = this.database
      .prepare(
        `SELECT c.*
         FROM checkpoints c
         JOIN project_memberships m ON m.project_id = c.project_id
         WHERE c.id = ? AND m.principal_id = ?`,
      )
      .get(checkpointId, principalId) as CheckpointRow | undefined;
    return row ? this.checkpointFromRow(row) : null;
  }

  getLatestCheckpoint(
    principalId: string,
    projectId: string,
    status?: CheckpointStatus,
  ): Checkpoint | null {
    const row = this.database
      .prepare(
        `SELECT c.*
         FROM checkpoints c
         JOIN project_memberships m ON m.project_id = c.project_id
         WHERE c.project_id = @projectId AND m.principal_id = @principalId
           AND (@status IS NULL OR c.status = @status)
         ORDER BY c.sequence DESC LIMIT 1`,
      )
      .get({ projectId, principalId, status: status ?? null }) as CheckpointRow | undefined;
    return row ? this.checkpointFromRow(row) : null;
  }

  countProjectRecords(
    principalId: string,
    projectId: string,
  ): { handoffCount: number; checkpointCount: number } {
    if (!this.getProjectById(principalId, projectId)) {
      throw new RelayError("NOT_FOUND", "Project was not found.");
    }
    const row = this.database
      .prepare(
        `SELECT
           (SELECT COUNT(*) FROM handoffs WHERE project_id = ?) AS handoff_count,
           (SELECT COUNT(*) FROM checkpoints WHERE project_id = ?) AS checkpoint_count`,
      )
      .get(projectId, projectId) as { handoff_count: number; checkpoint_count: number };
    return { handoffCount: row.handoff_count, checkpointCount: row.checkpoint_count };
  }

  listProjectHistory(principalId: string, input: ListProjectHistoryInput): Page<HistoryItem> {
    const cursor = decodeCursor(input.cursor, "history");
    const types = input.record_types ?? ["handoff", "checkpoint"];
    const parameters: Record<string, unknown> = {
      principalId,
      projectId: input.project_id,
      limit: input.limit + 1,
    };
    const typeNames = types.map((type, index) => {
      const name = `type${index}`;
      parameters[name] = type;
      return `@${name}`;
    });
    const cursorClause = cursor
      ? "AND (created_at < @cursorSort OR (created_at = @cursorSort AND id < @cursorId))"
      : "";
    if (cursor) {
      parameters.cursorSort = cursor.sort;
      parameters.cursorId = cursor.id;
    }

    const rows = this.database
      .prepare(
        `SELECT id, type, ordinal, title, status, summary, created_at, supersedes_id
         FROM (
           SELECT h.id, 'handoff' AS type, h.version AS ordinal, h.title, NULL AS status,
                  h.summary, h.created_at, h.supersedes_handoff_id AS supersedes_id
           FROM handoffs h
           JOIN project_memberships m ON m.project_id = h.project_id
           WHERE h.project_id = @projectId AND m.principal_id = @principalId
           UNION ALL
           SELECT c.id, 'checkpoint' AS type, c.sequence AS ordinal,
                  'Checkpoint ' || c.sequence AS title, c.status, c.summary, c.created_at,
                  c.supersedes_checkpoint_id AS supersedes_id
           FROM checkpoints c
           JOIN project_memberships m ON m.project_id = c.project_id
           WHERE c.project_id = @projectId AND m.principal_id = @principalId
         )
         WHERE type IN (${typeNames.join(", ")}) ${cursorClause}
         ORDER BY created_at DESC, id DESC
         LIMIT @limit`,
      )
      .all(parameters) as HistoryRow[];
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

  appendAudit(event: {
    id: string;
    principalId: string;
    projectId: string;
    action: string;
    targetType: string;
    targetId: string;
    requestId: string;
    createdAt: string;
    metadata?: Record<string, string | number | boolean | null>;
  }): void {
    if (this.failAuditWrites) throw new Error("Injected audit write failure");
    if (!this.getProjectById(event.principalId, event.projectId)) {
      throw new RelayError("ACCESS_DENIED", "Project access was denied.");
    }
    this.database
      .prepare(
        `INSERT INTO audit_events
           (id, principal_id, project_id, action, target_type, target_id, request_id,
            metadata_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        event.id,
        event.principalId,
        event.projectId,
        event.action,
        event.targetType,
        event.targetId,
        event.requestId,
        JSON.stringify(event.metadata ?? {}),
        event.createdAt,
      );
  }
}
