import type {
  Artifact,
  ArtifactDefinition,
  Checkpoint,
  CheckpointStatus,
  CreateCheckpointInput,
  CreateHandoffInput,
  Handoff,
  ListProjectHistoryInput,
  ListProjectsInput,
  Project,
  UpsertProjectInput,
} from "../../contracts/src/index.js";

export interface RequestContext {
  principalRef: string;
  requestId: string;
}

export interface Principal {
  id: string;
  createdAt: string;
}

export interface ProjectRecordIds {
  latestHandoffId: string | null;
  latestCheckpointId: string | null;
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

export interface HistoryItem {
  id: string;
  type: "handoff" | "checkpoint";
  ordinal: number;
  title: string;
  status: string | null;
  summary: string;
  created_at: string;
  supersedes_id: string | null;
}

export interface HandoffDraft
  extends Omit<CreateHandoffInput, "artifacts" | "artifact_refs" | "idempotency_key"> {
  id: string;
  artifactIds: string[];
  createdAt: string;
}

export interface CheckpointDraft
  extends Omit<CreateCheckpointInput, "artifacts" | "artifact_refs" | "idempotency_key"> {
  id: string;
  artifactIds: string[];
  createdAt: string;
}

export type Awaitable<T> = T | Promise<T>;

export interface RelayRepository {
  withRequest<T>(operation: () => Awaitable<T>): Promise<T>;
  migrate(): Awaitable<void>;
  close(): Awaitable<void>;
  ensurePrincipal(externalRef: string, now: string): Awaitable<Principal>;
  withIdempotency<T>(
    principalId: string,
    toolName: string,
    key: string,
    payloadHash: string,
    now: string,
    operation: () => Awaitable<T>,
  ): Promise<T>;
  getProjectById(principalId: string, projectId: string): Awaitable<Project | null>;
  getProjectBySlug(principalId: string, slug: string): Awaitable<Project | null>;
  upsertProject(
    principalId: string,
    input: Omit<UpsertProjectInput, "idempotency_key" | "slug"> & { slug: string },
    projectId: string,
    now: string,
  ): Awaitable<{ project: Project; created: boolean }>;
  listProjects(principalId: string, input: ListProjectsInput): Awaitable<Page<Project>>;
  getProjectRecordIds(principalId: string, projectId: string): Awaitable<ProjectRecordIds>;
  createArtifacts(
    principalId: string,
    projectId: string,
    artifacts: Array<ArtifactDefinition & { id: string }>,
    now: string,
  ): Awaitable<Artifact[]>;
  getArtifactsByIds(
    principalId: string,
    projectId: string,
    artifactIds: string[],
  ): Awaitable<Artifact[]>;
  getProjectArtifacts(principalId: string, projectId: string, limit: number): Awaitable<Artifact[]>;
  insertHandoff(principalId: string, draft: HandoffDraft): Awaitable<Handoff>;
  getHandoffById(principalId: string, handoffId: string): Awaitable<Handoff | null>;
  getLatestHandoff(principalId: string, projectId: string): Awaitable<Handoff | null>;
  insertCheckpoint(principalId: string, draft: CheckpointDraft): Awaitable<Checkpoint>;
  getCheckpointById(principalId: string, checkpointId: string): Awaitable<Checkpoint | null>;
  getLatestCheckpoint(
    principalId: string,
    projectId: string,
    status?: CheckpointStatus,
  ): Awaitable<Checkpoint | null>;
  countProjectRecords(
    principalId: string,
    projectId: string,
  ): Awaitable<{ handoffCount: number; checkpointCount: number }>;
  listProjectHistory(
    principalId: string,
    input: ListProjectHistoryInput,
  ): Awaitable<Page<HistoryItem>>;
  appendAudit(event: {
    id: string;
    principalId: string;
    projectId: string;
    action: string;
    targetType: string;
    targetId: string;
    requestId: string;
    createdAt: string;
    metadata?: Record<string, string | number | boolean | null>;
  }): Awaitable<void>;
}
