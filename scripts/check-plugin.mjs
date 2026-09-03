import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const pluginRoot = resolve(root, "plugin/relay");
const manifestPath = resolve(pluginRoot, ".codex-plugin/plugin.json");
const mcpPath = resolve(pluginRoot, ".mcp.json");
const appPath = resolve(pluginRoot, ".app.json");
const packagePath = resolve(root, "package.json");

const fail = (message) => {
  throw new Error(`Relay plugin check failed: ${message}`);
};

const readObject = (path, label) => {
  if (!existsSync(path)) fail(`${label} is missing`);
  const parsed = JSON.parse(readFileSync(path, "utf8"));
  if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
    fail(`${label} must contain a JSON object`);
  }
  return parsed;
};

const manifest = readObject(manifestPath, "plugin manifest");
const packageMetadata = readObject(packagePath, "package metadata");
if (manifest.name !== "relay" || manifest.version !== packageMetadata.version) {
  fail("plugin identity or version is unexpected");
}
if (manifest.skills !== undefined) fail("manifest references an unbundled skills directory");
if (manifest.apps !== "./.app.json") fail("manifest must reference ./.app.json");
if (manifest.mcpServers !== "./.mcp.json") fail("manifest must reference ./.mcp.json");
if (!manifest.interface || !Array.isArray(manifest.interface.capabilities)) {
  fail("manifest interface capabilities are missing");
}

const mcp = readObject(mcpPath, "MCP companion manifest");
const relay = mcp.mcpServers?.relay;
if (relay?.url !== "http://127.0.0.1:8787/mcp") {
  fail("local MCP server must use the documented loopback endpoint");
}
if (relay.bearer_token_env_var !== "RELAY_DEV_TOKEN") {
  fail("local MCP server must obtain its bearer token from RELAY_DEV_TOKEN");
}
if (JSON.stringify(mcp).includes("Authorization")) {
  fail("MCP companion manifest must not contain an authorization value");
}

const app = readObject(appPath, "ChatGPT app mapping");
const relayApp = app.apps?.relay;
if (!/^plugin_asdk_app_[a-z0-9]+$/.test(relayApp?.id ?? "")) {
  fail("ChatGPT app mapping must use a real plugin_asdk_app technical ID");
}
if (relayApp.category !== "Productivity") {
  fail("ChatGPT app mapping category must match the plugin interface");
}

process.stdout.write(
  "Relay plugin metadata is internally consistent and contains no inline token.\n",
);
