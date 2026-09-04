import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const workspaceVariable = `$${"{workspaceFolder}"}`;

const fail = (message) => {
  throw new Error(`Relay client configuration check failed: ${message}`);
};

const readObject = (path, label) => {
  if (!existsSync(path)) fail(`${label} is missing`);
  const parsed = JSON.parse(readFileSync(path, "utf8"));
  if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
    fail(`${label} must contain a JSON object`);
  }
  return parsed;
};

const forbiddenKey = /authorization|api[_-]?key|bearer|credential|password|secret|token/i;
const inspect = (value, label, path = []) => {
  if (!value || typeof value !== "object") return;
  for (const [key, nested] of Object.entries(value)) {
    const nextPath = [...path, key];
    if (forbiddenKey.test(key) && nested !== "" && nested !== undefined && nested !== null) {
      fail(`${label} contains a credential-like value at ${nextPath.join(".")}`);
    }
    inspect(nested, label, nextPath);
  }
};

const validate = (configuration, label) => {
  const relay = configuration.servers?.relay;
  if (!relay || typeof relay !== "object" || Array.isArray(relay)) {
    fail(`${label} must define servers.relay`);
  }
  if (relay.type !== "stdio") fail(`${label} must use the stdio transport`);
  if (relay.command !== "node") fail(`${label} must use the Node executable`);
  if (
    JSON.stringify(relay.args) !==
    JSON.stringify(["./node_modules/tsx/dist/cli.mjs", "apps/mcp-server/src/stdio.ts"])
  ) {
    fail(`${label} must launch the repository-local Relay entry point`);
  }
  if (relay.cwd !== workspaceVariable) fail(`${label} cwd must be the workspace root`);
  if (relay.envFile !== `${workspaceVariable}/.env`) {
    fail(`${label} must load the ignored workspace .env file`);
  }
  inspect(configuration, label);
  return relay;
};

const portable = readObject(resolve(root, ".mcp.json"), "portable MCP configuration");
const vscode = readObject(
  resolve(root, ".vscode/mcp.json"),
  "Visual Studio Code workspace MCP configuration",
);
const portableRelay = validate(portable, "portable MCP configuration");
const vscodeRelay = validate(vscode, "Visual Studio Code workspace MCP configuration");
if (JSON.stringify(portableRelay) !== JSON.stringify(vscodeRelay)) {
  fail("portable and Visual Studio Code workspace Relay definitions must remain identical");
}

process.stdout.write(
  "Relay portable and Visual Studio Code MCP configurations match and contain no inline credential.\n",
);
