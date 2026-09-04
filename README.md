# Relay Private Alpha candidate

Relay is a local-first MCP service for explicit, auditable project-context handoffs between
ChatGPT Work and Codex. It stores only the structured project capsule a caller deliberately
submits. It does not read chats, synchronize private memories, control Codex, run repository
commands, or fetch artifact URLs.

The v0.1 local continuity proof, v0.2 production foundation, and v0.3 independent-client gate are
complete. This `0.4.0-alpha.1` candidate adds reproducible onboarding, diagnostics, packaging,
aggregate-only study metrics, and operator/support gates without changing the nine-tool product
contract. It does not provision hosted infrastructure or put workflow orchestration inside Relay.

## Architecture

| Boundary | Implementation |
| --- | --- |
| External contract | Strict Zod schemas shared by all nine MCP tools |
| MCP transport | Stateful Streamable HTTP at `/mcp`; trusted stdio adapter for Secure MCP Tunnel |
| Identity | OAuth JWT resource server with issuer/audience/scope validation; development-token and trusted-stdio adapters remain local-only |
| Domain | Provider-neutral Relay service and repository interface |
| Persistence | Local SQLite or managed PostgreSQL; ordered migrations, immutable records, append-only audit events |
| Reliability | Atomic domain/audit/idempotency transactions and deterministic pagination |
| Observability | JSON logs containing only allowlisted metadata; no tokens or capsule bodies |

The HTTP server binds to `127.0.0.1` by default and authenticates every operational endpoint,
including `/healthz`. OAuth mode additionally exposes the public RFC 9728 protected-resource
metadata endpoint. The stdio adapter refuses to start without `RELAY_TUNNEL_PRINCIPAL`.

## Required MCP tools

Relay implements:

- `upsert_project`
- `list_projects`
- `get_project`
- `create_handoff`
- `get_handoff`
- `create_checkpoint`
- `get_latest_checkpoint`
- `get_project_context`
- `list_project_history`

Mutation descriptions identify durable writes, responses summarize rather than echo submitted
bodies, and every project or record lookup is scoped to the authenticated principal.

## Quick start

Use Node.js 24 and pnpm 11. On Windows, follow
[docs/setup-windows.md](docs/setup-windows.md). A secondary POSIX path is in
[docs/setup-posix.md](docs/setup-posix.md).

The clean-checkout verification path is:

```powershell
pnpm install --frozen-lockfile
pnpm verify
```

The verifier runs lint, formatting, strict type checking, the production build, deterministic
migration checks, portable-client and plugin metadata checks, all test projects, repository secret
scanning, the Private Alpha readiness check, and the dependency audit.

For a Private Alpha checkout or release bundle, the one-command local setup is:

```powershell
node scripts/private-alpha-setup.mjs
```

It installs the locked dependency graph, creates an ignored random local credential only when
`.env` is absent, migrates the local database, and runs a redacted MCP diagnostic. Continue with
[docs/private-alpha/tester-quickstart.md](docs/private-alpha/tester-quickstart.md). Operators start
with [docs/private-alpha/operator-runbook.md](docs/private-alpha/operator-runbook.md).

## Development integration paths

- Codex: connect directly to the authenticated loopback Streamable HTTP server. See
  [docs/setup-windows.md](docs/setup-windows.md#connect-codex).
- ChatGPT Work: use Secure MCP Tunnel with the trusted stdio entry point. The Windows runbook
  includes a checksum-verifying, repository-local installer for the public tunnel client. See
  [docs/setup-windows.md](docs/setup-windows.md#connect-chatgpt-work-through-secure-mcp-tunnel).
- Visual Studio Code: open the repository and use `.vscode/mcp.json`; the matching root
  `.mcp.json` supports the portable Agent Host path. Follow
  [docs/setup-vscode.md](docs/setup-vscode.md). The observed real-host procedure in
  [docs/v0.3-interoperability-acceptance.md](docs/v0.3-interoperability-acceptance.md) is the v0.3
  release gate; current evidence is tracked in
  [docs/v0.3-acceptance-record.md](docs/v0.3-acceptance-record.md).
- Plugin package: the current local package is in [plugin/relay](plugin/relay). Registration and
  the real non-secret `.app.json` connection mapping are explained in
  [plugin/relay/README.md](plugin/relay/README.md).
- Hosted foundation: configure an external OAuth 2.1 authorization server and managed PostgreSQL
  using [docs/setup-production.md](docs/setup-production.md).

The manual three-surface proof is in
[docs/manual-acceptance.md](docs/manual-acceptance.md).

## Security boundary

Static bearer tokens and the trusted stdio principal are development-only mechanisms. OAuth mode
is a resource server, not an authorization server: the operator remains responsible for identity
provider policy, client registration/PKCE, revocation, managed database encryption and backups,
distributed abuse controls, and a dedicated privacy review. See
[docs/threat-model.md](docs/threat-model.md) and the accepted ADRs under
[docs/decisions](docs/decisions).

## Authoritative specifications

The supplied root specifications remain the product authority. Start with
[START_HERE.md](START_HERE.md) and follow the read order in [AGENTS.md](AGENTS.md).

The current milestone is [PRIVATE_ALPHA_SPEC.md](PRIVATE_ALPHA_SPEC.md). Private Alpha entry is a
repository readiness gate; actual alpha exit and any Public Beta work remain blocked until the
10–20-person study meets the recorded value, safety, and repeat-usage thresholds.
