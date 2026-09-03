CREATE TABLE principals (
  id TEXT PRIMARY KEY,
  external_ref_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);

CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  owner_principal_id TEXT NOT NULL REFERENCES principals(id),
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'archived')),
  tags_json JSONB NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  schema_version INTEGER NOT NULL CHECK (schema_version = 1),
  UNIQUE (owner_principal_id, slug)
);

CREATE TABLE project_memberships (
  project_id TEXT NOT NULL REFERENCES projects(id),
  principal_id TEXT NOT NULL REFERENCES principals(id),
  role TEXT NOT NULL CHECK (role IN ('owner', 'member')),
  created_at TEXT NOT NULL,
  PRIMARY KEY (project_id, principal_id)
);

CREATE TABLE handoffs (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  version INTEGER NOT NULL CHECK (version > 0),
  title TEXT NOT NULL,
  objective TEXT NOT NULL,
  summary TEXT NOT NULL,
  decisions_json JSONB NOT NULL,
  constraints_json JSONB NOT NULL,
  assumptions_json JSONB NOT NULL,
  open_questions_json JSONB NOT NULL,
  acceptance_criteria_json JSONB NOT NULL,
  recommended_next_action TEXT NOT NULL,
  source_json JSONB NOT NULL,
  supersedes_handoff_id TEXT REFERENCES handoffs(id),
  created_at TEXT NOT NULL,
  schema_version INTEGER NOT NULL CHECK (schema_version = 1),
  UNIQUE (project_id, version)
);

CREATE TABLE checkpoints (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  sequence INTEGER NOT NULL CHECK (sequence > 0),
  status TEXT NOT NULL CHECK (status IN ('planned', 'in_progress', 'blocked', 'completed', 'abandoned')),
  summary TEXT NOT NULL,
  work_completed_json JSONB NOT NULL,
  changed_files_json JSONB NOT NULL,
  verification_json JSONB NOT NULL,
  decisions_json JSONB NOT NULL,
  blockers_json JSONB NOT NULL,
  recommended_next_action TEXT NOT NULL,
  source_json JSONB NOT NULL,
  supersedes_checkpoint_id TEXT REFERENCES checkpoints(id),
  created_at TEXT NOT NULL,
  schema_version INTEGER NOT NULL CHECK (schema_version = 1),
  UNIQUE (project_id, sequence)
);

CREATE TABLE artifacts (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  kind TEXT NOT NULL CHECK (kind IN ('url', 'repo_path', 'git_commit', 'git_branch', 'library_ref', 'external_id')),
  label TEXT NOT NULL,
  uri TEXT NOT NULL,
  metadata_json JSONB NOT NULL,
  created_at TEXT NOT NULL,
  schema_version INTEGER NOT NULL CHECK (schema_version = 1)
);

CREATE TABLE record_artifacts (
  record_type TEXT NOT NULL CHECK (record_type IN ('handoff', 'checkpoint')),
  record_id TEXT NOT NULL,
  artifact_id TEXT NOT NULL REFERENCES artifacts(id),
  PRIMARY KEY (record_type, record_id, artifact_id)
);

CREATE TABLE idempotency_keys (
  principal_id TEXT NOT NULL REFERENCES principals(id),
  tool_name TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  result_json JSONB,
  created_at TEXT NOT NULL,
  PRIMARY KEY (principal_id, tool_name, idempotency_key)
);

CREATE TABLE audit_events (
  id TEXT PRIMARY KEY,
  principal_id TEXT NOT NULL REFERENCES principals(id),
  project_id TEXT NOT NULL REFERENCES projects(id),
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  request_id TEXT NOT NULL,
  metadata_json JSONB NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_memberships_principal ON project_memberships(principal_id, project_id);
CREATE INDEX idx_projects_updated ON projects(updated_at DESC, id DESC);
CREATE INDEX idx_handoffs_project_version ON handoffs(project_id, version DESC);
CREATE INDEX idx_checkpoints_project_sequence ON checkpoints(project_id, sequence DESC);
CREATE INDEX idx_artifacts_project_created ON artifacts(project_id, created_at DESC, id DESC);
CREATE INDEX idx_audit_project_created ON audit_events(project_id, created_at DESC, id DESC);

-- relay:integrity-triggers:start
CREATE FUNCTION relay_reject_immutable_change() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% records are immutable', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER handoffs_no_update_or_delete
BEFORE UPDATE OR DELETE ON handoffs
FOR EACH ROW EXECUTE FUNCTION relay_reject_immutable_change();

CREATE TRIGGER checkpoints_no_update_or_delete
BEFORE UPDATE OR DELETE ON checkpoints
FOR EACH ROW EXECUTE FUNCTION relay_reject_immutable_change();

CREATE TRIGGER audit_events_no_update_or_delete
BEFORE UPDATE OR DELETE ON audit_events
FOR EACH ROW EXECUTE FUNCTION relay_reject_immutable_change();
-- relay:integrity-triggers:end
