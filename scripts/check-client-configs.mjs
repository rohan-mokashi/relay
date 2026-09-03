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

const portable = readObject(resolve(root, ".mcp.json"), "portable MCP configuration");
const relay = portable.servers?.relay;
if (!relay || typeof relay !== "object" || Array.isArray(relay)) {
  fail("portable configuration must define servers.relay");
}
if (relay.type !== "stdio") fail("Visual Studio Code must use the stdio transport");
if (relay.command !== "node") fail("portable stdio launch must use the Node executable");
if (
  JSON.stringify(relay.args) !==
  JSON.stringify(["./node_modules/tsx/dist/cli.mjs", "apps/mcp-server/src/stdio.ts"])
) {
  fail("portable stdio arguments must launch the repository-local Relay entry point");
}
if (relay.cwd !== workspaceVariable) fail("portable stdio cwd must be the workspace root");
if (relay.envFile !== `${workspaceVariable}/.env`) {
  fail("portable stdio environment must come from the ignored workspace .env file");
}

const forbiddenKey = /authorization|api[_-]?key|bearer|credential|password|secret|token/i;
const inspect = (value, path = []) => {
  if (!value || typeof value !== "object") return;
  for (const [key, nested] of Object.entries(value)) {
    const nextPath = [...path, key];
    if (forbiddenKey.test(key) && nested !== "" && nested !== undefined && nested !== null) {
      fail(`portable configuration contains a credential-like value at ${nextPath.join(".")}`);
    }
    inspect(nested, nextPath);
  }
};
inspect(portable);

process.stdout.write(
  "Relay portable MCP configuration is internally consistent and contains no inline credential.\n",
);
