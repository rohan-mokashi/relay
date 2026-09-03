import { PGlite } from "@electric-sql/pglite";
import type { QueryResultRow } from "pg";
import { applyPostgresMigrations } from "../packages/persistence-postgres/src/index.js";
import { SqliteRelayRepository } from "../packages/persistence-sqlite/src/index.js";

const repository = new SqliteRelayRepository(":memory:");
try {
  repository.migrate();
  repository.migrate();
  const diagnostics = repository.diagnosticsForTesting();
  const required = [
    "artifacts",
    "audit_events",
    "checkpoints",
    "handoffs",
    "idempotency_keys",
    "principals",
    "project_memberships",
    "projects",
    "record_artifacts",
    "schema_migrations",
  ];
  if (!diagnostics.foreignKeys) throw new Error("SQLite foreign keys are disabled.");
  for (const table of required) {
    if (!diagnostics.tables.includes(table)) throw new Error(`Missing migration table: ${table}`);
  }
  process.stdout.write(
    "Relay migrations apply twice deterministically with foreign keys enabled.\n",
  );
} finally {
  repository.close();
}

const postgres = await PGlite.create();
try {
  const query = async <Row extends QueryResultRow>(text: string, values: unknown[] = []) => {
    if (values.length === 0 && text.split(";").length > 2) {
      await postgres.exec(text);
      return { rows: [] as Row[], fields: [], command: "", rowCount: 0, oid: 0 };
    }
    const result = await postgres.query<Row>(text, values);
    return {
      ...result,
      command: "",
      rowCount: result.rows.length > 0 ? result.rows.length : (result.affectedRows ?? 0),
      oid: 0,
    };
  };
  const client = { query };
  await applyPostgresMigrations(client, { advisoryLock: false });
  await applyPostgresMigrations(client, { advisoryLock: false });
  const migrations = await postgres.query<{ count: number }>(
    "SELECT COUNT(*)::integer AS count FROM schema_migrations",
  );
  if (migrations.rows[0]?.count !== 1) {
    throw new Error("PostgreSQL migrations did not apply exactly once.");
  }
  process.stdout.write(
    "Relay PostgreSQL migrations apply twice deterministically in embedded PostgreSQL.\n",
  );
} finally {
  await postgres.close();
}
