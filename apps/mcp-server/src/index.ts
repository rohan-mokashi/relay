import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { pathToFileURL } from "node:url";
import { RelayService } from "../../../packages/domain/src/service.js";
import type { RelayRepository } from "../../../packages/domain/src/types.js";
import { PostgresRelayRepository } from "../../../packages/persistence-postgres/src/index.js";
import { SqliteRelayRepository } from "../../../packages/persistence-sqlite/src/index.js";
import { createAuthenticator } from "./auth.js";
import { loadHttpConfig } from "./config.js";
import { createRelayHttpServer } from "./http.js";
import { SafeLogger } from "./logger.js";
import { PrincipalRateLimiter } from "./rate-limit.js";

export const startRelayHttpFromEnvironment = async (environment = process.env) => {
  if (existsSync(".env")) loadEnvFile(".env");
  const config = loadHttpConfig(environment);
  const logger = new SafeLogger();
  const repository: RelayRepository =
    config.persistence === "postgres"
      ? new PostgresRelayRepository(config.databaseUrl ?? "", {
          sslMode: config.postgresSslMode,
        })
      : new SqliteRelayRepository(config.databasePath);
  await repository.migrate();
  const service = new RelayService(repository);
  const authenticator = createAuthenticator(environment, config.oauth);
  const relay = createRelayHttpServer({
    service,
    authenticator,
    logger,
    requestByteLimit: config.requestByteLimit,
    rateLimiter: new PrincipalRateLimiter(config.rateLimitPerMinute),
  });
  const address = await relay.listen(config.port, config.host);
  logger.log({ level: "info", event: "server.started", status: "ok" });

  const close = async () => {
    await relay.close();
    await repository.close();
  };
  return { ...address, relay, repository, close };
};

const isEntryPoint = process.argv[1]
  ? import.meta.url === pathToFileURL(process.argv[1]).href
  : false;

if (isEntryPoint) {
  try {
    const running = await startRelayHttpFromEnvironment();
    process.stderr.write(`Relay MCP listening on ${running.url}\n`);
    const shutdown = async () => {
      await running.close();
      process.exitCode = 0;
    };
    process.once("SIGINT", () => void shutdown());
    process.once("SIGTERM", () => void shutdown());
  } catch {
    process.stderr.write(
      "Relay failed to start. Check the documented environment configuration.\n",
    );
    process.exitCode = 1;
  }
}
