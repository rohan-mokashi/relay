# Relay v0.3 Independent-Client Interoperability

## Release objective

Prove that Relay's existing MCP contract works from a second, independently implemented MCP
client without adding client-specific product behavior. The selected v0.3 client is Visual Studio
Code because it is installed in the development environment and supports standard MCP stdio
servers through a portable workspace configuration.

v0.3 is an interoperability milestone. It is not the Private Alpha, a workflow orchestrator, or a
self-prompting system.

## Scope

- Provide a portable root `.mcp.json` that Visual Studio Code and compatible agent hosts can use.
- Launch the existing trusted local stdio adapter with repository-local dependencies.
- Expose the same nine tools and strict schemas already used by ChatGPT Work and Codex.
- Store Visual Studio Code-created records in the same configured database and principal scope.
- Add automated configuration, process-boundary, discovery, write, restart, and read checks.
- Provide an exact manual acceptance procedure for the real Visual Studio Code agent host.

## Non-goals

- Client-specific domain records, tools, schemas, or authorization rules.
- Queues, schedulers, leases, workers, autonomous loops, or self-prompting inside Relay.
- Installing or purchasing another client when an appropriate independent client is available.
- Treating an SDK test harness as proof that the real independent client invoked Relay.
- Starting Private Alpha or Public Beta work before this milestone's release gate passes.

## Security and portability constraints

- The portable client configuration contains no bearer token, API key, credential, or fixed user
  identity.
- The local stdio adapter still fails closed unless `RELAY_TUNNEL_PRINCIPAL` is supplied by the
  operator's ignored `.env` file or process environment.
- `RELAY_DATABASE_PATH` and `RELAY_TUNNEL_PRINCIPAL` must match the other local Relay surfaces
  when testing shared continuity.
- Visual Studio Code is an untrusted caller at the MCP boundary. Tool inputs receive the same
  runtime validation, authorization scope, immutability, audit, and idempotency behavior as every
  other client.
- Stored text remains untrusted data and cannot control Relay or the repository.

## Acceptance criteria

1. The checked-in root `.mcp.json` is valid portable MCP configuration and contains no secret.
2. A fresh process launched from that configuration discovers exactly the documented nine Relay
   tools.
3. That process can create a project and handoff, terminate, restart, and retrieve the same state
   through the real stdio transport.
4. The real Visual Studio Code agent host starts and trusts the configured Relay server, discovers
   all nine tools, performs a mutation, and retrieves the resulting context.
5. A previously configured Relay surface can retrieve the Visual Studio Code-created record from
   the same database without manual transcription.
6. Client identity does not weaken principal isolation, idempotency, immutable records, input
   limits, or safe logging.
7. The full v0.1 and v0.2 verification suite remains green, including secret scanning and the
   dependency audit.

## Release gate

Automated checks establish configuration and protocol compatibility but do not alone complete
v0.3. The milestone passes only when the real Visual Studio Code run and cross-client retrieval are
observed and recorded using `docs/v0.3-interoperability-acceptance.md`. Only then may work move to
the Private Alpha milestone.
