# Windows setup and local runbook

This runbook uses the supported local topology for Relay v0.1:

- Codex connects to Relay over authenticated loopback Streamable HTTP.
- ChatGPT Work connects through Secure MCP Tunnel to Relay's stdio adapter.
- Both adapters use the same absolute SQLite path and the same development principal.

That final point is what makes the handoff visible on both surfaces. It is suitable only for the
single-user proof of concept.

## Prerequisites

- Windows PowerShell 7 or Windows PowerShell 5.1.
- Node.js 24 LTS.
- pnpm 11.
- Codex CLI or the ChatGPT desktop app for the Codex-side connection.
- For the ChatGPT Work leg: a runtime API key, a `tunnel_id`, Tunnels Read + Use, association to
  the target ChatGPT workspace, and ChatGPT developer-mode access. The repository can install the
  public `tunnel-client` release locally as described below.

Official references:

- [Codex MCP configuration](https://developers.openai.com/codex/mcp)
- [Secure MCP Tunnel](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels)
- [Connect and test a plugin](https://developers.openai.com/plugins/deploy/connect-chatgpt)

## Install and verify

From the repository root:

```powershell
Set-Location 'C:\path\to\relay'
node --version
pnpm --version
pnpm install --frozen-lockfile
pnpm verify
```

`pnpm verify` is the release gate. Run individual checks with `pnpm test:unit`,
`pnpm test:integration`, `pnpm test:contract`, `pnpm test:security`, or `pnpm test:e2e` while
developing.

## Create local development configuration

The following creates a random 32-byte token and writes an ignored `.env` file without printing
the token. Do not commit `.env` or copy its contents into a chat.

```powershell
$relayRepo = (Resolve-Path '.').Path
$relayDatabase = (Join-Path $relayRepo '.data\relay.db').Replace('\', '/')
$relayTokenBytes = New-Object byte[] 32
$relayRandom = [System.Security.Cryptography.RandomNumberGenerator]::Create()
$relayRandom.GetBytes($relayTokenBytes)
$relayRandom.Dispose()
$relayToken = [Convert]::ToBase64String($relayTokenBytes)
$relayPrincipal = 'relay-local-user'
$relaySettings = @(
  'RELAY_HOST=127.0.0.1'
  'RELAY_PORT=8787'
  "RELAY_DATABASE_PATH=$relayDatabase"
  "RELAY_DEV_TOKEN=$relayToken"
  "RELAY_DEV_PRINCIPAL=$relayPrincipal"
  'RELAY_DEV_TOKENS_JSON='
  "RELAY_TUNNEL_PRINCIPAL=$relayPrincipal"
  'RELAY_RATE_LIMIT_PER_MINUTE=120'
)
[System.IO.File]::WriteAllLines((Join-Path $relayRepo '.env'), $relaySettings)
$env:RELAY_DEV_TOKEN = $relayToken
Remove-Variable relayTokenBytes
```

`.env` is loaded by Relay. Codex needs `RELAY_DEV_TOKEN` in its own process environment because
its saved MCP configuration stores only the variable name, never the value. If you open a fresh
PowerShell session, load the ignored value without printing it:

```powershell
$relayTokenLine = Get-Content '.env' | Where-Object { $_ -like 'RELAY_DEV_TOKEN=*' } | Select-Object -First 1
$env:RELAY_DEV_TOKEN = $relayTokenLine.Substring('RELAY_DEV_TOKEN='.Length)
Remove-Variable relayTokenLine
```

For two test principals, use `RELAY_DEV_TOKENS_JSON` as a JSON object whose keys are random tokens
and whose values are stable principal labels. Keep that JSON only in the environment or ignored
`.env` file.

## Start Relay HTTP

In terminal A:

```powershell
Set-Location 'C:\path\to\relay'
pnpm migrate
pnpm start:http
```

Relay reports `http://127.0.0.1:8787/mcp`. In another shell with `$env:RELAY_DEV_TOKEN` loaded,
verify the authenticated health endpoint:

```powershell
$relayHeaders = @{ Authorization = "Bearer $env:RELAY_DEV_TOKEN" }
Invoke-RestMethod -Uri 'http://127.0.0.1:8787/healthz' -Headers $relayHeaders
```

Do not change `RELAY_HOST` to a public interface for this development auth mode.

## Connect Codex

The current Codex CLI supports Streamable HTTP plus a bearer-token environment-variable
reference. In terminal B, with `RELAY_DEV_TOKEN` set:

```powershell
codex mcp add relay --url 'http://127.0.0.1:8787/mcp' --bearer-token-env-var RELAY_DEV_TOKEN
codex mcp list
```

Then launch Codex from the same environment, or configure the same server in the ChatGPT desktop
app under **Settings → MCP servers**, select **Streamable HTTP**, enter the `/mcp` URL, save, and
restart. Use `/mcp` in Codex to inspect the connection.

The local plugin companion file at `plugin/relay/.mcp.json` encodes the same endpoint and token
variable for plugin-based Codex testing.

## Connect ChatGPT Work through Secure MCP Tunnel

This step requires external credentials and workspace authorization. The helper below follows the
official latest-release path, selects the current Windows architecture, verifies the
release-provided SHA-256 digest before extraction, and installs only under the ignored `.tools`
directory. It does not alter global `PATH`:

```powershell
$relayTunnelClient = & '.\scripts\install-tunnel-client.ps1' -PassThru
& $relayTunnelClient help quickstart
```

From the repository root, use a secure prompt for the runtime API key and enter the real tunnel
ID supplied by Platform:

```powershell
$relayRepo = (Resolve-Path '.').Path
$relayTunnelId = Read-Host 'Tunnel ID'
$relaySecureApiKey = Read-Host 'Tunnel runtime API key' -AsSecureString
$relayCredential = [System.Management.Automation.PSCredential]::new('relay', $relaySecureApiKey)
$env:CONTROL_PLANE_API_KEY = $relayCredential.GetNetworkCredential().Password
$relayRepoForCommand = $relayRepo.Replace('\', '/')
$relayMcpCommand = 'pnpm --dir "' + $relayRepoForCommand + '" start:stdio'
$relayProfileDir = Join-Path $relayRepo '.tools\tunnel-client-profiles'
$relayHealthUrlFile = Join-Path $relayProfileDir 'relay-local-stdio-health.url'

& $relayTunnelClient init --sample sample_mcp_stdio_local --profile relay-local-stdio --profile-dir $relayProfileDir --tunnel-id $relayTunnelId --mcp-command $relayMcpCommand --health-listen-addr '127.0.0.1:0'
& $relayTunnelClient doctor --profile relay-local-stdio --profile-dir $relayProfileDir --explain
& $relayTunnelClient run --profile relay-local-stdio --profile-dir $relayProfileDir --health.url-file $relayHealthUrlFile
```

Keep terminal C running. The stdio process loads the same `.env`; therefore
`RELAY_TUNNEL_PRINCIPAL` must exactly equal `RELAY_DEV_PRINCIPAL`, and
`RELAY_DATABASE_PATH` must be the same absolute file used by the HTTP server.
The profile and resolved health URL stay under the repository's ignored `.tools` directory; the
runtime key remains only in `CONTROL_PLANE_API_KEY`.

In ChatGPT:

1. Open **Settings → Security and login** and enable **Developer mode**.
2. Open [ChatGPT Plugins](https://chatgpt.com/admin/plugins), select the plus button, and enter a
   user-facing Relay name and description.
3. Under **Connection**, select **Tunnel** and choose the associated tunnel or paste its
   `tunnel_id`.
4. Create the connection and review the nine discovered tools, schemas, and annotations.
5. Add the Relay connection from the tools menu in a new Work conversation.

If the tunnel is absent, verify that it is associated with the target ChatGPT workspace—not just
the Platform organization—and that the operator has Tunnels Read + Use. Re-run `doctor` and keep
`tunnel-client run` healthy during discovery and calls.

After ChatGPT creates the connection, follow [plugin/relay/README.md](../plugin/relay/README.md)
to add the real `plugin_asdk_app...` mapping. Relay intentionally does not contain a placeholder
mapping.

## Rotation and revocation

- Generate a new random token, update `.env`, set the new value in the Codex host environment,
  and restart Relay and Codex.
- Revoke a token by removing its mapping (or replacing the single token) and restarting Relay.
- Revoke tunnel access in Platform, rotate the tunnel runtime key, and stop `tunnel-client`.
- Delete `.data/relay.db` only when intentionally discarding all local Relay state. The database
  and its WAL files are ignored by Git.

## Stop and clean up

Stop the HTTP server and tunnel with Ctrl+C. Remove the Codex configuration when no longer needed:

```powershell
codex mcp remove relay
Remove-Item Env:RELAY_DEV_TOKEN -ErrorAction SilentlyContinue
Remove-Item Env:CONTROL_PLANE_API_KEY -ErrorAction SilentlyContinue
```

Those commands remove configuration/process variables; they do not delete Relay records.
