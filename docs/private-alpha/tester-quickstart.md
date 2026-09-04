# Alpha tester quickstart

This path is for enrolled developers using the local SQLite/dev-auth topology. It keeps credentials
and project content on the tester's machine. Do not use it as a public or internet-facing service.

## Reach a working connection in under ten minutes

1. Start a timer when the Relay ZIP is downloaded or the repository is cloned. Verify a distributed
   ZIP against its adjacent `.sha256` file before extracting it.
2. Install Node.js 24 LTS and pnpm 11 if they are not already present.
3. From the extracted `relay` folder, run:

   ```powershell
   node scripts/private-alpha-setup.mjs
   ```

   The command preserves an existing `.env`. Otherwise it creates an ignored random local token
   and principal without printing them, installs locked dependencies, migrates SQLite, and runs the
   redacted doctor.
4. Open the folder in Visual Studio Code. Run **MCP: List Servers**, select `relay`, and start it if
   needed. Review the checked-in command before trusting it. In Agent mode, confirm nine Relay tools.
5. Stop the timer when the agent successfully calls `list_projects`. Record only the elapsed minutes
   in the alpha observation; never paste `.env` or its values into chat or feedback.

If the doctor fails, run `pnpm alpha:doctor` once more and follow
[support-and-incidents.md](support-and-incidents.md). Do not bypass authentication or make the HTTP
listener public to get around an error.

## Exercise the continuity loop

Use two configured MCP client surfaces that share the same ignored `RELAY_DATABASE_PATH` and
`RELAY_TUNNEL_PRINCIPAL`. Visual Studio Code can be one surface; use the matching root `.mcp.json`
or the authenticated HTTP instructions in [../setup-windows.md](../setup-windows.md) for the other.

In the first client, say:

> Create or select project `alpha-<your-random-project-label>`. Create a durable handoff with the
> current objective, decisions, constraints, open questions, acceptance criteria, and next action.
> Include no credential, hidden message, or raw transcript.

Start a second timer, then in the receiving client say only:

> Retrieve the standard Relay context for `alpha-<your-random-project-label>`, restate the objective,
> constraints, acceptance criteria, and next action, then identify any missing information.

Stop that timer when the correct project context is displayed. Complete one real bounded task,
record an evidence-backed checkpoint, and retrieve it from the first client. Use a second real
project during the study window only if you genuinely choose to; do not do it solely to improve
the metric.

## Submit the observation

Give the operator only the numeric/boolean fields defined in [metrics.md](metrics.md) under the
random participant reference they assigned. Do not submit project names, capsule text, repository
paths, chat links, identity, credentials, or free-form notes in the metrics file. Product feedback
and support reports use the separate redacted process in
[support-and-incidents.md](support-and-incidents.md).
