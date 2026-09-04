# Private Alpha metrics

Relay does not send telemetry. The operator collects a deliberately small, local JSONL dataset
containing numeric and boolean outcomes only. Project content, tool payloads, identities,
credentials, URLs, paths, and free-form notes are prohibited.

## Observation schema

Each participant contributes one final line with:

| Field | Definition |
| --- | --- |
| `participant_ref` | Random study pseudonym; never an email, username, or project name |
| `recorded_at` | UTC ISO 8601 time of the final observation |
| `onboarding_minutes` | Start of download/clone to first successful authenticated `list_projects` call |
| `continuation_minutes` | Receiving-client prompt sent to correct Relay context displayed |
| `repeated_context_items` | Facts the tester had to restate because the retrieved capsule lacked them |
| `incorrect_assumptions` | Receiving-agent assumptions attributable to missing or wrong Relay context |
| `acceptance_criteria_total` | Declared criteria evaluated during the bounded task |
| `acceptance_criteria_completed` | Criteria correctly completed and verified |
| `trust_rating` | Tester rating from 1 (no trust) to 5 (high trust) |
| `returned_for_second_project` | Genuine voluntary use on a second project during the study window |
| `support_requests` | Number of operator support contacts during onboarding/use |

The schema rejects unknown fields, impossible criterion counts, malformed timestamps, duplicate
participant references, and cohorts whose lines cannot be validated. See
`alpha-observations.example.jsonl` for synthetic formatting only.

## Aggregate command and gates

Store real observations only in the ignored `.data` directory, then run:

```powershell
pnpm alpha:metrics -- .data/alpha-observations.jsonl
```

The output contains no participant references. It reports the cohort count, onboarding and
continuation success rates, zero-incorrect-assumption rate, aggregate acceptance-criterion
completion, average trust, repeat usage, support volume, each threshold, and `value_gate_passed`.

The pre-registered thresholds are 10–20 participants, 80% onboarded within 10 minutes, 70%
continued within 1 minute, 80% with zero incorrect assumptions, 80% criteria completion, average
trust of 4/5, and 50% voluntary repeat usage. Do not tune these thresholds after seeing results.
A miss is product evidence, not a reason to edit or discard participant rows.

Operational logs may separately aggregate allowlisted tool name, status, duration, byte count, and
safe error code. Never join those logs to participant identity or include capsule bodies. Value
metrics and incident/safety review must both pass; neither substitutes for the other.
