# ADR 0004: Use Visual Studio Code as the v0.3 independent MCP client

## Status

Accepted for Relay v0.3.

## Context

Relay's first proof used ChatGPT Work and Codex. The release roadmap requires a second independent
MCP client before Private Alpha so the product is demonstrably based on the protocol rather than
on behavior unique to those OpenAI surfaces.

Visual Studio Code is already installed in the development environment and implements MCP stdio
servers independently. The VS Code workspace host reads `.vscode/mcp.json`; its Agent Host also
supports a portable root `.mcp.json`.

## Decision

- Use Visual Studio Code as the independent client for v0.3 acceptance.
- Check in `.vscode/mcp.json` for native workspace discovery and a matching root `.mcp.json` for
  portable Agent Host discovery. Both launch the existing Relay stdio entry point with the
  repository-local `tsx` installation.
- Load local principal and database settings from the ignored workspace `.env`; do not place an
  identity or credential in the configuration.
- Keep Visual Studio Code provenance in the existing provider-neutral `source.surface = "other"`
  value with a human-readable label. Do not add a provider-specific enum value or tool.
- Test the exact configuration at the process and MCP protocol boundary, while reserving the
  release gate for an observed invocation from the real Visual Studio Code host.

## Consequences

- A checkout with installed dependencies can expose Relay to both Visual Studio Code execution
  paths without copying a machine-specific executable path.
- The same database and principal can be shared with other local Relay surfaces for continuity
  testing.
- Local stdio remains a trusted development path. Hosted multi-user use must continue through the
  OAuth-protected HTTP resource server.
- Visual Studio Code's one-time server trust and any agent-provider sign-in remain explicit manual
  prerequisites for the real-host acceptance run.
- The SDK-based automated test detects configuration, transport, discovery, persistence, and
  restart regressions, but cannot be presented as proof that Visual Studio Code itself made a tool
  call.

## Rejected alternatives

- Installing Claude Desktop or Cursor solely for this milestone adds another external dependency
  when a capable client is already present.
- Adding client-specific Relay tools would weaken the interoperability claim.
- Calling the automated MCP SDK harness the independent client would not exercise a separately
  implemented host and would produce misleading release evidence.
