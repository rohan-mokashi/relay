import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { RelayService } from "../../../packages/domain/src/service.js";
import { SqliteRelayRepository } from "../../../packages/persistence-sqlite/src/index.js";
import { loadTunnelConfig } from "./config.js";
import { SafeLogger, principalLogId } from "./logger.js";
import { createRelayMcpServer } from "./mcp.js";

if (existsSync(".env")) loadEnvFile(".env");

let config: ReturnType<typeof loadTunnelConfig> | undefined;
try {
  config = loadTunnelConfig(process.env);
} catch (caught) {
  process.stderr.write(
    `${caught instanceof Error ? caught.message : "Invalid tunnel configuration."}\n`,
  );
  process.exitCode = 1;
}

if (config) {
  const repository = new SqliteRelayRepository(config.databasePath);
  await repository.migrate();
  const logger = new SafeLogger();
  const service = new RelayService(repository);
  const server = createRelayMcpServer(service, config.principalRef, (event) => {
    logger.log({
      level: event.status === "ok" ? "info" : "warn",
      event: "tool.call",
      requestId: event.requestId,
      toolName: event.toolName,
      principalId: principalLogId(config.principalRef),
      status: event.status,
      durationMs: event.durationMs,
      errorCode: event.errorCode,
    });
  });
  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.log({ level: "info", event: "stdio.started", status: "ok" });

  const shutdown = async () => {
    await server.close();
    await repository.close();
    process.exitCode = 0;
  };
  process.once("SIGINT", () => void shutdown());
  process.once("SIGTERM", () => void shutdown());
}
