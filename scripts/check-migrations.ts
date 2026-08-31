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
