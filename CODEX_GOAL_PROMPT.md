# Codex Goal Prompt

Build the Relay v0.1 proof of concept defined by the specification files in this repository.

Relay is a shared, explicit project-continuity layer for ChatGPT Work and Codex. The required vertical slice is:

1. ChatGPT Work creates a structured handoff capsule through Relay's MCP tools.
2. Codex retrieves the capsule through the same MCP-backed project record.
3. Codex creates an implementation checkpoint containing real changed-file and verification information.
4. ChatGPT Work retrieves that checkpoint through Relay.

Treat every Markdown file in the repository root as an authoritative part of the build package. Read `AGENTS.md` and then read the remaining files in the order it specifies before planning or editing.

## Execution instructions

- Begin by inspecting the environment and verifying the current official OpenAI documentation for MCP servers, ChatGPT plugins, Streamable HTTP, development authentication, Secure MCP Tunnel, and tool annotations. Do not rely on remembered commands or deprecated `codex mcp-server` behavior.
- Produce a concise implementation plan and ADRs for any material refinements. Do not reopen settled product decisions without concrete evidence.
- Implement the complete local Windows-first vertical slice, not only a scaffold or design document.
- Use a provider-neutral domain model, strict runtime validation, append-only records, SQLite migrations, authenticated principal context, per-project authorization, atomic audit/idempotency writes, compact context responses, and redacted logs.
- Implement all required tools in `MCP_TOOL_CONTRACTS.md` unless a current protocol limitation makes one impossible. If so, document the limitation and implement the closest safe, testable behavior without expanding scope.
- Create current plugin development metadata/instructions sufficient to connect ChatGPT Work to the local MCP server through the supported development path. Never commit credentials.
- Add unit, integration, contract, security, and real-transport end-to-end tests specified in `EVALS_AND_ACCEPTANCE_TESTS.md`.
- Add clear Windows PowerShell setup and run instructions, with a secondary POSIX path where inexpensive.
- Run lint, formatting checks, typecheck, migrations, tests, dependency audit, and secret scanning. Fix failures within scope. Report commands and observed results accurately.
- Do not deploy, purchase infrastructure, publish the plugin, access private ChatGPT data, scrape browser state, or expose an unauthenticated endpoint.
- Ask the user only when blocked by a required credential, workspace authorization, or a consequential product choice not resolved by the package. Continue independently through ordinary implementation decisions.

## Required handoff at completion

Return:

1. What was built.
2. The final architecture and any deviations from the supplied design.
3. The exact commands to run locally on Windows.
4. Automated verification results.
5. Any remaining external setup needed in ChatGPT Work.
6. The exact manual ChatGPT Work → Codex → ChatGPT Work acceptance script.
7. Known limitations and the recommended v0.2 milestone.

The goal is complete only when the repository is runnable from a clean checkout and ready for the real cross-surface acceptance test.

