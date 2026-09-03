import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { QueryResultRow } from "pg";

const sourceMigrationDirectory = fileURLToPath(new URL("../migrations", import.meta.url));

export interface PostgresMigrationOptions {
  migrationDirectory?: string;
  advisoryLock?: boolean;
  skipIntegrityTriggers?: boolean;
}

export interface PostgresMigrationClient {
  query<Row extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: unknown[],
  ): Promise<{ rows: Row[]; rowCount: number | null }>;
}

export const resolvePostgresMigrationDirectory = (configured?: string): string => {
  const candidates = [
    configured,
    sourceMigrationDirectory,
    resolve(process.cwd(), "packages/persistence-postgres/migrations"),
  ].filter((value): value is string => Boolean(value));
  const selected = candidates.find((candidate) => existsSync(candidate));
  if (!selected) throw new Error("Relay PostgreSQL migrations directory was not found.");
  return selected;
};

const withoutIntegrityTriggers = (sql: string): string =>
  sql.replace(/-- relay:integrity-triggers:start[\s\S]*?-- relay:integrity-triggers:end/g, "");

export const applyPostgresMigrations = async (
  client: PostgresMigrationClient,
  options: PostgresMigrationOptions = {},
): Promise<void> => {
  await client.query("BEGIN");
  try {
    if (options.advisoryLock !== false) {
      await client.query("SELECT pg_advisory_xact_lock($1)", [7_036_529_302]);
    }
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version TEXT PRIMARY KEY,
        checksum TEXT NOT NULL,
        applied_at TEXT NOT NULL
      )
    `);

    const directory = resolvePostgresMigrationDirectory(options.migrationDirectory);
    const files = readdirSync(directory)
      .filter((file) => /^\d+_.+\.sql$/.test(file))
      .sort((left, right) => left.localeCompare(right));

    for (const file of files) {
      const rawSql = readFileSync(resolve(directory, file), "utf8");
      const checksum = createHash("sha256").update(rawSql).digest("hex");
      const existing = await client.query<{ checksum: string }>(
        "SELECT checksum FROM schema_migrations WHERE version = $1",
        [file],
      );
      if (existing.rowCount) {
        if (existing.rows[0]?.checksum !== checksum) {
          throw new Error(`Applied PostgreSQL migration ${file} does not match its checksum.`);
        }
        continue;
      }
      await client.query(options.skipIntegrityTriggers ? withoutIntegrityTriggers(rawSql) : rawSql);
      await client.query(
        "INSERT INTO schema_migrations (version, checksum, applied_at) VALUES ($1, $2, $3)",
        [file, checksum, new Date().toISOString()],
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
};
