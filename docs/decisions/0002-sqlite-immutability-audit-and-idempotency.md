# ADR-002: SQLite immutability, audit, and idempotency

- Status: Accepted
- Date: 2026-08-31

## Context

The proof needs durable state, atomic writes, replay safety, user isolation, and a clean migration
path without prematurely introducing hosted infrastructure.

## Decision

- Put a provider-neutral `RelayRepository` port behind the domain service.
- Use the Node 24 standard-library `node:sqlite` API for the local adapter, avoiding a native
  addon installation toolchain.
- Enable foreign keys, a five-second busy timeout, and WAL for file databases.
- Apply ordered SQL migrations and record each applied filename.
- Scope slug uniqueness to the owning principal and require membership joins for all reads and
  writes.
- Make handoffs and checkpoints append-only with monotonically increasing project-local ordinals.
- Protect handoffs, checkpoints, and audit events against update/delete with database triggers.
- Execute each domain mutation, artifact write, audit event, and idempotency result in one
  immediate transaction.
- Key idempotency by principal, tool, and caller key. Return the original stored result when the
  canonical payload hash matches; return `IDEMPOTENCY_CONFLICT` when it differs.

## Consequences

A retry cannot duplicate a record, an audit failure rolls back the domain write, and state
survives process restart. The repository interface prevents SQLite choices from leaking into the
domain and leaves a hosted adapter possible later.

SQLite is appropriate for this single-host proof, not the final multi-region system. A hosted
version will need a transactional database, encrypted backups, tenant-aware connection policy,
operational migrations, and a concurrency/load review while preserving these invariants.
