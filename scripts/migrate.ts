import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnvFile } from "node:process";
import { SqliteRelayRepository } from "../packages/persistence-sqlite/src/index.js";

if (existsSync(".env")) loadEnvFile(".env");

const databasePath = resolve(
  process.argv[2] ?? process.env.RELAY_DATABASE_PATH?.trim() ?? ".data/relay.db",
);
const repository = new SqliteRelayRepository(databasePath);
try {
  repository.migrate();
  process.stdout.write("Relay SQLite migrations are applied.\n");
} finally {
  repository.close();
}
