# Manual ChatGPT Work → Codex → ChatGPT Work acceptance

The automated end-to-end test proves the same state transition over the real Streamable HTTP
transport and across restart. This procedure is the required external acceptance run through the
actual OpenAI surfaces.

## Preconditions

- `pnpm verify` passes from a clean checkout.
- Relay HTTP and `tunnel-client` are running as described in
  [setup-windows.md](setup-windows.md).
- The HTTP and stdio adapters use the same absolute `RELAY_DATABASE_PATH`.
- `RELAY_DEV_PRINCIPAL` and `RELAY_TUNNEL_PRINCIPAL` are identical.
- Codex can list the Relay MCP server.
- ChatGPT Work developer mode shows the connected Relay tunnel and all nine tools.
- No credential, hidden system message, or hidden tool message is placed in any capsule.

Use a fresh `relay-bootstrap` database state, or use new idempotency keys if repeating the script.

## Part 1: ChatGPT Work

With the development Relay connection enabled, say exactly:

> Create or select the project `relay-bootstrap`. Create a durable handoff for Codex using the current discussion. Include the objective, the explicit-capsule decision, the v0.1 exclusions, all acceptance criteria, and the next action. Do not include credentials or hidden messages.

Record:

| Item | Observed value |
| --- | --- |
| Project ID | |
| Handoff ID | |
| Handoff version | |

Pass when the project is `Relay Bootstrap`, the handoff is a compact explicit capsule, and the
response does not claim to have imported the whole conversation.

## Part 2: Codex

With the authenticated Relay server enabled for Codex, say exactly:

> Retrieve the standard project context for `relay-bootstrap`. Before changing code, restate the objective, active constraints, acceptance criteria, and recommended next action. Then make one small, real, verified repository improvement and create a Relay checkpoint containing the changed files and actual verification result.

Record:

| Item | Observed value |
| --- | --- |
| Retrieved handoff ID/version | |
| Changed file(s) | |
| Verification command/procedure | |
| Observed result/time | |
| Checkpoint ID/sequence | |

Pass when the restatement matches the handoff, the repository diff is real, the recorded
verification was actually run, and the checkpoint contains those exact file/result details.

## Part 3: ChatGPT Work

Return to ChatGPT Work and say exactly:

> Retrieve the latest Relay Bootstrap project context and explain what Codex changed, what verification actually ran, whether anything is blocked, and what we should do next.

Compare the answer with the repository diff and observed test output.

## Scorecard

| Criterion | Pass condition | Result |
| --- | --- | --- |
| Work → Codex continuity | Codex retrieves the capsule without pasted transcript or shared local file | |
| Codex → Work continuity | Work retrieves the checkpoint without manual status transcription | |
| Fidelity | Objective, constraints, criteria, changed files, and verification remain accurate | |
| Isolation | A second configured principal sees no project and cannot retrieve IDs | |
| Durability | Stop/restart Relay; the same records remain retrievable | |
| Idempotency | Repeat identical mutations; IDs/counts do not change | |
| Safety | No scraping, undocumented API, arbitrary execution tool, or credential leakage | |
| Reproducibility | Windows clean-checkout commands pass | |

All rows must pass. Preserve the project, handoff, and checkpoint IDs with the test record, but do
not record tokens, API keys, authorization headers, or capsule bodies in logs.
