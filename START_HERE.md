# Relay: ChatGPT–Codex Continuity Layer

This package is the first formal handoff from ChatGPT Work to Codex. It defines a Windows-first proof of concept for a shared, user-controlled project record that both ChatGPT Work and Codex can read and update through MCP.

## Intended outcome

Build and demonstrate one complete vertical slice:

1. ChatGPT Work creates a structured handoff capsule from the active conversation.
2. Codex finds and retrieves that capsule.
3. Codex records an implementation checkpoint.
4. ChatGPT Work retrieves the checkpoint and can continue the discussion with accurate implementation context.

The proof is complete only when this round trip works through real MCP tool calls—not by manually copying files between the two surfaces.

## Package contents

- `PRODUCT_BRIEF.md`: problem, users, value proposition, and product boundaries.
- `MVP_SPEC.md`: v0.1 user journeys, requirements, and acceptance criteria.
- `ARCHITECTURE.md`: target system and recommended implementation shape.
- `MCP_TOOL_CONTRACTS.md`: canonical entities and MCP tool definitions.
- `SECURITY_MODEL.md`: trust boundaries, threats, and required controls.
- `EVALS_AND_ACCEPTANCE_TESTS.md`: functional, security, and end-to-end tests.
- `AGENTS.md`: standing instructions for Codex while working in the repository.
- `CODEX_GOAL_PROMPT.md`: the goal to submit to Codex after opening the repository.

## How to use this package

1. Create a new empty Git repository named `relay` or another temporary working name.
2. Copy all files in this package to the repository root.
3. Open that repository in Codex.
4. Start Goal mode and submit the contents of `CODEX_GOAL_PROMPT.md`.
5. Let Codex inspect the package and create its implementation plan before it writes production code.
6. Review consequential changes to the scope, security model, persistence model, or tool contracts before accepting them.

## Product decision already made

Relay uses explicit handoff capsules, not automatic transcript or memory synchronization. ChatGPT already has the active conversation in context and deliberately selects what enters the capsule. This avoids unsupported ChatGPT APIs, browser scraping, accidental context leakage, and irrelevant transcript bloat.

## Definition of done

From ChatGPT Work, a user can create a handoff called `relay-bootstrap`; from Codex, the user can retrieve it and create a checkpoint; from ChatGPT Work, the user can retrieve that checkpoint. The stored records must remain isolated to the authenticated user, validate against the shared schemas, and never include credentials or hidden system/tool messages.

