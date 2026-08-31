import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  CreateCheckpointInputSchema,
  CreateHandoffInputSchema,
  UpsertProjectInputSchema,
  type CreateCheckpointInput,
  type CreateHandoffInput,
  type UpsertProjectInput,
} from "../../contracts/src/index.js";
import { RelayService } from "../../domain/src/service.js";
import type { RequestContext } from "../../domain/src/types.js";
import { SqliteRelayRepository } from "../../persistence-sqlite/src/index.js";

export const principalA: RequestContext = { principalRef: "principal-a", requestId: "request-a" };
export const principalB: RequestContext = { principalRef: "principal-b", requestId: "request-b" };

export const projectInput = (overrides: Partial<UpsertProjectInput> = {}): UpsertProjectInput =>
  UpsertProjectInputSchema.parse({
    slug: "relay-bootstrap",
    name: "Relay Bootstrap",
    description: "Build the first ChatGPT–Codex continuity proof.",
    tags: ["mcp", "relay"],
    idempotency_key: "project-key-0001",
    ...overrides,
  });

export const handoffInput = (
  projectId: string,
  overrides: Partial<CreateHandoffInput> = {},
): CreateHandoffInput =>
  CreateHandoffInputSchema.parse({
    project_id: projectId,
    title: "Initial build handoff",
    objective: "Build and verify the Relay v0.1 round trip.",
    summary: "Implement the explicit project-continuity vertical slice.",
    decisions: [
      {
        statement: "Use explicit capsules instead of transcript mirroring.",
        rationale: "This preserves user control and portability.",
      },
    ],
    constraints: ["Do not use undocumented ChatGPT APIs."],
    assumptions: ["The developer uses Windows and can run ChatGPT Work and Codex."],
    open_questions: [],
    acceptance_criteria: ["ChatGPT Work can retrieve a checkpoint written by Codex."],
    recommended_next_action: "Implement and verify the local vertical slice.",
    source: { surface: "chatgpt_work", label: "Relay build discussion" },
    idempotency_key: "handoff-key-0001",
    ...overrides,
  });

export const checkpointInput = (
  projectId: string,
  overrides: Partial<CreateCheckpointInput> = {},
): CreateCheckpointInput =>
  CreateCheckpointInputSchema.parse({
    project_id: projectId,
    status: "in_progress",
    summary: "Implemented and verified a real repository change.",
    work_completed: ["Added the Relay domain and transport layers."],
    changed_files: ["packages/domain/src/service.ts"],
    verification: [
      {
        kind: "test",
        command: "node --version",
        status: "passed",
        summary: "Node returned its installed version successfully.",
        observed_at: new Date().toISOString(),
      },
    ],
    decisions: [],
    blockers: [],
    recommended_next_action: "Run the cross-surface acceptance script.",
    source: { surface: "codex", thread_ref: null },
    idempotency_key: "checkpoint-key-0001",
    ...overrides,
  });

export interface TestSystem {
  directory: string;
  databasePath: string;
  repository: SqliteRelayRepository;
  service: RelayService;
  dispose(): void;
}

export const createTestSystem = (databasePath?: string): TestSystem => {
  const directory = mkdtempSync(join(tmpdir(), "relay-tests-"));
  const selectedPath = databasePath ?? join(directory, "relay.db");
  const repository = new SqliteRelayRepository(selectedPath);
  repository.migrate();
  const service = new RelayService(repository);
  return {
    directory,
    databasePath: selectedPath,
    repository,
    service,
    dispose: () => {
      repository.close();
      rmSync(directory, { recursive: true, force: true });
    },
  };
};
