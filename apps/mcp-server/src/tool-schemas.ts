import { z } from "zod";
import {
  ArtifactSchema,
  CheckpointSchema,
  HandoffSchema,
  ProjectSchema,
  TimestampSchema,
} from "../../../packages/contracts/src/index.js";

const nullableId = z.string().nullable();

export const UpsertProjectOutputSchema = z
  .object({ project: ProjectSchema, created: z.boolean() })
  .strict();

export const ListProjectsOutputSchema = z
  .object({ projects: z.array(ProjectSchema), next_cursor: z.string().nullable() })
  .strict();

export const GetProjectOutputSchema = z
  .object({
    project: ProjectSchema,
    latest_handoff_id: nullableId,
    latest_checkpoint_id: nullableId,
  })
  .strict();

export const CreateHandoffOutputSchema = z
  .object({
    handoff_id: z.string(),
    version: z.number().int().positive(),
    title: z.string(),
    stored_fields: z
      .object({
        decisions: z.number().int().nonnegative(),
        constraints: z.number().int().nonnegative(),
        assumptions: z.number().int().nonnegative(),
        open_questions: z.number().int().nonnegative(),
        acceptance_criteria: z.number().int().nonnegative(),
        artifacts: z.number().int().nonnegative(),
      })
      .strict(),
    created_at: TimestampSchema,
    warnings: z.array(z.string()),
  })
  .strict();

export const GetHandoffOutputSchema = z
  .object({ handoff: HandoffSchema, content_notice: z.string() })
  .strict();

export const CreateCheckpointOutputSchema = z
  .object({
    checkpoint_id: z.string(),
    sequence: z.number().int().positive(),
    status: CheckpointSchema.shape.status,
    work_completed_count: z.number().int().nonnegative(),
    changed_file_count: z.number().int().nonnegative(),
    verification: z.array(
      z
        .object({
          kind: CheckpointSchema.shape.verification.element.shape.kind,
          status: CheckpointSchema.shape.verification.element.shape.status,
          observed_at: TimestampSchema,
        })
        .strict(),
    ),
    created_at: TimestampSchema,
    warnings: z.array(z.string()),
  })
  .strict();

export const GetLatestCheckpointOutputSchema = z.discriminatedUnion("found", [
  z
    .object({ found: z.literal(true), checkpoint: CheckpointSchema, content_notice: z.string() })
    .strict(),
  z
    .object({ found: z.literal(false), checkpoint: z.null(), reason: z.literal("not_found") })
    .strict(),
]);

const ContextHandoffSchema = HandoffSchema.pick({
  id: true,
  version: true,
  objective: true,
  summary: true,
  decisions: true,
  constraints: true,
  assumptions: true,
  open_questions: true,
  acceptance_criteria: true,
  recommended_next_action: true,
});

const ContextCheckpointSchema = CheckpointSchema.pick({
  id: true,
  sequence: true,
  status: true,
  summary: true,
  work_completed: true,
  changed_files: true,
  verification: true,
  decisions: true,
  blockers: true,
  recommended_next_action: true,
});

export const GetProjectContextOutputSchema = z
  .object({
    project: ProjectSchema,
    latest_handoff: ContextHandoffSchema.nullable(),
    current_objective: z.string().nullable(),
    active_decisions: HandoffSchema.shape.decisions,
    active_constraints: HandoffSchema.shape.constraints,
    open_questions: HandoffSchema.shape.open_questions,
    assumptions: HandoffSchema.shape.assumptions,
    acceptance_criteria: HandoffSchema.shape.acceptance_criteria.or(z.array(z.string()).length(0)),
    latest_checkpoint: ContextCheckpointSchema.nullable(),
    recommended_next_action: z.string().nullable(),
    artifacts: z.array(ArtifactSchema),
    history: z
      .object({
        handoff_count: z.number().int().nonnegative(),
        checkpoint_count: z.number().int().nonnegative(),
      })
      .strict(),
    record_ids: z
      .object({ latest_handoff_id: nullableId, latest_checkpoint_id: nullableId })
      .strict(),
    generated_at: TimestampSchema,
    content_notice: z.string(),
  })
  .strict();

const HistoryItemSchema = z
  .object({
    id: z.string(),
    type: z.enum(["handoff", "checkpoint"]),
    ordinal: z.number().int().positive(),
    title: z.string(),
    status: z.string().nullable(),
    summary: z.string(),
    created_at: TimestampSchema,
    supersedes_id: z.string().nullable(),
  })
  .strict();

export const ListProjectHistoryOutputSchema = z
  .object({
    records: z.array(HistoryItemSchema),
    next_cursor: z.string().nullable(),
    content_notice: z.string(),
  })
  .strict();
