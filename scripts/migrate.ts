import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { loadHttpConfig } from "../apps/mcp-server/src/config.js";
import type { RelayRepository } from "../packages/domain/src/types.js";
import { PostgresRelayRepository } from "../packages/persistence-postgres/src/index.js";
import { SqliteRelayRepository } from "../packages/persistence-sqlite/src/index.js";

if (existsSync(".env")) loadEnvFile(".env");

const config = loadHttpConfig({
  ...process.env,
  ...(process.argv[2] ? { RELAY_DATABASE_PATH: process.argv[2] } : {}),
});
const repository: RelayRepository =
  config.persistence === "postgres"
    ? new PostgresRelayRepository(config.databaseUrl ?? "", {
        sslMode: config.postgresSslMode,
      })
    : new SqliteRelayRepository(config.databasePath);
try {
  await repository.migrate();
  process.stdout.write(`Relay ${config.persistence} migrations are applied.\n`);
} finally {
  await repository.close();
}
