# Relay Private Alpha Readiness

## Release objective

Prepare the verified Relay interoperability release for a bounded, measurable Private Alpha with
approximately 10–20 developers. An unfamiliar tester should reach a working authenticated Relay
connection in under ten minutes, exercise explicit cross-client continuity, and provide comparable
outcome data without sending project content or credentials to Relay telemetry.

This milestone prepares and gates the study. It does not claim that the study has run, operate
public infrastructure, or authorize Public Beta. Public recruitment may occur later under the
additional controls in `OPEN_ALPHA_SPEC.md` without changing these thresholds.

## Scope

- A one-command local setup that preserves an existing `.env`, otherwise generates an ignored
  high-entropy development credential without printing it, installs the locked graph, migrates the
  database, and runs diagnostics.
- A redacted doctor command that checks supported runtime versions, client configuration, the
  nine-tool MCP contract, and an authenticated read without exposing stored content.
- A reproducible, commit-addressed source ZIP with a SHA-256 checksum and machine-readable release
  record.
- Tester and operator runbooks for the cross-client task, troubleshooting, feedback, backup,
  support, and incident response.
- A strict, aggregate-only observation schema and summarizer for onboarding time, continuation
  time, repeated context, incorrect assumptions, acceptance-criterion completion, trust, support
  load, and voluntary second-project use.
- Explicit Private Alpha entry and exit scorecards. Public Beta remains gated on real evidence.

## Product boundary

- Relay continues to expose only its existing nine provider-neutral project-state tools.
- Setup, diagnostics, packaging, metrics aggregation, and study operations are repository/operator
  tooling, not MCP capabilities and not persisted Relay domain records.
- No transcript scraping, content telemetry, arbitrary execution tool, automatic synchronization,
  participant recruitment, scheduler, queue, autonomous loop, or self-prompting is added to Relay.
- The external Codex development work loop may automate repository work, but it is not a Relay
  product feature and must not alter the MCP contract.

## Private Alpha entry criteria

1. The v0.3 acceptance record is passed with a real independent client and cross-client retrieval.
2. `pnpm verify` passes on the exact entry commit, including Private Alpha checks, all inherited
   tests, secret scanning, and the dependency audit.
3. `node scripts/private-alpha-setup.mjs` is non-destructive to an existing `.env`, never prints a
   generated credential, and ends in a passing `pnpm alpha:doctor` on a supported checkout.
4. `pnpm alpha:doctor` proves the exact nine-tool contract and an authenticated read while emitting
   only safe diagnostic metadata.
5. `pnpm alpha:bundle` produces a commit-addressed ZIP, SHA-256 checksum, and release JSON from a
   clean tracked worktree.
6. Tester, operator, metrics, support, incident, and exit-gate documents are complete and linked.
7. Synthetic metrics fixtures validate the analysis path but are never presented as user evidence.

## Pre-registered Private Alpha exit criteria

Use one aggregate observation per participant and the formulas in
`docs/private-alpha/metrics.md`. All product-value thresholds must pass:

- 10–20 distinct participants complete the bounded study.
- At least 80% reach a working authenticated setup within 10 minutes.
- At least 70% resume the selected project in the receiving client within 1 minute.
- At least 80% complete with zero incorrect receiving-agent assumptions attributable to missing
  Relay context.
- At least 80% of declared acceptance criteria are completed correctly.
- Average trust in the stored capsule is at least 4 out of 5.
- At least 50% voluntarily use Relay for a second project during the study window.

Safety and operations must also pass: no unresolved severity-1 or severity-2 incident, no confirmed
cross-principal access, credential exposure, or silent data loss, all shipped checks remain green,
and every material support pattern has an owner and documented disposition.

## Public Beta gate

Do not start Public Beta implementation, promotion, or onboarding expansion merely because the
entry package ships. Public Beta may be considered only after the real Private Alpha dataset and
incident register satisfy every exit criterion, an operator signs the exit scorecard, and any
threshold miss is either fixed and re-measured or explicitly treated as a no-go decision.
