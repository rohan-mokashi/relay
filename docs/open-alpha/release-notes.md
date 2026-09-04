# Relay 0.4.0-alpha.3

Relay `0.4.0-alpha.3` is the first publicly recruited Open Alpha candidate. It retains the exact
nine-tool Relay MCP contract and the verified local-first architecture from `0.4.0-alpha.2` while
adding public intake, support, privacy, security-reporting, and launch controls.

## Included

- One-command, non-destructive local setup for the supported Windows path.
- Redacted diagnostics that prove authentication and exact nine-tool discovery.
- SQLite local persistence, development authentication, and the existing OAuth/PostgreSQL
  foundation.
- VS Code, Codex, and ChatGPT Work integration runbooks.
- Structured public application and result forms.
- Aggregate-only local Alpha metrics and pre-registered exit thresholds.
- Public support guidance and a private security-reporting route.

## Known limitations

- Windows with Node.js 24 and pnpm 11 is the verified Open Alpha path.
- Relay is distributed as source and is not a hosted service.
- Development authentication must never be exposed on the public internet.
- ChatGPT Work connectivity requires its documented Secure MCP Tunnel development path.
- No product telemetry is collected; result submission is deliberate and separate.
- Public Beta value, support, and safety gates have not yet been evaluated with real participants.

## Install

Download the ZIP, `.sha256`, and JSON record from the same GitHub prerelease. Verify the SHA-256
checksum, extract the ZIP, and run this from its `relay` directory:

```powershell
node scripts/private-alpha-setup.mjs
```

Continue with [docs/open-alpha/README.md](README.md) and
[docs/private-alpha/tester-quickstart.md](../private-alpha/tester-quickstart.md).

## Rollback and removal

Stop any Relay or tunnel processes and remove the extracted directory. Relay does not install a
system service. Local records live at the configured `RELAY_DATABASE_PATH`; back up or delete that
file separately according to the tester's own data-retention choice. Never publish `.env` or a
database while requesting support.

