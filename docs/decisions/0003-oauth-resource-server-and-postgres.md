# ADR-0003: OAuth resource server and PostgreSQL production adapters

## Status

Accepted for Relay v0.2.

## Context

Relay v0.1 intentionally used static development credentials and SQLite. Those choices proved the
cross-surface data loop, but they cannot establish multi-user identity, token revocation, scoped
access, or managed production durability.

Current OpenAI plugin guidance requires authenticated MCP servers to follow the MCP OAuth 2.1
authorization contract: protected-resource metadata, authorization-server discovery, PKCE-capable
client registration, exact resource/audience binding, token claim validation, per-tool security
schemes, and discoverable challenges.

## Decision

Relay remains a tool-only MCP application. It becomes an OAuth resource server but does not become
an authorization server. Operators provide an external standards-conformant issuer and JWKS URI.
Relay verifies access tokens locally and maps `(issuer, tenant?, subject)` to an opaque internal
principal reference. `relay:read` protects initialization and reads; mutations additionally require
`relay:write`.

The runtime selects one persistence adapter. SQLite remains the local default. PostgreSQL is the
managed option and uses the same provider-neutral repository contract, ordered migrations,
transactions, locking, immutable record triggers, and append-only audit triggers.

## Consequences

- An operator can choose an OAuth/OIDC provider without coupling the domain model to that vendor.
- ChatGPT and Codex can discover authorization through standard metadata and challenges.
- Production persistence no longer depends on a local filesystem, while local development stays
  inexpensive.
- The application service and repository contract become asynchronous so network databases are a
  first-class implementation rather than a special case.
- v0.2 still requires external identity/database provisioning before a real hosted launch.
