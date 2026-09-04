# Relay Open Alpha

## Release objective

Recruit Relay's first 10–20 real participants from the public developer community without
pretending that the unmeasured release is a Public Beta. Open Alpha changes how participants find
and evaluate Relay; it does not broaden the Relay product, host a public MCP endpoint, or weaken
the Private Alpha evidence gates.

## Scope

- Publish a commit-addressed GitHub prerelease with its source ZIP, SHA-256 checksum, release
  record, setup instructions, known limitations, and rollback guidance.
- Provide a public, structured application form that requests only compatibility and study-fit
  information.
- Provide a public, structured result form containing only the numeric and boolean Alpha outcomes.
- Provide public non-security support and a private vulnerability-reporting route.
- Enroll compatible participants in small batches until 10–20 complete the bounded study.
- Continue using the pre-registered thresholds and local aggregate metrics defined in
  `PRIVATE_ALPHA_SPEC.md`.

## Product and deployment boundary

- Relay still exposes exactly nine project-state tools. Open Alpha adds no product telemetry,
  recruitment tool, scheduler, autonomous loop, or remote-execution capability.
- The published package runs locally with SQLite and development authentication. It must not be
  placed directly on the public internet.
- The v0.2 OAuth/PostgreSQL foundation is not a hosted service. An internet-facing service still
  requires an authorization provider, managed secrets and storage, revocation, abuse controls,
  monitoring, backups, retention/deletion policy, and a dedicated privacy/threat review.
- GitHub usernames and public issue answers are public. Forms must warn applicants not to submit
  project content, credentials, private URLs, logs containing secrets, or confidential details.
- The local metrics dataset contains random participant references only. It must not contain
  GitHub usernames, application text, issue URLs, or free-form feedback.

## Open Alpha entry criteria

1. Every Private Alpha entry criterion remains passed on the exact release commit.
2. The public repository includes the Open Alpha overview, application, result, support, security,
   privacy, release, and operator materials validated by `pnpm open-alpha:check`.
3. Repository Issues and Discussions are enabled, and private vulnerability reporting is enabled
   before the release is announced.
4. The release is an immutable GitHub prerelease, not a stable release, and contains the matching
   ZIP, `.sha256`, and JSON release record.
5. A fresh checksum-verified extraction completes `node scripts/private-alpha-setup.mjs` within ten
   minutes on the supported Windows path.
6. The repository has an explicit owner-approved license before it is made public. License choice
   is a product/legal decision and must not be inferred by automation.

## Cohort operation

- Applications are public and do not guarantee enrollment. Prefer testers on the verified Windows
  path who can use two MCP-capable clients and complete the exercise within the study window.
- Enroll in batches of at most five so a severe support or safety pattern does not affect the full
  cohort before containment.
- Public result issues contain only the permitted numeric/boolean fields. The operator transcribes
  accepted results under newly generated random participant references in the ignored local JSONL
  dataset and never stores the GitHub identity mapping with metrics.
- Security reports use GitHub private vulnerability reporting. Suspected SEV-1 or SEV-2 incidents
  pause new enrollment and follow `docs/private-alpha/support-and-incidents.md`.
- Community posts may recruit participants but must not claim production readiness, universal
  compatibility, automatic transcript access, or measured value before real results exist.

## Public Beta gate

Open Alpha is the recruitment mechanism for the same Alpha study, not permission to skip it. Do
not label Relay a Public Beta until 10–20 real observations pass every pre-registered value gate,
the incident register has no unresolved SEV-1 or SEV-2 item, support patterns have dispositions,
and the owner signs the dated exit scorecard.
