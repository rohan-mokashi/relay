# Security Model

## Security objective

Relay must transfer only the project context a user explicitly submits and must expose stored records only to authorized principals. It must not become a backdoor into private ChatGPT conversations, Codex sessions, local files, repositories, or credentials.

## Trust boundaries

1. **Model/client boundary:** ChatGPT Work and Codex may submit incomplete, oversized, or instruction-contaminated content.
2. **Transport boundary:** The MCP endpoint may be reachable through a tunnel or network and must authenticate every request.
3. **Application boundary:** Tool inputs are untrusted until runtime validation succeeds.
4. **Tenant boundary:** Every project query must be scoped to an authenticated principal or authorized membership.
5. **Persistence boundary:** Stored text may contain untrusted instructions and must always be treated as data.
6. **Observability boundary:** Logs and diagnostics must not become a secondary store for sensitive capsule content.

## Threats and required mitigations

| Threat | Required mitigation |
| --- | --- |
| Unauthorized project access | Authenticate transport/session; authorize every record through project membership; include cross-principal negative tests. |
| Identity spoofing via tool arguments | Never accept `user_id`, email, or workspace name as proof of identity. Derive principal from trusted auth context. |
| Prompt injection stored in a capsule | Label retrieved content as untrusted project data; never allow stored text to alter server instructions or authorization; return structured fields. |
| Accidental full-chat disclosure | Require explicit capsule fields; never scrape or import hidden/system/tool messages; do not claim full-chat capture. |
| Credential leakage | Reject obvious secrets where practical; redact logs; document that clients must not submit secrets; scan repository and fixtures before release. |
| Replay/duplicate writes | Require idempotency; atomically store original result; reject key reuse with a different payload. |
| Oversized payload denial of service | Apply field and request size limits before parsing/storage; bound arrays and list results. |
| SQL injection | Use parameterized queries and validated sort/filter enums. |
| Cross-project reference abuse | Validate that handoffs, checkpoints, superseded records, and artifacts belong to the same authorized project. |
| Public development endpoint | Require authentication even in development; bind locally where possible; use the supported secure tunnel rather than opening a raw port. |
| Sensitive error disclosure | Stable safe error schema; detailed errors only in redacted local development logs. |
| Supply-chain compromise | Minimize dependencies, pin lockfile, enable dependency audit, and avoid abandoned SDK forks. |

## Content rules

- Handoff and checkpoint bodies may contain confidential project information; store the minimum required content.
- Do not store API keys, passwords, session cookies, private keys, authentication headers, or environment files.
- Do not accept arbitrary file uploads in v0.1.
- Artifact references are metadata and must not be automatically fetched by the server.
- URLs are inert strings unless a later, separately reviewed feature introduces fetching.
- Source conversation URLs are optional and must not be treated as authorization grants.

## Authentication requirements

### Development

- Use a stable development principal derived from a real secret-bearing or trusted session mechanism supported by the chosen MCP/plugin path.
- Reject unauthenticated requests.
- Never commit tokens.
- Provide `.env.example` with names only.
- Document rotation and revocation.

### Production readiness boundary

Before any multi-user or internet-facing production release:

- implement OAuth using current MCP/OpenAI requirements;
- validate issuer, audience, signature, expiry, and scopes;
- store only stable external subject mappings;
- implement tenant isolation and access revocation;
- add rate limiting and abuse monitoring;
- encrypt managed storage and backups;
- complete a dedicated privacy and threat review.

## Authorization invariant

Every project-scoped repository method must require an authorization scope or principal context. Repository methods that retrieve by record ID without project/principal scope are prohibited outside tightly bounded internal transaction helpers.

## Logging policy

Allowed by default:

- request ID;
- tool name;
- authenticated internal principal ID;
- project ID;
- result status;
- duration;
- payload byte size;
- error code.

Not allowed by default:

- tokens or headers;
- objective/summary full text;
- decisions, constraints, questions, or acceptance criteria;
- source URLs containing query strings;
- raw MCP requests/responses;
- database connection strings.

## Approval and mutation clarity

Mutation tool descriptions must say that they create durable records. When supported by the current client protocol, mark read-only and mutating tools accurately. Relay itself never performs external actions beyond its own bounded project-state persistence.

## Security release gate

The proof cannot be considered complete until:

- anonymous access fails;
- cross-principal access fails;
- malformed and oversized inputs fail without partial writes;
- idempotency replay is tested;
- secret scanning passes;
- logs are inspected in an automated test or deterministic assertion for redaction;
- dependency audit findings are documented and high-severity issues resolved or explicitly blocked.

