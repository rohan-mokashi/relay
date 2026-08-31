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

export interface RelayRepository {
  migrate(): void;
  close(): void;
  ensurePrincipal(externalRef: string, now: string): Principal;
  withIdempotency<T>(
    principalId: string,
    toolName: string,
    key: string,
    payloadHash: string,
    now: string,
    operation: () => T,
  ): T;
  getProjectById(principalId: string, projectId: string): Project | null;
  getProjectBySlug(principalId: string, slug: string): Project | null;
  upsertProject(
    principalId: string,
    input: Omit<UpsertProjectInput, "idempotency_key" | "slug"> & { slug: string },
    projectId: string,
    now: string,
  ): { project: Project; created: boolean };
  listProjects(principalId: string, input: ListProjectsInput): Page<Project>;
  getProjectRecordIds(principalId: string, projectId: string): ProjectRecordIds;
  createArtifacts(
    principalId: string,
    projectId: string,
    artifacts: Array<ArtifactDefinition & { id: string }>,
    now: string,
  ): Artifact[];
  getArtifactsByIds(principalId: string, projectId: string, artifactIds: string[]): Artifact[];
  getProjectArtifacts(principalId: string, projectId: string, limit: number): Artifact[];
  insertHandoff(principalId: string, draft: HandoffDraft): Handoff;
  getHandoffById(principalId: string, handoffId: string): Handoff | null;
  getLatestHandoff(principalId: string, projectId: string): Handoff | null;
  insertCheckpoint(principalId: string, draft: CheckpointDraft): Checkpoint;
  getCheckpointById(principalId: string, checkpointId: string): Checkpoint | null;
  getLatestCheckpoint(
    principalId: string,
    projectId: string,
    status?: CheckpointStatus,
  ): Checkpoint | null;
  countProjectRecords(
    principalId: string,
    projectId: string,
  ): { handoffCount: number; checkpointCount: number };
  listProjectHistory(principalId: string, input: ListProjectHistoryInput): Page<HistoryItem>;
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
  }): void;
}
