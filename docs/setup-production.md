# Production-foundation setup

Relay v0.2 can run as an OAuth-protected MCP resource server backed by managed PostgreSQL. This
runbook configures software that an operator has already provisioned; it does not create a hosted
identity provider, database, DNS name, certificate, or deployment.

The authentication contract follows OpenAI's current
[plugin OAuth guidance](https://developers.openai.com/plugins/build/auth).

## External prerequisites

- A stable HTTPS Relay origin whose public MCP resource URL is known in advance.
- An OAuth 2.1-compatible authorization server that supports authorization-server metadata,
  PKCE-capable clients, the Relay resource/audience, and the `relay:read` and `relay:write` scopes.
- A JWKS endpoint containing the public signing keys for Relay access tokens.
- A managed PostgreSQL database with TLS, encrypted storage and backups, credential rotation, and
  a network policy that permits only the Relay runtime.
- A secret manager for the PostgreSQL URL and any provider-side credentials. Relay needs no OAuth
  client secret to validate signed access tokens.

## Runtime configuration

Set these in the deployment platform's secret/configuration system. Do not commit a production
`.env` file.

```text
RELAY_HOST=0.0.0.0
RELAY_PORT=8787
RELAY_AUTH_MODE=oauth
RELAY_OAUTH_ISSUER=https://identity.example.com/
RELAY_OAUTH_RESOURCE=https://relay.example.com/mcp
RELAY_OAUTH_JWKS_URI=https://identity.example.com/.well-known/jwks.json
RELAY_OAUTH_TENANT_CLAIM=tenant_id
RELAY_OAUTH_DOCUMENTATION_URL=https://relay.example.com/docs
RELAY_PERSISTENCE=postgres
RELAY_DATABASE_URL=<load-from-secret-manager>
RELAY_POSTGRES_SSL_MODE=verify-full
RELAY_RATE_LIMIT_PER_MINUTE=120
```

`RELAY_OAUTH_TENANT_CLAIM` is optional. Configure it when one authorization server can issue the
same subject identifier in multiple tenants. Relay hashes issuer, optional tenant, and subject to
derive its internal principal; email and caller-supplied identity fields are never authorization
inputs.

`verify-full` is the production PostgreSQL TLS default. `require` encrypts the connection without
verifying the server certificate and should be limited to providers whose documented connector
requires that behavior. `disable` is for isolated local testing only.

## Migrate, start, and probe

Install from a locked dependency graph, apply migrations as a one-off release step, and then start
the same build:

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm migrate
pnpm start
```

The migration runner takes a transaction-scoped PostgreSQL advisory lock, records a SHA-256
checksum for each ordered migration, and fails if an already-applied migration was edited.

The following endpoint is intentionally public so MCP clients can discover authorization:

```text
GET https://relay.example.com/.well-known/oauth-protected-resource
```

It must return the configured resource, authorization-server issuer, and both Relay scopes. The
`/mcp` and `/healthz` endpoints require a valid access token. A safe readiness probe can check the
process or TCP listener; an authenticated health probe must obtain a short-lived token through the
operator's normal machine-to-machine policy.

## Token contract

Relay accepts signed JWT access tokens only when all of these hold:

- the signature matches a current key from `RELAY_OAUTH_JWKS_URI` and uses an allowed asymmetric
  algorithm;
- `iss` exactly matches `RELAY_OAUTH_ISSUER`;
- `aud` contains the exact `RELAY_OAUTH_RESOURCE` value;
- `exp` is present and current, `nbf` is current when present, and `sub` is non-empty;
- the configured tenant claim is a non-empty string when enabled;
- `scope` grants `relay:read`, plus `relay:write` for mutations.

The authorization server—not Relay—owns login, consent, refresh tokens, client registration,
revocation, and PKCE enforcement.

## Release and operations gates

Before exposing the service to users:

1. Run `pnpm verify` on the exact release commit.
2. Test authorization-server discovery and a complete MCP OAuth login with the intended client.
3. Confirm cross-user and cross-tenant isolation with real provider tokens.
4. Confirm database backup restoration, credential rotation, migration rollback procedure, and
   deletion/retention policy.
5. Add distributed rate limiting, revocation/abuse monitoring, security alerts, and redacted log
   export appropriate to the deployment topology.
6. Perform privacy, threat-model, load, and concurrency reviews against the hosted environment.

Relay intentionally fails closed when required OAuth or PostgreSQL settings are missing. It never
logs the database URL, bearer token, or stored capsule body.
