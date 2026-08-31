# Relay plugin development package

This directory follows the current Codex plugin layout:

- `.codex-plugin/plugin.json` contains the required plugin manifest.
- `.mcp.json` configures the authenticated Relay loopback Streamable HTTP server for local Codex
  plugin testing.
- `.app.json` is intentionally absent until ChatGPT creates a real registered MCP connection.

The local MCP entry stores only `bearer_token_env_var: RELAY_DEV_TOKEN`; it contains no token. Start
Relay at `http://127.0.0.1:8787/mcp` and make the environment variable available to the Codex host
before enabling this package.

## Add the ChatGPT registered connection

Use the Secure MCP Tunnel and developer-mode steps in
[docs/setup-windows.md](../../docs/setup-windows.md). After ChatGPT creates the connection:

1. Copy the technical ID from the browser URL. It begins with `plugin_asdk_app`.
2. Create `.app.json` at this plugin root using the real ID:

   ```json
   {
     "apps": {
       "relay": {
         "id": "plugin_asdk_app_REAL_ID_FROM_CHATGPT",
         "category": "Productivity"
       }
     }
   }
   ```

3. Add `"apps": "./.app.json"` to `.codex-plugin/plugin.json`.
4. Re-run `pnpm plugin:check` and the plugin-creator validator.

Do not commit a made-up ID. The registered ID is not a credential, but it must refer to the actual
connection or the package will not resolve the server.

The package intentionally contains no skills: Relay behavior is defined by its MCP instructions,
strict tool contracts, and the root product specifications. It also contains no marketplace
catalog because local marketplace installation was not required for this proof.

Official format and registration references:

- [Package your plugin](https://developers.openai.com/plugins/build/plugins)
- [Connect and test your plugin](https://developers.openai.com/plugins/deploy/connect-chatgpt)
