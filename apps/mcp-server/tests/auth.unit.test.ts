import {
  SignJWT,
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  type CryptoKey,
  type JWK,
} from "jose";
import { beforeAll, describe, expect, it } from "vitest";
import { RelayError } from "../../../packages/domain/src/index.js";
import {
  OAuthTokenAuthenticator,
  RELAY_READ_SCOPE,
  RELAY_WRITE_SCOPE,
  requireScopes,
} from "../src/auth.js";

const issuer = "https://identity.example.test/";
const resource = "https://relay.example.test/mcp";
const keyId = "relay-test-key";

describe("Relay OAuth resource-server authentication", () => {
  let privateKey: CryptoKey;
  let publicJwk: JWK;

  beforeAll(async () => {
    const keyPair = await generateKeyPair("RS256", { extractable: true });
    privateKey = keyPair.privateKey;
    publicJwk = { ...(await exportJWK(keyPair.publicKey)), kid: keyId, alg: "RS256", use: "sig" };
  });

  const authenticator = (tenantClaim?: string): OAuthTokenAuthenticator =>
    new OAuthTokenAuthenticator(
      {
        issuer,
        resource,
        jwksUri: `${issuer}.well-known/jwks.json`,
        ...(tenantClaim ? { tenantClaim } : {}),
      },
      { keyResolver: createLocalJWKSet({ keys: [publicJwk] }) },
    );

  const token = async (
    overrides: {
      issuer?: string;
      audience?: string;
      subject?: string;
      scope?: string;
      tenant?: string;
      expirationTime?: number;
      notBefore?: number;
    } = {},
  ): Promise<string> => {
    let builder = new SignJWT({
      scope: overrides.scope ?? `${RELAY_READ_SCOPE} ${RELAY_WRITE_SCOPE}`,
      ...(overrides.tenant ? { tenant_id: overrides.tenant } : {}),
    })
      .setProtectedHeader({ alg: "RS256", kid: keyId })
      .setIssuer(overrides.issuer ?? issuer)
      .setAudience(overrides.audience ?? resource)
      .setIssuedAt()
      .setExpirationTime(overrides.expirationTime ?? Math.floor(Date.now() / 1000) + 300);
    if (overrides.subject !== "") builder = builder.setSubject(overrides.subject ?? "user-123");
    if (overrides.notBefore !== undefined) builder = builder.setNotBefore(overrides.notBefore);
    return await builder.sign(privateKey);
  };

  it("verifies tokens and derives a stable opaque tenant-scoped principal", async () => {
    const auth = authenticator("tenant_id");
    const first = await auth.authenticate(`Bearer ${await token({ tenant: "tenant-a" })}`);
    const second = await auth.authenticate(`Bearer ${await token({ tenant: "tenant-a" })}`);
    const otherTenant = await auth.authenticate(`Bearer ${await token({ tenant: "tenant-b" })}`);
    const otherSubject = await auth.authenticate(
      `Bearer ${await token({ tenant: "tenant-a", subject: "user-456" })}`,
    );

    expect(first.principalRef).toMatch(/^oauth:[a-f0-9]{64}$/);
    expect(second.principalRef).toBe(first.principalRef);
    expect(otherTenant.principalRef).not.toBe(first.principalRef);
    expect(otherSubject.principalRef).not.toBe(first.principalRef);
    expect(first.scopes).toEqual(new Set([RELAY_READ_SCOPE, RELAY_WRITE_SCOPE]));
  });

  it.each([
    ["wrong issuer", { issuer: "https://attacker.example.test/" }],
    ["wrong audience", { audience: "https://other.example.test/mcp" }],
    ["expired token", { expirationTime: Math.floor(Date.now() / 1000) - 60 }],
    ["future token", { notBefore: Math.floor(Date.now() / 1000) + 60 }],
    ["missing subject", { subject: "" }],
  ])("rejects a %s", async (_label, overrides) => {
    await expect(
      authenticator().authenticate(`Bearer ${await token(overrides)}`),
    ).rejects.toMatchObject({
      code: "AUTHENTICATION_REQUIRED",
    });
  });

  it("requires the configured tenant claim and enforces tool scopes", async () => {
    await expect(
      authenticator("tenant_id").authenticate(`Bearer ${await token()}`),
    ).rejects.toMatchObject({ code: "AUTHENTICATION_REQUIRED" });

    const readOnly = await authenticator().authenticate(
      `Bearer ${await token({ scope: RELAY_READ_SCOPE })}`,
    );
    expect(() => requireScopes(readOnly, [RELAY_READ_SCOPE])).not.toThrow();
    expect(() => requireScopes(readOnly, [RELAY_WRITE_SCOPE])).toThrowError(RelayError);
  });

  it("rejects malformed and unsigned bearer values", async () => {
    await expect(authenticator().authenticate("Bearer not-a-jwt")).rejects.toMatchObject({
      code: "AUTHENTICATION_REQUIRED",
    });
    await expect(authenticator().authenticate("Bearer e30.e30.")).rejects.toMatchObject({
      code: "AUTHENTICATION_REQUIRED",
    });
  });

  it("publishes protected-resource metadata and an RFC-style challenge", () => {
    const auth = authenticator();
    expect(auth.protectedResourceMetadata()).toEqual({
      resource,
      authorization_servers: [issuer],
      scopes_supported: [RELAY_READ_SCOPE, RELAY_WRITE_SCOPE],
    });
    expect(auth.challenge([RELAY_READ_SCOPE], "insufficient_scope")).toContain(
      'resource_metadata="https://relay.example.test/.well-known/oauth-protected-resource"',
    );
    expect(auth.challenge([RELAY_READ_SCOPE], "insufficient_scope")).toContain(
      'error="insufficient_scope"',
    );
  });
});
