# Relay v0.2 threat model

## Assets and trust boundaries

Relay protects structured project text, record identifiers, artifact metadata, authentication
credentials, and audit history. Its boundaries are the MCP caller, HTTP/tunnel transport,
authentication adapter, per-principal repository scope, SQLite or PostgreSQL persistence, and
logs.

Stored project text is untrusted data. It can be returned to a model but cannot alter server
authorization, tool registration, SQL, logging policy, or transport behavior.

## Threats and controls

| Threat | v0.2 control | Evidence |
| --- | --- | --- |
| Missing or forged identity | OAuth JWT signature, issuer, audience, lifetime, subject, optional tenant, and scope checks; development HTTP bearer authentication; stdio refuses an unset trusted principal | OAuth unit/HTTP security tests; development credential tests; stdio startup behavior |
| OAuth downgrade or confused deputy | OAuth mode accepts only asymmetric algorithms, binds `aud` to the exact resource, publishes protected-resource metadata, and returns discoverable challenges | OAuth authentication and HTTP security tests |
| Excess token privilege | Read scope is required for all MCP traffic; mutation tools require read and write scopes, including JSON-RPC batches; descriptors advertise the same requirements | HTTP security and tool-contract tests |
| Caller-supplied identity spoofing | Tool schemas reject unknown identity fields; principal comes only from transport context | Contract and security tests |
| Cross-principal discovery or ID access | Principal-scoped repository methods and membership joins for list, project, record, artifact, and history queries | Security and domain tests |
| Duplicate writes/retries | Principal/tool/key idempotency record with canonical payload hash in the same transaction | Integration and end-to-end tests |
| Partial write or missing audit | SQLite and PostgreSQL transactions include domain state, audit, and idempotency result | Injected audit-failure rollback tests for both adapters |
| Mutation of history | Append-only tables, locked version/sequence allocation, and immutable database triggers | Domain and SQLite/PostgreSQL persistence tests |
| Migration race or drift | PostgreSQL advisory migration lock plus recorded migration checksums; SQLite ordered migrations | Migration verification and PostgreSQL integration tests |
| Injection in stored text | Text remains labeled structured data; SQL uses parameters; no dynamic execution path exists | Injection, SQL-metacharacter, and tool-boundary tests |
| Secret leakage | Practical input rejection, allowlisted JSON logging, ignored environment/database files, deterministic secret scan | Contract, log-redaction, and secret-scan tests |
| SSRF through artifacts | URLs are stored as inert metadata and never fetched | Sentinel HTTP security test |
| Path traversal | Repository paths and `repo://` artifacts require normalized relative POSIX paths | Contract and security tests |
| Resource exhaustion | Bounded strings/arrays/pages, request byte limit, per-principal rate limiter | Contract and security tests |
| Stack/database disclosure | Stable error codes and generic client messages; no raw error, SQL, path, request, or response logging | Contract and security tests |

## Deliberate exclusions

Relay has no tool for arbitrary shell execution, filesystem writes, Git mutation, Codex control,
chat scraping, private-memory access, session-cookie use, full-transcript import, or artifact URL
fetching. Unsupported requests must be answered as unavailable by the client; the server cannot
silently improvise those capabilities because no corresponding tool exists.

## Residual risk and operator responsibilities

- A bearer token is long-lived until the operator rotates it and restarts Relay.
- The trusted tunnel stdio principal represents one personal user and cannot distinguish workspace
  members.
- Local SQLite files are protected by host filesystem permissions, not application-level
  encryption.
- The in-memory rate limiter resets on restart and is not coordinated across processes.
- Capsule data can be confidential even when it is not a credential; the operator must submit the
  minimum useful context.
- JWKS-based validation does not itself provide immediate revocation; short access-token lifetimes
  and provider-side revocation/abuse controls remain necessary.
- Relay does not provision OAuth clients or enforce authorization-code PKCE; those are
  authorization-server and client responsibilities.
- PostgreSQL confidentiality, availability, backups, credential rotation, and network isolation
  depend on the selected managed provider and deployment configuration.

The first three development mechanisms are acceptable only for a loopback, single-user proof. Do
not expose development-token or trusted-stdio identity publicly.

## Hosted-release gate

The OAuth and PostgreSQL adapters satisfy the application-level foundation, but a multi-user or
internet-facing release still requires:

1. Verify authorization-server discovery, PKCE, client registration, and consent behavior with the
   intended clients and provider.
2. Add revocation, tenant administration, distributed rate limits, abuse detection, and security
   telemetry.
3. Encrypt managed storage and backups and define retention/deletion policy.
4. Perform a dedicated privacy/threat review and load/concurrency test.
5. Re-run all isolation, malformed-input, secret/log, SSRF, traversal, and idempotency gates
   against the hosted adapter.
