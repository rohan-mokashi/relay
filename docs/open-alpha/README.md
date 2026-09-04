# Relay Open Alpha

Relay is looking for 10–20 developers to evaluate whether a structured MCP handoff can preserve
the important state of a project across two AI clients. The software runs locally; this is an
experimental Alpha, not a hosted service or production-ready Public Beta.

## What participants do

1. Apply through the repository's **Join Relay Open Alpha** issue form. Application answers and
   the applicant's GitHub username are public, so do not include confidential information.
2. If enrolled, download the exact GitHub prerelease ZIP and its adjacent checksum and release
   record. Verify the checksum before extracting the archive.
3. On Windows with Node.js 24 and pnpm 11, run:

   ```powershell
   node scripts/private-alpha-setup.mjs
   ```

4. Follow the [tester quickstart](../private-alpha/tester-quickstart.md) with two MCP-capable
   clients. Store only synthetic or non-confidential project context during the study.
5. Submit the numeric and boolean outcomes through **Submit an Open Alpha result**. Result issues
   are public. Never include capsule text, project names, repository paths, credentials, private
   URLs, chat exports, or free-form project details.

Expected participant time is approximately 20–30 minutes for initial setup and the first bounded
handoff. A later voluntary second-project use is measured separately and must never be fabricated
to improve the result.

## Privacy and safety

Relay has no product telemetry. The operator copies accepted numeric/boolean results into an
ignored local dataset under a newly generated random reference; GitHub usernames and issue URLs
are not included in that dataset. Application and result issues remain subject to GitHub's public
visibility and retention behavior.

Use the repository's **Relay support report** for ordinary setup defects. Do not post security
vulnerabilities, credentials, tokens, private project content, or suspected cross-principal access
in a public issue. Use GitHub's private vulnerability-reporting route described in
[SECURITY.md](../../SECURITY.md).

## What Open Alpha does not mean

- Relay does not read ChatGPT history or synchronize hidden memory.
- Relay does not control Codex or execute repository work.
- Development credentials and the local SQLite path are not suitable for public hosting.
- Participation does not imply that the Public Beta gate has passed.

The exact boundaries and gates are recorded in [OPEN_ALPHA_SPEC.md](../../OPEN_ALPHA_SPEC.md).

