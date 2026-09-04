# Private Alpha entry and exit scorecard

## Entry readiness

| Gate | Status | Evidence |
| --- | --- | --- |
| v0.3 independent-client interoperability | Passed | `docs/v0.3-acceptance-record.md` |
| One-command non-destructive local setup | Pending final verification | `scripts/private-alpha-setup.mjs` and `pnpm alpha:check` |
| Redacted authenticated diagnostics | Pending final verification | `pnpm alpha:doctor` |
| Reproducible commit-addressed package | Pending final bundle | `pnpm alpha:bundle` |
| Tester/operator/support/incident runbooks | Pending final verification | `docs/private-alpha/` |
| Aggregate-only metrics path | Pending final verification | `pnpm alpha:metrics -- docs/private-alpha/alpha-observations.example.jsonl` |
| Full inherited release gate | Pending final verification | `pnpm verify` on the entry commit |

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
