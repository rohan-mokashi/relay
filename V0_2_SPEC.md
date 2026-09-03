# Relay v0.2 Production Foundation

## Release objective

Make the v0.1 continuity service safe to place behind a stable HTTPS endpoint for more than one
user without changing Relay's explicit-capsule product boundary.

v0.2 is a production foundation, not a hosted launch. It adds standards-based resource-server
authentication and a managed PostgreSQL persistence option while keeping the local SQLite and
development-token loop available for development and regression testing.

## Scope

### OAuth resource server

- Support `RELAY_AUTH_MODE=oauth` alongside the existing `dev` mode.
- Publish RFC 9728 protected-resource metadata at
  `/.well-known/oauth-protected-resource`.
- Validate bearer-token signature, issuer, audience, expiry/not-before, subject, and scopes on
  every MCP request.
- Derive a stable opaque principal reference from issuer, tenant (when configured), and subject;
  never use email or a caller-supplied identity field as authorization.
- Require `relay:read` for initialization and read tools, and both `relay:read` and `relay:write`
  for mutation tools.
- Return discoverable `WWW-Authenticate` challenges and advertise per-tool OAuth security
  schemes.
- Keep development bearer tokens explicitly development-only.

### Managed PostgreSQL persistence

- Support `RELAY_PERSISTENCE=postgres` with a TLS-capable `RELAY_DATABASE_URL`.
- Keep SQLite as the default local adapter.
- Apply ordered, deterministic PostgreSQL migrations with an advisory migration lock.
- Preserve the same tenant-isolated repository contract, immutable handoffs/checkpoints,
  append-only audit events, atomic audit/idempotency writes, and stable pagination.
- Use transactions and row/advisory locking to make ordinal allocation and idempotency safe under
  concurrency.
- Never log the database connection string.

## Non-goals

- Operating an authorization server or collecting user passwords.
- Choosing or purchasing a hosted identity or database vendor.
- Public directory submission or external deployment.
- Team invitations, billing, role-management UI, or arbitrary artifact bytes.
- Transcript scraping, memory synchronization, repository execution, or Codex control.

## Acceptance criteria

1. OAuth mode rejects unsigned, wrongly issued, wrongly targeted, expired, not-yet-valid, and
   insufficient-scope tokens.
2. Valid tokens map the same issuer/tenant/subject to one stable principal and isolate different
   subjects or tenants.
3. The protected-resource metadata and challenges contain the exact configured HTTPS resource,
   authorization server, and Relay scopes.
4. Tool descriptors advertise `relay:read` for reads and `relay:read relay:write` for mutations.
5. PostgreSQL migrations apply from zero and can be rerun without changing schema state.
6. The PostgreSQL adapter passes the existing project/handoff/checkpoint round trip, tenant
   isolation, idempotency, rollback, immutability, and pagination behaviors in a PostgreSQL test
   engine.
7. Runtime configuration fails closed when OAuth or PostgreSQL settings are incomplete or unsafe.
8. The full v0.1 verification suite remains green and committed files/logs contain no secrets.

## Deployment boundary

Passing v0.2 does not itself authorize a public deployment. A real hosted rollout still requires
an external OAuth 2.1 authorization server configured for MCP clients, a managed PostgreSQL
database with encrypted storage/backups, secret management, revocation and abuse monitoring,
operational alerts, retention/deletion policy, and a dedicated privacy/threat review.
