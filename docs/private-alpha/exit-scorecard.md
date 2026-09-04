# Private Alpha entry and exit scorecard

## Entry readiness

| Gate | Status | Evidence |
| --- | --- | --- |
| v0.3 independent-client interoperability | Passed | `docs/v0.3-acceptance-record.md` |
| One-command non-destructive local setup | Passed | A checksum-verified fresh extraction of `0.4.0-alpha.2` installed 161 locked packages, generated an unprinted ignored credential, migrated SQLite, and completed the doctor; `pnpm alpha:check` also verifies existing `.env` preservation |
| Redacted authenticated diagnostics | Passed | `pnpm alpha:doctor` checked Node/pnpm, configuration, nine-tool discovery, and an authenticated read in under six seconds without stored content or credentials |
| Reproducible commit-addressed package | Passed | `pnpm alpha:bundle` produced a commit-addressed ZIP, SHA-256 file, and JSON release record; the checksum and extracted setup were verified before entry |
| Tester/operator/support/incident runbooks | Passed | `pnpm alpha:check` verified all required `docs/private-alpha/` artifacts are present and non-empty |
| Aggregate-only metrics path | Passed | The strict parser and four unit tests passed; the synthetic 10-row fixture produced aggregate output with no participant references and `value_gate_passed: true` |
| Full inherited release gate | Passed | Lint, format, typecheck, build, SQLite/PostgreSQL migrations, client/plugin/Alpha checks, 12 test files and 67 tests, secret scan, and high-severity dependency audit passed; the registry request required a transport retry |

## Exit evidence

These rows require real external participants and remain pending at entry:

| Gate | Required result | Status |
| --- | --- | --- |
| Cohort | 10–20 distinct completed participants | Pending external study |
| Onboarding | At least 80% in 10 minutes or less | Pending external study |
| Continuation | At least 70% in 1 minute or less | Pending external study |
| Context fidelity | At least 80% with zero incorrect assumptions | Pending external study |
| Criteria completion | At least 80% aggregate completion | Pending external study |
| Trust | Average at least 4/5 | Pending external study |
| Repeat use | At least 50% voluntarily use a second project | Pending external study |
| Safety | No unresolved SEV-1/SEV-2 or confirmed isolation, credential, or silent-loss failure | Pending external study |
| Support readiness | Material patterns have owners and dispositions | Pending external study |

`value_gate_passed: true` from real observations is necessary but not sufficient: the operator must
also review the safety and support rows and record a dated sign-off. Until then, Private Alpha is
running or pending and Public Beta work is prohibited.
