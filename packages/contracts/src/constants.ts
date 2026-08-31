export const SCHEMA_VERSION = 1 as const;

export const LIMITS = {
  requestBytes: 256 * 1024,
  responseBytes: 64 * 1024,
  slug: 80,
  name: 120,
  description: 2_000,
  title: 160,
  objective: 4_000,
  summary: 8_000,
  listText: 2_000,
  nextAction: 2_000,
  sourceLabel: 240,
  sourceReference: 2_000,
  idempotencyKey: 128,
  arrayItems: 50,
  tags: 20,
  tagLength: 40,
  artifacts: 50,
  metadataEntries: 30,
  metadataValue: 1_000,
  pageSize: 50,
  defaultPageSize: 20,
} as const;

export const ERROR_CODES = [
  "AUTHENTICATION_REQUIRED",
  "ACCESS_DENIED",
  "NOT_FOUND",
  "AMBIGUOUS_PROJECT",
  "VALIDATION_FAILED",
  "IDEMPOTENCY_CONFLICT",
  "PAYLOAD_TOO_LARGE",
  "RATE_LIMITED",
  "INTERNAL_ERROR",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export const RELAY_TOOL_NAMES = [
  "upsert_project",
  "list_projects",
  "get_project",
  "create_handoff",
  "get_handoff",
  "create_checkpoint",
  "get_latest_checkpoint",
  "get_project_context",
  "list_project_history",
] as const;

export type RelayToolName = (typeof RELAY_TOOL_NAMES)[number];
