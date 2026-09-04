# Repository Instructions for Codex

## Mission

Maintain Relay's secure, explicit, bidirectional project-context handoff and evolve the completed
Private Alpha readiness release into the publicly recruited, still-bounded Open Alpha defined in
`OPEN_ALPHA_SPEC.md`.

## Read order

Before planning or changing code, read completely:

1. `START_HERE.md`
2. `PRODUCT_BRIEF.md`
3. `MVP_SPEC.md`
4. `ARCHITECTURE.md`
5. `MCP_TOOL_CONTRACTS.md`
6. `SECURITY_MODEL.md`
7. `EVALS_AND_ACCEPTANCE_TESTS.md`
8. `V0_2_SPEC.md`
9. `V0_3_SPEC.md`
10. `PRIVATE_ALPHA_SPEC.md`
11. `OPEN_ALPHA_SPEC.md`

## Required behavior

- Preserve the v0.1 product boundary while implementing explicitly approved later milestones.
- Use only documented, supported OpenAI/MCP integration paths.
- Verify current official OpenAI documentation before choosing SDK versions, plugin metadata, authentication configuration, or tunnel commands.
- Keep the domain model provider-neutral.
- Keep handoffs and checkpoints immutable and auditable.
- Authenticate and authorize every project-scoped operation.
- Keep credentials out of source, fixtures, logs, and generated artifacts.
- Use runtime validation at every external boundary.
- Add tests with every behavior change.
- Prefer small, reviewable commits and explain consequential design decisions in ADRs.
- Preserve unrelated user changes in a dirty worktree.

## Prohibited behavior

- Do not scrape ChatGPT pages or browser storage.
- Do not use undocumented ChatGPT APIs or session cookies.
- Do not attempt to read or synchronize ChatGPT/Codex private memory stores.
- Do not add shell, arbitrary filesystem write, Git mutation, or Codex-control tools to the Relay MCP server in v0.1.
- Do not expose an unauthenticated operational endpoint; OAuth mode may expose only the
  standards-required protected-resource metadata endpoint.
- Do not claim a verification passed unless you ran it and observed the result.
- Do not deploy externally, publish a plugin, or create paid infrastructure without explicit user authorization.
- Do not silently broaden the product into a generic memory platform.
- Do not put work orchestration, queues, schedulers, leases, autonomous loops, or self-prompting
  into Relay. Those belong to the external development workflow, not the product.

## Implementation workflow

1. Inspect the environment and current official documentation.
2. Write a concise implementation plan and identify any true external blocker.
3. Record architecture decisions that materially refine this package.
4. Scaffold the repository and establish lint, typecheck, test, and migration commands.
5. Implement the domain and contract layers before transport polish.
6. Implement persistence, authentication adapter, authorization, audit, and idempotency.
7. Implement MCP tools and compact context assembly.
8. Add Windows setup and plugin-development documentation.
9. Run the complete verification suite and inspect for secret/log leakage.
10. Provide the exact manual cross-surface acceptance procedure.

Do not stop after scaffolding when safe implementation and verification remain possible.

## Default technical posture

Use strict TypeScript, a supported Node.js LTS runtime, a current official/recommended MCP SDK,
runtime schemas, ordered SQLite/PostgreSQL migrations, structured redacted logging, and a fast
automated test runner. Exact libraries and versions are implementation decisions that must be
verified rather than guessed.

## Definition of done

Open Alpha entry requires the inherited Private Alpha verification suite, a reproducible source
bundle, sub-10-minute onboarding tooling, redacted diagnostics, aggregate-only value metrics, safe
public intake, and the support/incident gates in `OPEN_ALPHA_SPEC.md`. Alpha exit is separate: do
not claim it or begin Public Beta work until 10–20 real participants provide repeat-usage and
continuation-value evidence that passes the pre-registered gates.
