# Private Alpha support and incident response

## Safe support intake

Ask the tester for:

- release version and commit from the bundle JSON;
- operating system, Node major version, pnpm major version, and MCP client/version;
- the complete output of `pnpm alpha:doctor`;
- the failed step, safe error code, and whether retry changed the result.

Do not ask for `.env`, token values, authorization headers, database URLs, raw MCP requests,
capsule/checkpoint bodies, private repository files, or chat exports. Move product feedback that
needs prose into an access-controlled tracker; do not place it in the aggregate metrics JSONL.

## Severity and action

| Severity | Examples | Immediate action |
| --- | --- | --- |
| SEV-1 | Confirmed cross-principal access, credential exposure, destructive execution, broad data corruption | Stop the alpha, revoke/rotate affected credentials, preserve redacted evidence, notify the product owner immediately |
| SEV-2 | Silent record loss, repeatable incorrect authorization, unrecoverable migration failure, sustained outage blocking most testers | Pause invitations and affected use, preserve evidence, assign an owner and mitigation before resuming |
| SEV-3 | Recoverable setup/client incompatibility, actionable error-quality failure, isolated performance regression | Triage within one operating day and document workaround/fix version |
| SEV-4 | Documentation question or cosmetic issue | Add to the normal alpha backlog |

Every incident record contains a random incident ID, opened/closed time, release commit, severity,
affected surface count, safe symptom/error code, containment, root cause, corrective action, owner,
and status. It must not contain secrets or project content.

## Containment and recovery

1. Stop affected Relay/tunnel processes and pause new invitations.
2. For suspected credential exposure, revoke tunnel access or OAuth tokens, rotate local/hosted
   credentials, and restart clients. Never paste replacement values into the incident record.
3. Preserve the release ZIP/checksum, commit, allowlisted logs, and database backup metadata. Do not
   copy a participant database without explicit opt-in and a reviewed secure transfer path.
4. Reproduce with synthetic records and a separate principal. Add a regression test before release.
5. Ship a new prerelease version and bundle; never replace an already distributed ZIP in place.
6. Resume only after SEV-1/2 containment is verified and the product owner accepts the residual risk.

No Public Beta review may pass with an unresolved SEV-1 or SEV-2 incident.
