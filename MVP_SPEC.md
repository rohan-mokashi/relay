# MVP Specification: v0.1

## Release objective

Demonstrate a reliable, secure, bidirectional project handoff between ChatGPT Work and Codex using the same MCP-backed project record.

## User journeys

### Journey A: ChatGPT Work to Codex

1. The user discusses a project in ChatGPT Work.
2. The user asks ChatGPT to package the discussion for Codex.
3. ChatGPT calls `upsert_project` if the project does not already exist.
4. ChatGPT calls `create_handoff` with a structured summary of the active conversation.
5. The server returns the immutable handoff ID, version, summary, and timestamp.
6. In Codex, the user asks to load the latest handoff for the project.
7. Codex calls `get_project_context` or `get_handoff` and restates the objective, constraints, open questions, and acceptance criteria before implementing.

### Journey B: Codex to ChatGPT Work

1. Codex completes or pauses a defined implementation milestone.
2. Codex calls `create_checkpoint` with changed files, verification results, decisions, blockers, and recommended next action.
3. The server returns the immutable checkpoint ID and timestamp.
4. In ChatGPT Work, the user asks for the latest implementation status.
5. ChatGPT calls `get_project_context` or `get_latest_checkpoint` and explains the current state accurately.

## Functional requirements

### Projects

- Create a project with a unique user-scoped slug and display name.
- Update project metadata without rewriting prior handoffs or checkpoints.
- List and search only projects accessible to the authenticated principal.
- Retrieve a compact aggregate context view for a project.

### Handoffs

- Create immutable, versioned handoff capsules.
- Require objective, summary, acceptance criteria, and recommended next action.
- Support structured decisions, constraints, open questions, assumptions, and artifact references.
- Retrieve a specific handoff or the latest handoff for a project.
- Preserve source surface, optional source conversation URL, creator, and creation time.

### Checkpoints

- Create immutable implementation checkpoints.
- Capture status, work completed, changed-file references, commands/tests run, verification results, decisions, blockers, and next action.
- Retrieve a specific or latest checkpoint.
- Never claim a verification passed without a supplied verification result.

### Artifacts

- v0.1 stores artifact references and metadata, not arbitrary uploaded file bytes.
- Supported reference types: URL, repository-relative path, Git commit/branch, Library reference, and free-form external identifier.
- Reject secrets in artifact metadata where detection is practical; always warn clients not to submit them.

### Auditability

- Every mutation creates an append-only audit event.
- Every response includes stable IDs and timestamps.
- Logs must not contain bearer tokens or full capsule bodies by default.

## Non-functional requirements

- Type-safe shared schemas with runtime validation.
- Deterministic database migrations.
- Repeatable local setup on Windows PowerShell and a secondary POSIX path when inexpensive.
- Automated unit, integration, contract, and security tests.
- Structured errors with stable codes and safe messages.
- Pagination for list/search tools even if the initial data volume is small.
- Tool responses optimized for model consumption: concise summaries first, optional detailed payloads.
- No dependency on undocumented OpenAI endpoints.

## Recommended development mode

- Run a local Streamable HTTP MCP server.
- Persist to a local SQLite database for the single-user proof of concept.
- Connect local Codex directly to the server.
- Connect ChatGPT Work through the currently supported OpenAI plugin development path or Secure MCP Tunnel.
- Keep persistence and identity behind interfaces so a hosted Postgres/OAuth implementation can replace them later.

Codex must verify the current official OpenAI MCP/plugin documentation before selecting exact SDK versions, manifest fields, tunnel commands, or authentication configuration.

## Required project-context response

`get_project_context` should return, in order:

1. Project identity and status.
2. Latest handoff summary.
3. Current objective.
4. Active decisions and constraints.
5. Open questions and assumptions.
6. Acceptance criteria.
7. Latest checkpoint and verification status, if present.
8. Recommended next action.
9. Relevant artifact references.
10. Record IDs and versions for deeper retrieval.

It should not return complete historical records unless explicitly requested.

## UX requirements

- Tool names and descriptions must make correct selection obvious to both ChatGPT Work and Codex.
- Mutation tools must clearly state that they create durable project records.
- The server must confirm what was stored using a compact summary rather than echoing all submitted text.
- Conflicting or ambiguous project matches must return candidates rather than silently selecting one.
- The system must never imply that it imported an entire conversation when it only received a structured capsule.

## Acceptance criteria

The v0.1 release is accepted when all of the following are demonstrated:

1. A project named `Relay Bootstrap` is created from ChatGPT Work.
2. ChatGPT Work creates a handoff whose objective is to build the Relay proof of concept.
3. Codex retrieves the handoff using only the MCP tools and accurately restates its required fields.
4. Codex creates a checkpoint containing at least one real repository change and one verification result.
5. ChatGPT Work retrieves the checkpoint using only the MCP tools and accurately reports its status.
6. A second authenticated/anonymous principal cannot access the project.
7. Invalid capsule payloads return schema errors without partial writes.
8. Mutation retries using the same idempotency key do not create duplicates.
9. Logs and committed files contain no credentials.
10. The complete automated test suite passes from a clean checkout.

## Out-of-scope requests

When a user asks v0.1 to read an arbitrary ChatGPT chat, launch Codex automatically, sync memories, or manipulate local files, the tool should clearly explain that the capability is unavailable rather than attempting an unsafe workaround.

