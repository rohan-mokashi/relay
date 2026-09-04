import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseEnv } from "node:util";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  getDefaultEnvironment,
  StdioClientTransport,
} from "@modelcontextprotocol/sdk/client/stdio.js";

const workspaceRoot = resolve(import.meta.dirname, "..");
const startedAt = Date.now();
const checks = [];
const pass = (name, detail) => checks.push({ status: "PASS", name, detail });

const safeError = (caught, environment = {}) => {
  let message = caught instanceof Error ? caught.message : "Unknown diagnostic failure.";
  message = message.replaceAll(workspaceRoot, "<workspace>");
  for (const [name, value] of Object.entries(environment)) {
    if (/token|secret|password|database_url|authorization/iu.test(name) && value) {
      message = message.replaceAll(value, "<redacted>");
    }
  }
  return message;
};

let client;
let localEnvironment = {};
try {
  const nodeMajor = Number(process.versions.node.split(".")[0]);
  if (nodeMajor !== 24) throw new Error("Node.js 24 LTS is required.");
  pass("Node.js", `major version ${nodeMajor}`);

  const packageManager = process.env.npm_execpath;
  const pnpmResult = packageManager
    ? spawnSync(process.execPath, [packageManager, "--version"], {
        cwd: workspaceRoot,
        encoding: "utf8",
        shell: false,
      })
    : spawnSync(process.platform === "win32" ? "pnpm.cmd" : "pnpm", ["--version"], {
        cwd: workspaceRoot,
        encoding: "utf8",
        shell: false,
      });
  if (pnpmResult.error || pnpmResult.status !== 0) throw new Error("pnpm 11 is not available.");
  const pnpmMajor = Number(pnpmResult.stdout.trim().split(".")[0]);
  if (pnpmMajor !== 11) throw new Error("pnpm 11 is required.");
  pass("pnpm", `major version ${pnpmMajor}`);

  const environmentPath = resolve(workspaceRoot, ".env");
  if (!existsSync(environmentPath)) {
    throw new Error(".env is missing; run `node scripts/private-alpha-setup.mjs`.");
  }
  const environment = parseEnv(readFileSync(environmentPath, "utf8"));
  localEnvironment = environment;
  for (const name of [
    "RELAY_DATABASE_PATH",
    "RELAY_DEV_TOKEN",
    "RELAY_DEV_PRINCIPAL",
    "RELAY_TUNNEL_PRINCIPAL",
  ]) {
    if (!environment[name]?.trim()) throw new Error(`${name} is missing from .env.`);
  }
  const authMode = environment.RELAY_AUTH_MODE?.trim() || "dev";
  const persistence = environment.RELAY_PERSISTENCE?.trim() || "sqlite";
  if (authMode !== "dev" || persistence !== "sqlite") {
    throw new Error("The local Private Alpha quickstart requires dev auth and SQLite.");
  }
  if (environment.RELAY_DEV_PRINCIPAL !== environment.RELAY_TUNNEL_PRINCIPAL) {
    throw new Error(
      "RELAY_DEV_PRINCIPAL and RELAY_TUNNEL_PRINCIPAL must match for cross-client continuity.",
    );
  }
  pass("local configuration", "required values are present and cross-client identity matches");

  for (const script of ["scripts/check-client-configs.mjs", "scripts/check-plugin.mjs"]) {
    const result = spawnSync(process.execPath, [script], {
      cwd: workspaceRoot,
      encoding: "utf8",
      shell: false,
      env: { ...process.env },
    });
    if (result.error || result.status !== 0) {
      throw new Error(`${script} failed its configuration check.`);
    }
  }
  pass("client configuration", "portable, VS Code, and plugin metadata checks passed");

  const configuration = JSON.parse(readFileSync(resolve(workspaceRoot, ".mcp.json"), "utf8"))
    .servers.relay;
  const expectedToolNames = [
    "create_checkpoint",
    "create_handoff",
    "get_handoff",
    "get_latest_checkpoint",
    "get_project",
    "get_project_context",
    "list_project_history",
    "list_projects",
    "upsert_project",
  ];
  client = new Client({ name: "relay-private-alpha-doctor", version: "1.0.0" });
  await client.connect(
    new StdioClientTransport({
      command: configuration.command,
      args: configuration.args,
      cwd: workspaceRoot,
      env: { ...getDefaultEnvironment(), ...environment },
      stderr: "pipe",
    }),
  );
  const tools = await client.listTools();
  const observedToolNames = tools.tools.map((tool) => tool.name).sort();
  if (JSON.stringify(observedToolNames) !== JSON.stringify(expectedToolNames)) {
    throw new Error("Relay did not expose the expected nine-tool contract.");
  }
  pass("MCP discovery", "fresh stdio connection exposed exactly nine Relay tools");

  const projects = await client.callTool({ name: "list_projects", arguments: { limit: 1 } });
  if (projects.isError === true) throw new Error("Authenticated read-only Relay probe failed.");
  pass("authenticated probe", "list_projects completed without exposing stored content");

  for (const check of checks) {
    process.stdout.write(`${check.status} ${check.name}: ${check.detail}\n`);
  }
  process.stdout.write(`READY private-alpha-local (${Date.now() - startedAt} ms)\n`);
} catch (caught) {
  process.stderr.write(`FAIL ${safeError(caught, localEnvironment)}\n`);
  process.exitCode = 1;
} finally {
  if (client) {
    try {
      await client.close();
    } catch {
      // The diagnostic failure may have already closed the transport.
    }
  }
}
