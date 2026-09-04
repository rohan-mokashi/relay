# Security policy

Relay Open Alpha is experimental local software. Do not test it with confidential project content
or expose its development-authenticated server to the public internet.

## Report a vulnerability privately

Use [GitHub private vulnerability reporting](https://github.com/rohan-mokashi/relay/security/advisories/new)
for suspected cross-principal access, credential exposure, authentication or authorization
bypass, silent record loss, destructive behavior, or another security weakness.

Do not open a public issue containing a vulnerability, bearer token, `.env`, authorization header,
database URL, raw capsule, private repository content, or chat export. If a credential may have
been exposed, revoke or rotate it immediately and include no replacement value in the report.

Ordinary setup and compatibility defects may use the repository's **Relay support report** form
after confirming its diagnostic content is safe to publish.

## Supported release

Security fixes target the newest GitHub prerelease. Already published prerelease artifacts are
immutable; any fix receives a new version, commit, checksum, and release record.

