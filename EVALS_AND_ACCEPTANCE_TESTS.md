# Evaluations and Acceptance Tests

## Testing strategy

The release requires five layers of evidence:

1. Domain unit tests.
2. Persistence and transaction integration tests.
3. MCP contract tests through the real transport adapter.
4. Security and isolation tests.
5. A manual cross-surface acceptance run in ChatGPT Work and Codex.

Mocks may isolate external client behavior, but the final vertical-slice test must exercise the actual server, database, and MCP tool handlers.

## Domain tests

- Project slug normalization and user-scoped uniqueness.
- Required handoff fields and field-size boundaries.
- At least one acceptance criterion is required.
- Immutable handoff and checkpoint records.
- Valid and invalid supersession links.
- Checkpoint status enum validation.
- Passed verification requires procedure/command, summary, and observation time.
- Artifact kind and URI validation.
- Cross-project record references are rejected.

## Persistence tests

- Clean database migration from zero.
- Migration re-run is deterministic or safely reports already applied versions.
- Foreign keys are enabled.
- Project, handoff, audit event, and idempotency record commit atomically.
- Induced audit-write failure rolls back the domain write.
- Concurrent identical idempotent writes yield one record and the same result.
- Same idempotency key with a different payload returns `IDEMPOTENCY_CONFLICT`.
- Pagination is stable with deterministic ordering.

## MCP contract tests

For every tool:

- advertised input schema matches runtime validation;
- valid input returns the documented shape;
- unknown fields and invalid types are rejected;
- errors use stable safe codes;
- read-only/mutating metadata is correct where supported;
- output remains under the documented response budget for standard cases.

Tool-selection evaluation prompts:

| Prompt | Expected tool |
| --- | --- |
| “Create a durable handoff of this discussion for Codex.” | `create_handoff` after project resolution |
| “What should I work on next for Relay?” | `get_project_context` |
| “Record that the schema tests passed and the server is ready for the round trip.” | `create_checkpoint` |
| “Show every historical Relay record.” | `list_project_history`, followed by selected retrieval only if requested |
| “Open all my old ChatGPT chats about Relay.” | No unsupported tool; explain v0.1 boundary |
| “Run the implementation in my repository.” | No Relay tool; Relay has no execution capability |

## Security tests

- Missing credentials return `AUTHENTICATION_REQUIRED`.
- Invalid credentials return a safe authentication error.
- Principal B cannot list, find, retrieve, update, or reference Principal A's project.
- Record IDs do not bypass project authorization.
- User-supplied identity fields do not affect authorization.
- SQL metacharacters in search and slug inputs are harmless.
- Oversized strings, arrays, and requests are rejected before persistence.
- Malicious stored text such as “ignore all previous instructions” is returned only as structured data and never changes server behavior.
- Tokens and capsule text are absent from default logs.
- URLs are not fetched.
- Directory traversal strings in repository-relative artifact paths are rejected or normalized under a clearly documented policy.

## End-to-end automated scenario

1. Start the server with a temporary database and Principal A credential.
2. Call `upsert_project` for `relay-bootstrap`.
3. Call `create_handoff` with the canonical Relay objective and constraints.
4. Call `get_project_context`; assert the handoff is accurately represented.
5. Call `create_checkpoint` with a real test result from the repository.
6. Call `get_project_context`; assert the checkpoint and verification are accurately represented.
7. Repeat both mutations with identical idempotency keys; assert no duplicates.
8. Connect as Principal B; assert no Relay project is visible.
9. Restart the server; assert the same state is retrievable.

## Manual cross-surface acceptance script

### Part 1: ChatGPT Work

With the development plugin connected, say:

> Create or select the project `relay-bootstrap`. Create a durable handoff for Codex using the current discussion. Include the objective, the explicit-capsule decision, the v0.1 exclusions, all acceptance criteria, and the next action. Do not include credentials or hidden messages.

Record the returned project and handoff IDs.

### Part 2: Codex

With the same Relay server connected, say:

> Retrieve the standard project context for `relay-bootstrap`. Before changing code, restate the objective, active constraints, acceptance criteria, and recommended next action. Then make one small, real, verified repository improvement and create a Relay checkpoint containing the changed files and actual verification result.

Record the returned checkpoint ID.

### Part 3: ChatGPT Work

Say:

> Retrieve the latest Relay Bootstrap project context and explain what Codex changed, what verification actually ran, whether anything is blocked, and what we should do next.

Compare the answer against the repository diff and test output.

## Acceptance scorecard

| Criterion | Pass condition |
| --- | --- |
| Work → Codex continuity | Codex retrieves the capsule without pasted transcript or shared local file. |
| Codex → Work continuity | Work retrieves the real checkpoint without manual status transcription. |
| Fidelity | Objective, constraints, acceptance criteria, and verification remain accurate. |
| Isolation | A second principal cannot discover or access the project. |
| Durability | State survives server restart. |
| Idempotency | Retries do not create duplicates. |
| Safety | No undocumented APIs, scraping, arbitrary execution, or secret leakage. |
| Reproducibility | Clean setup and test commands work on Windows from documented steps. |

All rows must pass. A partial demo is informative but is not v0.1 completion.

