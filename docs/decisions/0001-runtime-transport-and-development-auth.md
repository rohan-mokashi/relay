# ADR-001: Runtime, transport, and development authentication

- Status: Accepted
- Date: 2026-08-31

## Context

Relay needs one real local path for Codex and one supported path for ChatGPT Work without exposing
an unauthenticated server. The supplied architecture leaves exact SDK, transport, authentication,
and plugin metadata choices open pending current official documentation.

## Decision

- Use Node.js 24 LTS with strict TypeScript 7.
- Pin `@modelcontextprotocol/sdk` 1.30.0 and Zod 4.5.4.
- Expose stateful Streamable HTTP at `/mcp` for local Codex clients.
- Expose a separate stdio entry point for Secure MCP Tunnel.
- Derive HTTP principals from a server-side development bearer-token map. Compare token digests in
  constant time and authenticate every request.
- Require an explicit `RELAY_TUNNEL_PRINCIPAL` at the trusted stdio process boundary. Use it only
  for the personal proof of concept.
- Use the SDK's low-level `Server` API so Relay can validate every call itself and return the exact
  stable structured error envelope required by the contract. Tool schemas and current
  read-only/idempotent/destructive/open-world annotations remain fully advertised.
- Keep OAuth metadata and tool-level OAuth challenges absent in development because Relay does not
  implement a real authorization server. Publishing fake discovery metadata would be misleading.

## Consequences

The local HTTP and tunnel processes can share one database and stable principal while keeping the
network listener on loopback. A second bearer-token mapping proves tenant isolation. The trusted
stdio mapping does not distinguish multiple ChatGPT workspace members and therefore must not be
used as hosted or multi-user authentication.

Before publication or internet exposure, replace both development adapters with OAuth 2.1 that
implements MCP protected-resource metadata, authorization-server discovery, CIMD/DCR or a
predefined client, PKCE, issuer/audience/signature/expiry/scope validation, revocation, and
tool-level authentication challenges.

## References

- [Codex MCP](https://developers.openai.com/codex/mcp)
- [Build an MCP server](https://developers.openai.com/plugins/build/mcp-server)
- [Plugin authentication](https://developers.openai.com/plugins/build/auth)
- [Secure MCP Tunnel](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels)
