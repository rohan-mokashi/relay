# Relay v0.1 threat model

## Assets and trust boundaries

Relay protects structured project text, record identifiers, artifact metadata, authentication
credentials, and audit history. Its boundaries are the MCP caller, HTTP/tunnel transport,
authentication adapter, per-principal repository scope, SQLite persistence, and logs.

Stored project text is untrusted data. It can be returned to a model but cannot alter server
authorization, tool registration, SQL, logging policy, or transport behavior.

## Threats and controls

| Threat | v0.1 control | Evidence |
| --- | --- | --- |
| Missing or forged identity | HTTP bearer authentication on every supported endpoint; stdio refuses an unset trusted principal | Security tests for missing/invalid credentials; stdio startup behavior |
| Caller-supplied identity spoofing | Tool schemas reject unknown identity fields; principal comes only from transport context | Contract and security tests |
| Cross-principal discovery or ID access | Principal-scoped repository methods and membership joins for list, project, record, artifact, and history queries | Security and domain tests |
| Duplicate writes/retries | Principal/tool/key idempotency record with canonical payload hash in the same transaction | Integration and end-to-end tests |
| Partial write or missing audit | Immediate SQLite transaction includes domain state, audit, and idempotency result | Injected audit-failure rollback test |
| Mutation of history | Append-only tables, version/sequence allocation, immutable SQLite triggers | Domain and persistence tests |
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

## Development-only residual risk

- A bearer token is long-lived until the operator rotates it and restarts Relay.
- The trusted tunnel stdio principal represents one personal user and cannot distinguish workspace
  members.
- Local SQLite files are protected by host filesystem permissions, not application-level
  encryption.
- The in-memory rate limiter resets on restart and is not coordinated across processes.
- Capsule data can be confidential even when it is not a credential; the operator must submit the
  minimum useful context.

These risks are acceptable only for a loopback, single-user proof. Do not expose the development
server publicly.

## Hosted-release gate

Before a multi-user or internet-facing release:

1. Implement current MCP OAuth 2.1 discovery, PKCE, supported client registration, exact resource
   binding, and token validation.
2. Validate issuer, audience, signature, expiry, subject, tenant, and scopes on every request.
3. Add revocation, tenant administration, distributed rate limits, abuse detection, and security
   telemetry.
4. Encrypt managed storage and backups and define retention/deletion policy.
5. Perform a dedicated privacy/threat review and load/concurrency test.
6. Re-run all isolation, malformed-input, secret/log, SSRF, traversal, and idempotency gates
   against the hosted adapter.
