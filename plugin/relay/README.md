# Relay plugin development package

This directory follows the current Codex plugin layout:

- `.codex-plugin/plugin.json` contains the required plugin manifest.
- `.mcp.json` configures the authenticated Relay loopback Streamable HTTP server for local Codex
  plugin testing.
- `.app.json` maps the package to the real `Relay Bootstrap` ChatGPT connection created during the
  v0.1 acceptance run.

The local MCP entry stores only `bearer_token_env_var: RELAY_DEV_TOKEN`; it contains no token. Start
Relay at `http://127.0.0.1:8787/mcp` and make the environment variable available to the Codex host
before enabling this package.

## ChatGPT registered connection

Use the Secure MCP Tunnel and developer-mode steps in
[docs/setup-windows.md](../../docs/setup-windows.md). The checked-in technical ID begins with
`plugin_asdk_app` and refers to the registered `Relay Bootstrap` connection. It is not a credential;
runtime bearer values remain outside the package. If the connection is recreated, replace only the
ID in `.app.json`, then re-run `pnpm plugin:check` and the plugin-creator validator.

The package intentionally contains no skills: Relay behavior is defined by its MCP instructions,
strict tool contracts, and the root product specifications. It also contains no marketplace
catalog because local marketplace installation was not required for this proof.

Official format and registration references:

- [Package your plugin](https://developers.openai.com/plugins/build/plugins)
- [Connect and test your plugin](https://developers.openai.com/plugins/deploy/connect-chatgpt)
