import { z } from "zod";
import { LIMITS, SCHEMA_VERSION } from "./constants.js";

const boundedText = (maximum: number) => z.string().trim().min(1).max(maximum);
const optionalBoundedText = (maximum: number) => z.string().trim().max(maximum).optional();
const id = (prefix: string) => z.string().regex(new RegExp(`^${prefix}_[0-9a-f-]{36}$`));

export const TimestampSchema = z.string().datetime({ offset: true });
export const ProjectIdSchema = id("prj");
export const HandoffIdSchema = id("hnd");
export const CheckpointIdSchema = id("chk");
export const ArtifactIdSchema = id("art");

export const ProjectStatusSchema = z.enum(["active", "archived"]);
export const CheckpointStatusSchema = z.enum([
  "planned",
  "in_progress",
  "blocked",
  "completed",
  "abandoned",
]);
export const SourceSurfaceSchema = z.enum(["chatgpt_work", "codex", "other"]);
export const ArtifactKindSchema = z.enum([
  "url",
  "repo_path",
  "git_commit",
  "git_branch",
  "library_ref",
  "external_id",
]);

export const SlugInputSchema = z
  .string()
  .trim()
  .min(1)
  .max(LIMITS.slug)
  .regex(/^[A-Za-z0-9 _.-]+$/, "Slug contains unsupported characters");
export const CanonicalSlugSchema = z
  .string()
  .min(1)
  .max(LIMITS.slug)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
export const TagSchema = z
  .string()
  .trim()
  .min(1)
  .max(LIMITS.tagLength)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/);
export const IdempotencyKeySchema = z.string().trim().min(8).max(LIMITS.idempotencyKey);

export const DecisionSchema = z
  .object({
    statement: boundedText(LIMITS.listText),
    rationale: boundedText(LIMITS.listText),
  })
  .strict();

export const VerificationSchema = z
  .object({
    kind: z.enum(["test", "lint", "typecheck", "build", "manual", "other"]),
    command: boundedText(LIMITS.listText),
    status: z.enum(["passed", "failed", "not_run"]),
    summary: boundedText(LIMITS.listText),
    observed_at: TimestampSchema,
  })
  .strict()
  .superRefine((value, context) => {
    if (value.status === "passed" && value.command.trim().length === 0) {
      context.addIssue({
        code: "custom",
        path: ["command"],
        message: "Passed verification requires a command or procedure",
      });
    }
  });

const MetadataValueSchema = z.union([
  z.string().max(LIMITS.metadataValue),
  z.number().finite(),
  z.boolean(),
  z.null(),
]);

const isHttpUrl = (value: string): boolean => {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
};

export const ArtifactMetadataSchema = z
  .record(z.string().min(1).max(80), MetadataValueSchema)
  .superRefine((value, context) => {
    if (Object.keys(value).length > LIMITS.metadataEntries) {
      context.addIssue({
        code: "custom",
        message: `Artifact metadata is limited to ${LIMITS.metadataEntries} entries`,
      });
    }
  });

const safeRepositoryUri = (value: string) => {
  if (!value.startsWith("repo://")) return false;
  const path = value.slice("repo://".length);
  if (path.length === 0 || path.startsWith("/") || path.includes("\\")) return false;
  return !path.split("/").some((segment) => segment === ".." || segment === "." || segment === "");
};

export const RepositoryRelativePathSchema = z
  .string()
  .trim()
  .min(1)
  .max(1_000)
  .refine(
    (value) =>
      !value.startsWith("/") &&
      !value.includes("\\") &&
      !value.split("/").some((segment) => segment === ".." || segment === "." || segment === ""),
    "Path must be a normalized repository-relative POSIX path",
  );

export const ArtifactDefinitionSchema = z
  .object({
    kind: ArtifactKindSchema,
    label: boundedText(240),
    uri: boundedText(2_000),
    metadata: ArtifactMetadataSchema.optional().default({}),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.kind === "url" && !isHttpUrl(value.uri)) {
      context.addIssue({
        code: "custom",
        path: ["uri"],
        message: "URL artifacts require HTTP(S)",
      });
    }
    if (value.kind === "repo_path" && !safeRepositoryUri(value.uri)) {
      context.addIssue({
        code: "custom",
        path: ["uri"],
        message: "Repository artifacts require a safe repo://relative/path URI",
      });
    }
  });

export const HandoffSourceSchema = z
  .object({
    surface: SourceSurfaceSchema,
    conversation_url: z
      .string()
      .trim()
      .max(LIMITS.sourceReference)
      .refine(isHttpUrl, "Source conversation URLs require HTTP(S)")
      .nullable()
      .optional(),
    label: optionalBoundedText(LIMITS.sourceLabel),
  })
  .strict();

export const CheckpointSourceSchema = z
  .object({
    surface: SourceSurfaceSchema,
    thread_ref: z.string().trim().max(LIMITS.sourceReference).nullable().optional(),
  })
  .strict();

const StringListSchema = z.array(boundedText(LIMITS.listText)).max(LIMITS.arrayItems);
const ArtifactInputs = {
  artifact_refs: z.array(ArtifactIdSchema).max(LIMITS.artifacts).optional(),
  artifacts: z.array(ArtifactDefinitionSchema).max(LIMITS.artifacts).optional(),
};

export const UpsertProjectInputSchema = z
  .object({
    slug: SlugInputSchema,
    name: boundedText(LIMITS.name),
    description: z.string().trim().max(LIMITS.description).default(""),
    tags: z.array(TagSchema).max(LIMITS.tags).default([]),
    status: ProjectStatusSchema.optional().default("active"),
    idempotency_key: IdempotencyKeySchema,
  })
  .strict();

export const ListProjectsInputSchema = z
  .object({
    query: z.string().trim().max(240).optional(),
    status: ProjectStatusSchema.optional(),
    tags: z.array(TagSchema).max(10).optional(),
    cursor: z.string().max(2_048).optional(),
    limit: z.number().int().min(1).max(LIMITS.pageSize).optional().default(LIMITS.defaultPageSize),
  })
  .strict();

export const GetProjectInputSchema = z
  .object({
    project_id: ProjectIdSchema.optional(),
    slug: SlugInputSchema.optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if ((value.project_id ? 1 : 0) + (value.slug ? 1 : 0) !== 1) {
      context.addIssue({ code: "custom", message: "Provide exactly one of project_id or slug" });
    }
  });

export const CreateHandoffInputSchema = z
  .object({
    project_id: ProjectIdSchema,
    title: boundedText(LIMITS.title),
    objective: boundedText(LIMITS.objective),
    summary: boundedText(LIMITS.summary),
    decisions: z.array(DecisionSchema).max(LIMITS.arrayItems).optional(),
    constraints: StringListSchema.optional(),
    assumptions: StringListSchema.optional(),
    open_questions: StringListSchema.optional(),
    acceptance_criteria: StringListSchema.min(1),
    recommended_next_action: boundedText(LIMITS.nextAction),
    source: HandoffSourceSchema,
    supersedes_handoff_id: HandoffIdSchema.nullable().optional(),
    ...ArtifactInputs,
    idempotency_key: IdempotencyKeySchema,
  })
  .strict();

export const GetHandoffInputSchema = z
  .object({
    handoff_id: HandoffIdSchema.optional(),
    project_id: ProjectIdSchema.optional(),
    selector: z.literal("latest").optional(),
  })
  .strict()
  .superRefine((value, context) => {
    const byId = Boolean(value.handoff_id) && !value.project_id && !value.selector;
    const latest = !value.handoff_id && Boolean(value.project_id) && value.selector === "latest";
    if (!byId && !latest) {
      context.addIssue({
        code: "custom",
        message: "Provide handoff_id, or project_id with selector set to latest",
      });
    }
  });

export const CreateCheckpointInputSchema = z
  .object({
    project_id: ProjectIdSchema,
    status: CheckpointStatusSchema,
    summary: boundedText(LIMITS.summary),
    work_completed: StringListSchema,
    changed_files: z.array(RepositoryRelativePathSchema).max(LIMITS.arrayItems).optional(),
    verification: z.array(VerificationSchema).max(LIMITS.arrayItems).optional(),
    decisions: z.array(DecisionSchema).max(LIMITS.arrayItems).optional(),
    blockers: StringListSchema.optional(),
    recommended_next_action: boundedText(LIMITS.nextAction),
    source: CheckpointSourceSchema,
    supersedes_checkpoint_id: CheckpointIdSchema.nullable().optional(),
    ...ArtifactInputs,
    idempotency_key: IdempotencyKeySchema,
  })
  .strict();

export const GetLatestCheckpointInputSchema = z
  .object({
    project_id: ProjectIdSchema,
    status: CheckpointStatusSchema.optional(),
  })
  .strict();

export const GetProjectContextInputSchema = z
  .object({
    project_id: ProjectIdSchema.optional(),
    slug: SlugInputSchema.optional(),
    detail_level: z.enum(["compact", "standard"]).optional().default("standard"),
    artifact_limit: z.number().int().min(0).max(LIMITS.artifacts).optional().default(10),
  })
  .strict()
  .superRefine((value, context) => {
    if ((value.project_id ? 1 : 0) + (value.slug ? 1 : 0) !== 1) {
      context.addIssue({ code: "custom", message: "Provide exactly one of project_id or slug" });
    }
  });

export const ListProjectHistoryInputSchema = z
  .object({
    project_id: ProjectIdSchema,
    record_types: z
      .array(z.enum(["handoff", "checkpoint"]))
      .min(1)
      .max(2)
      .optional(),
    cursor: z.string().max(2_048).optional(),
    limit: z.number().int().min(1).max(LIMITS.pageSize).optional().default(LIMITS.defaultPageSize),
  })
  .strict();

export const ProjectSchema = z
  .object({
    id: ProjectIdSchema,
    slug: CanonicalSlugSchema,
    name: boundedText(LIMITS.name),
    description: z.string().max(LIMITS.description),
    status: ProjectStatusSchema,
    tags: z.array(TagSchema),
    created_at: TimestampSchema,
    updated_at: TimestampSchema,
    schema_version: z.literal(SCHEMA_VERSION),
  })
  .strict();

export const ArtifactSchema = z
  .object({
    id: ArtifactIdSchema,
    project_id: ProjectIdSchema,
    kind: ArtifactKindSchema,
    label: boundedText(240),
    uri: boundedText(2_000),
    metadata: ArtifactMetadataSchema,
    created_at: TimestampSchema,
    schema_version: z.literal(SCHEMA_VERSION),
  })
  .strict();

export const HandoffSchema = z
  .object({
    id: HandoffIdSchema,
    project_id: ProjectIdSchema,
    version: z.number().int().positive(),
    title: boundedText(LIMITS.title),
    objective: boundedText(LIMITS.objective),
    summary: boundedText(LIMITS.summary),
    decisions: z.array(DecisionSchema),
    constraints: StringListSchema,
    assumptions: StringListSchema,
    open_questions: StringListSchema,
    acceptance_criteria: StringListSchema.min(1),
    recommended_next_action: boundedText(LIMITS.nextAction),
    artifact_refs: z.array(ArtifactIdSchema),
    source: HandoffSourceSchema,
    supersedes_handoff_id: HandoffIdSchema.nullable(),
    created_at: TimestampSchema,
    schema_version: z.literal(SCHEMA_VERSION),
  })
  .strict();

export const CheckpointSchema = z
  .object({
    id: CheckpointIdSchema,
    project_id: ProjectIdSchema,
    sequence: z.number().int().positive(),
    status: CheckpointStatusSchema,
    summary: boundedText(LIMITS.summary),
    work_completed: StringListSchema,
    changed_files: z.array(RepositoryRelativePathSchema),
    verification: z.array(VerificationSchema),
    decisions: z.array(DecisionSchema),
    blockers: StringListSchema,
    recommended_next_action: boundedText(LIMITS.nextAction),
    artifact_refs: z.array(ArtifactIdSchema),
    source: CheckpointSourceSchema,
    supersedes_checkpoint_id: CheckpointIdSchema.nullable(),
    created_at: TimestampSchema,
    schema_version: z.literal(SCHEMA_VERSION),
  })
  .strict();

export type UpsertProjectInput = z.infer<typeof UpsertProjectInputSchema>;
export type ListProjectsInput = z.infer<typeof ListProjectsInputSchema>;
export type GetProjectInput = z.infer<typeof GetProjectInputSchema>;
export type CreateHandoffInput = z.infer<typeof CreateHandoffInputSchema>;
export type GetHandoffInput = z.infer<typeof GetHandoffInputSchema>;
export type CreateCheckpointInput = z.infer<typeof CreateCheckpointInputSchema>;
export type GetLatestCheckpointInput = z.infer<typeof GetLatestCheckpointInputSchema>;
export type GetProjectContextInput = z.infer<typeof GetProjectContextInputSchema>;
export type ListProjectHistoryInput = z.infer<typeof ListProjectHistoryInputSchema>;
export type Project = z.infer<typeof ProjectSchema>;
export type Handoff = z.infer<typeof HandoffSchema>;
export type Checkpoint = z.infer<typeof CheckpointSchema>;
export type Artifact = z.infer<typeof ArtifactSchema>;
export type ArtifactDefinition = z.infer<typeof ArtifactDefinitionSchema>;
export type Verification = z.infer<typeof VerificationSchema>;
export type Decision = z.infer<typeof DecisionSchema>;
export type ProjectStatus = z.infer<typeof ProjectStatusSchema>;
export type CheckpointStatus = z.infer<typeof CheckpointStatusSchema>;
