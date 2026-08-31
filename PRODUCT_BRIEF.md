# Product Brief

## Working name

**Relay** — a continuity layer for work that moves between conversational AI and execution agents.

The name is provisional and must not be allowed to delay the proof of concept.

## Problem

Substantial product work often begins as an exploratory conversation in ChatGPT Chat or ChatGPT Work and later moves to Codex for repository-aware implementation. The surfaces may share an account and plugin ecosystem, but they do not provide a documented, durable project object that carries the important decisions, constraints, artifacts, implementation state, and return status between an ordinary ChatGPT conversation and a Codex project.

Users therefore paste large transcripts, manually write summaries, repeat preferences, lose earlier decisions, or let an execution agent infer missing context. The result is setup friction and avoidable divergence between the original intent and the implementation.

## Product thesis

The right primitive is not universal chat synchronization. It is an explicit, structured, versioned handoff capsule owned by the user.

A capsule captures only the context required for the next agent to act:

- objective and background;
- decisions and their rationale;
- requirements and constraints;
- open questions and assumptions;
- acceptance criteria;
- relevant artifacts and source references;
- recommended next action;
- provenance and timestamps.

Execution agents add checkpoints to the same project record so the originating conversational surface can accurately explain results and decide what happens next.

## Primary user

A technically curious individual or small team that:

- ideates, researches, or specifies work in ChatGPT Work;
- uses Codex for implementation and verification;
- moves repeatedly between discussion and execution;
- wants control over what context crosses the boundary;
- does not want to depend on undocumented ChatGPT endpoints.

The first tester is Rohan Mokashi on Windows using ChatGPT Work and Codex.

## Core job to be done

> When a discussion becomes implementation-ready, help me transfer the essential project state to Codex and bring verified implementation state back, without reconstructing the context manually.

## Value proposition

- **Continuity:** decisions and constraints survive surface changes.
- **Control:** the user explicitly chooses what is transferred.
- **Traceability:** every capsule and checkpoint has provenance and version history.
- **Efficiency:** agents retrieve compact project state instead of rereading transcripts.
- **Portability:** the project record can later support other assistants without changing its core model.

## v0.1 scope

The first release proves a bidirectional data loop through a shared MCP server:

1. Create or select a project.
2. Create a handoff capsule.
3. Search/list and retrieve the capsule from Codex.
4. Add an implementation checkpoint from Codex.
5. Retrieve the checkpoint from ChatGPT Work.

## Explicit non-goals for v0.1

- Reading arbitrary ChatGPT conversation history.
- Scraping ChatGPT pages, cookies, local storage, or private endpoints.
- Synchronizing ChatGPT memory with Codex local memory.
- Mirroring raw transcripts automatically.
- Automatically launching or steering a Codex thread.
- Running shell commands or editing repository files through the bridge.
- Multi-agent orchestration.
- Team workspaces, sharing, billing, or marketplace publication.
- Semantic embeddings or autonomous memory extraction.
- A polished standalone web application.

## Product principles

1. **Explicit beats ambient.** No context crosses the boundary without a deliberate tool call.
2. **Structured beats verbose.** Transfer decisions and actionable state, not undifferentiated chat logs.
3. **Least privilege by default.** The server stores project records; it does not inherit unrestricted machine access.
4. **Provenance is part of the data.** Every record identifies its source surface, creator, and time.
5. **Human-readable and machine-valid.** Records should render clearly as Markdown/JSON and validate against schemas.
6. **No lock-in in the domain model.** OpenAI-specific adapters may exist, but the core project record remains provider-neutral.

## Future expansion, in order

1. OAuth and multi-user tenant isolation.
2. Hosted production persistence and encrypted artifact storage.
3. A small custom UI for selecting capsule fields and reviewing diffs.
4. Project linking and version comparisons.
5. Optional local companion using Codex app-server for user-approved task creation and status collection.
6. Connectors for Claude, Gemini, and other MCP-capable clients.
7. Selective import from user-provided ChatGPT data exports.

## Success signal

The product is valuable if a user can resume a nontrivial project in the other surface in under one minute, without pasting a transcript, and the receiving agent correctly states the objective, constraints, next action, and latest verified status.

