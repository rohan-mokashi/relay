# Private Alpha operator runbook

## Entry and packaging

1. Confirm the [v0.3 acceptance record](../v0.3-acceptance-record.md) is passed.
2. From the exact candidate commit, run `pnpm verify`.
3. Commit all tracked release changes and require a clean tracked worktree.
4. Run `pnpm alpha:bundle`. Distribute the generated ZIP and `.sha256` from `.data/releases`; keep
   its JSON release record with the study register. The bundle contains committed source only and
   is not a public package or hosted deployment.
5. Independently extract one ZIP, verify its checksum, and run
   `node scripts/private-alpha-setup.mjs`. Record elapsed time and the doctor result without copying
   `.env`.

## Cohort operation

- Recruit 10–20 developers privately, or publicly under the additional controls in
  `../../OPEN_ALPHA_SPEC.md`. Recruitment and external communication require the product owner's
  action; repository automation must not contact people.
- Assign each tester a random `participant_ref` matching `alpha_[a-z0-9]{8,24}`. Keep any mapping
  to real identity outside the repository and outside the metrics dataset.
- Give every tester the ZIP/checksum pair, [tester-quickstart.md](tester-quickstart.md), the support
  route, the study window, and a clear statement that this is pre-release local software.
- Collect exactly one final aggregate observation per participant. Reject free text and duplicates
  from the JSONL metrics file.
- Keep raw observations under `.data/alpha-observations.jsonl`; it is ignored by Git. Run
  `pnpm alpha:metrics -- .data/alpha-observations.jsonl` for the aggregate scorecard.

## Daily controls

- Review support requests and the incident register once per operating day.
- Pause new invitations for any suspected cross-principal access, credential exposure, silent data
  loss, destructive behavior, or corrupted migration.
- Keep release ZIPs immutable. Fixes receive a new semantic prerelease version, commit, bundle,
  checksum, and entry verification.
- Back up any operator-owned test database before migration. Testers own their local data and must
  opt in before sharing even a redacted database extract.
- Never request `.env`, bearer tokens, authorization headers, raw capsules, chat exports, or private
  repository contents for routine support.

## Exit review

Use [exit-scorecard.md](exit-scorecard.md). Synthetic examples prove only that the analysis command
works. Public Beta remains blocked until real observations pass every value gate and the incident
register has no unresolved severity-1 or severity-2 item.
