# POSIX setup

The Windows runbook is canonical. This lower-cost path covers macOS and Linux shells.

## Install and verify

Use Node.js 24 and pnpm 11:

```sh
cd /path/to/relay
pnpm install --frozen-lockfile
pnpm verify
```

## Configure and run

Generate a development token without printing it, use one stable principal for both adapters, and
keep the database path absolute:

```sh
export RELAY_HOST=127.0.0.1
export RELAY_PORT=8787
export RELAY_DATABASE_PATH="$PWD/.data/relay.db"
export RELAY_DEV_TOKEN="$(node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('base64'))")"
export RELAY_DEV_PRINCIPAL=relay-local-user
export RELAY_TUNNEL_PRINCIPAL=relay-local-user
export RELAY_RATE_LIMIT_PER_MINUTE=120

pnpm migrate
pnpm start:http
```

In a shell that has the same token:

```sh
codex mcp add relay --url http://127.0.0.1:8787/mcp --bearer-token-env-var RELAY_DEV_TOKEN
codex mcp list
```

For ChatGPT Work, obtain the required tunnel ID, runtime API key, workspace association, and
permissions first. Then follow the current
[Secure MCP Tunnel guide](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels):

```sh
export CONTROL_PLANE_API_KEY='<load-from-your-secret-manager>'
export RELAY_TUNNEL_PROFILE_DIR="$PWD/.tools/tunnel-client-profiles"
export RELAY_TUNNEL_HEALTH_URL_FILE="$RELAY_TUNNEL_PROFILE_DIR/relay-local-stdio-health.url"
tunnel-client help quickstart
tunnel-client init \
  --sample sample_mcp_stdio_local \
  --profile relay-local-stdio \
  --profile-dir "$RELAY_TUNNEL_PROFILE_DIR" \
  --tunnel-id '<your-tunnel-id>' \
  --mcp-command "pnpm --dir '$PWD' start:stdio" \
  --health-listen-addr '127.0.0.1:0'
tunnel-client doctor \
  --profile relay-local-stdio \
  --profile-dir "$RELAY_TUNNEL_PROFILE_DIR" \
  --explain
tunnel-client run \
  --profile relay-local-stdio \
  --profile-dir "$RELAY_TUNNEL_PROFILE_DIR" \
  --health.url-file "$RELAY_TUNNEL_HEALTH_URL_FILE"
```

Keep the tunnel running and use the ChatGPT developer-mode steps in the
[Windows runbook](setup-windows.md#connect-chatgpt-work-through-secure-mcp-tunnel). Environment
variables are development secrets; do not commit them or paste them into Relay capsules. The
profile and resolved health URL stay under the repository's ignored `.tools` directory.
