# Connect Relay to Visual Studio Code

This is the local v0.3 independent-client path. It uses Visual Studio Code's standard MCP stdio
support and the portable root `.mcp.json`; no Relay-specific extension is required.

## Prepare the checkout

From the Relay repository root in PowerShell:

```powershell
pnpm install --frozen-lockfile
Copy-Item .env.example .env
```

In the ignored `.env`, set:

```dotenv
RELAY_DATABASE_PATH=.data/relay.db
RELAY_TUNNEL_PRINCIPAL=your-stable-local-principal
```

Use the same absolute database path and principal as the other local Relay clients when proving
cross-client continuity. Do not place an API key, bearer token, password, or authorization header
in `.mcp.json` or a Relay capsule.

Check the configuration and server process before opening the client:

```powershell
pnpm clients:check
pnpm test:e2e -- stdio-client
```

## Start from Visual Studio Code

1. Open the Relay repository folder in Visual Studio Code.
2. Run `MCP: List Servers` from the Command Palette.
3. Select `relay`, choose **Start Server**, and review the one-time trust prompt. Trust it only if
   the command matches the checked-in root `.mcp.json`.
4. Open Chat, switch to Agent mode, select tools, and confirm all nine Relay tools are available.
5. Run the acceptance prompts in
   [v0.3-interoperability-acceptance.md](v0.3-interoperability-acceptance.md).

Use `MCP: List Servers` to inspect output or restart the server. If Relay reports that
`RELAY_TUNNEL_PRINCIPAL` is missing, confirm that the repository root is the open workspace and
that `.env` contains the non-secret local principal setting.

The real-host run is required for v0.3. Passing the automated stdio test alone is not sufficient.

## Official client references

- [Visual Studio Code MCP configuration reference](https://code.visualstudio.com/docs/agents/reference/mcp-configuration)
- [Add and manage MCP servers in Visual Studio Code](https://code.visualstudio.com/docs/agent-customization/mcp-servers)
- [Visual Studio Code MCP developer guide](https://code.visualstudio.com/api/extension-guides/ai/mcp)
