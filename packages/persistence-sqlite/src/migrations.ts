import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

const sourceMigrationDirectory = fileURLToPath(new URL("../migrations", import.meta.url));

export const resolveMigrationDirectory = (configured?: string): string => {
  const candidates = [
    configured,
    sourceMigrationDirectory,
    resolve(process.cwd(), "packages/persistence-sqlite/migrations"),
  ].filter((value): value is string => Boolean(value));

  const selected = candidates.find((candidate) => existsSync(candidate));
  if (!selected) throw new Error("Relay SQLite migrations directory was not found.");
  return selected;
};

export const applyMigrations = (database: DatabaseSync, migrationDirectory?: string): void => {
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    )
  `);

  const directory = resolveMigrationDirectory(migrationDirectory);
  const files = readdirSync(directory)
    .filter((file) => /^\d+_.+\.sql$/.test(file))
    .sort((left, right) => left.localeCompare(right));

  for (const file of files) {
    const alreadyApplied = database
      .prepare("SELECT 1 FROM schema_migrations WHERE version = ?")
      .get(file);
    if (alreadyApplied) continue;

    const sql = readFileSync(resolve(directory, file), "utf8");
    database.exec("BEGIN IMMEDIATE");
    try {
      database.exec(sql);
      database
        .prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)")
        .run(file, new Date().toISOString());
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
  }
};
