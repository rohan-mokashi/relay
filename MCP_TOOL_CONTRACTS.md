# MCP Tool Contracts

## Contract conventions

- IDs are opaque strings, preferably UUIDv7 or another time-sortable nonsemantic format.
- Timestamps are UTC ISO 8601 strings.
- Every stored entity includes `schema_version`.
- Every mutation is idempotent.
- Tool errors contain `code`, `message`, `request_id`, and optional field-level details.
- Tools never accept authentication identity as a substitute for transport/session authentication.
- Free-text fields have explicit size limits.
- Unknown fields are rejected for mutation payloads during v0.1.

## Canonical entities

### Project

```json
{
  "id": "prj_...",
  "slug": "relay-bootstrap",
  "name": "Relay Bootstrap",
  "description": "Build the first ChatGPT–Codex continuity proof.",
  "status": "active",
  "tags": ["mcp", "codex", "chatgpt-work"],
  "created_at": "2026-08-30T00:00:00Z",
  "updated_at": "2026-08-30T00:00:00Z",
  "schema_version": 1
}
```

### Handoff

```json
{
  "id": "hnd_...",
  "project_id": "prj_...",
  "version": 1,
  "title": "Initial build handoff",
  "objective": "Build and verify the Relay v0.1 round trip.",
  "summary": "A structured summary of the implementation-ready discussion.",
  "decisions": [
    {"statement": "Use explicit capsules, not transcript mirroring.", "rationale": "Control and portability."}
  ],
  "constraints": ["Do not use undocumented ChatGPT APIs."],
  "assumptions": ["The developer can run Codex and ChatGPT desktop on Windows."],
  "open_questions": [],
  "acceptance_criteria": ["ChatGPT Work can retrieve a checkpoint written by Codex."],
  "recommended_next_action": "Implement the local vertical slice.",
  "artifact_refs": ["art_..."],
  "source": {
    "surface": "chatgpt_work",
    "conversation_url": null,
    "label": "MCP Server Builds discussion"
  },
  "supersedes_handoff_id": null,
  "created_at": "2026-08-30T00:00:00Z",
  "schema_version": 1
}
```

### Checkpoint

```json
{
  "id": "chk_...",
  "project_id": "prj_...",
  "sequence": 1,
  "status": "in_progress",
  "summary": "Implemented the domain model and MCP tools.",
  "work_completed": ["Added schemas", "Added SQLite migrations"],
  "changed_files": ["packages/contracts/src/index.ts"],
  "verification": [
    {
      "kind": "test",
      "command": "pnpm test",
      "status": "passed",
      "summary": "All tests passed.",
      "observed_at": "2026-08-30T00:00:00Z"
    }
  ],
  "decisions": [],
  "blockers": [],
  "recommended_next_action": "Run the cross-surface acceptance test.",
  "artifact_refs": [],
  "source": {"surface": "codex", "thread_ref": null},
  "supersedes_checkpoint_id": null,
  "created_at": "2026-08-30T00:00:00Z",
  "schema_version": 1
}
```

### Artifact reference

```json
{
  "id": "art_...",
  "project_id": "prj_...",
  "kind": "repo_path",
  "label": "MVP specification",
  "uri": "repo://MVP_SPEC.md",
  "metadata": {"repository": "relay"},
  "created_at": "2026-08-30T00:00:00Z",
  "schema_version": 1
}
```

## Required tools

### `upsert_project`

**Purpose:** Create a project or update its mutable metadata using a user-scoped slug.

**Mutation:** Yes. Must state that it writes durable project state.

**Input:**

```json
{
  "slug": "relay-bootstrap",
  "name": "Relay Bootstrap",
  "description": "Build the continuity proof of concept.",
  "tags": ["mcp"],
  "idempotency_key": "client-generated-unique-key"
}
```

**Output:** Compact project object plus `created: true|false`.

### `list_projects`

**Purpose:** List accessible projects with filters and pagination.

**Input:** `query?`, `status?`, `tags?`, `cursor?`, `limit?`.

**Output:** Compact project summaries and `next_cursor`.

### `get_project`

**Purpose:** Retrieve project metadata by stable ID or exact user-scoped slug.

**Input:** Exactly one of `project_id` or `slug`.

**Output:** Project metadata and latest record IDs.

### `create_handoff`

**Purpose:** Persist an explicit, structured handoff capsule for another agent or surface.

**Mutation:** Yes. Tool description must emphasize deliberate context transfer.

**Required input:** `project_id`, `title`, `objective`, `summary`, nonempty `acceptance_criteria`, `recommended_next_action`, `source`, and `idempotency_key`.

**Optional input:** `decisions`, `constraints`, `assumptions`, `open_questions`, artifact definitions/references, and `supersedes_handoff_id`.

**Output:** Handoff ID, version, compact stored-fields summary, timestamp, and warnings.

### `get_handoff`

**Purpose:** Retrieve a specific handoff or the latest handoff for a project.

**Input:** Either `handoff_id`, or `project_id` with `selector: latest`.

**Output:** Validated handoff object. Historical detail is returned only when directly requested.

### `create_checkpoint`

**Purpose:** Record verified or in-progress implementation state for a project.

**Mutation:** Yes.

**Required input:** `project_id`, `status`, `summary`, `work_completed`, `recommended_next_action`, `source`, and `idempotency_key`.

**Optional input:** `changed_files`, `verification`, `decisions`, `blockers`, artifacts, and `supersedes_checkpoint_id`.

**Validation:** A verification item marked `passed` requires a nonempty command/procedure, summary, and observation time. Checkpoint status values: `planned`, `in_progress`, `blocked`, `completed`, `abandoned`.

**Output:** Checkpoint ID, sequence, compact status summary, timestamp, and warnings.

### `get_latest_checkpoint`

**Purpose:** Retrieve the latest project checkpoint, optionally filtered by status.

**Input:** `project_id`, optional `status`.

**Output:** Checkpoint or a typed `not_found` result.

### `get_project_context`

**Purpose:** Return the compact, actionable state needed to resume work without reading full history.

**Input:** `project_id` or exact `slug`; optional `detail_level: compact|standard`; optional bounded artifact limit.

**Output fields:**

```json
{
  "project": {},
  "latest_handoff": {
    "id": "hnd_...",
    "version": 1,
    "objective": "...",
    "summary": "...",
    "decisions": [],
    "constraints": [],
    "assumptions": [],
    "open_questions": [],
    "acceptance_criteria": [],
    "recommended_next_action": "..."
  },
  "latest_checkpoint": null,
  "artifacts": [],
  "history": {"handoff_count": 1, "checkpoint_count": 0},
  "generated_at": "2026-08-30T00:00:00Z"
}
```

### `list_project_history`

**Purpose:** Return paginated handoff/checkpoint metadata for audit and drill-down.

**Input:** `project_id`, optional `record_types`, `cursor`, and bounded `limit`.

**Output:** Metadata only by default, with stable IDs for retrieval.

## Error codes

- `AUTHENTICATION_REQUIRED`
- `ACCESS_DENIED`
- `NOT_FOUND`
- `AMBIGUOUS_PROJECT`
- `VALIDATION_FAILED`
- `IDEMPOTENCY_CONFLICT`
- `PAYLOAD_TOO_LARGE`
- `RATE_LIMITED`
- `INTERNAL_ERROR`

Internal errors must not reveal stack traces, database paths, tokens, SQL, or transport configuration to the model client.

## Tool annotations and descriptions

Use current MCP/OpenAI-supported annotations for read-only versus mutating tools. Descriptions should be short enough for reliable model selection while clearly distinguishing:

- project lookup from aggregate context retrieval;
- handoff creation from checkpoint creation;
- latest-record retrieval from history listing;
- durable writes from read-only operations.

Codex must confirm the current supported annotation vocabulary in official documentation during implementation.

