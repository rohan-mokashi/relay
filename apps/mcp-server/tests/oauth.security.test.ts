import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair } from "jose";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createTestSystem,
  projectInput,
  type TestSystem,
} from "../../../packages/test-support/src/index.js";
import { OAuthTokenAuthenticator, RELAY_READ_SCOPE, RELAY_WRITE_SCOPE } from "../src/auth.js";
import { createRelayHttpServer, type RelayHttpServer } from "../src/http.js";
import { SafeLogger } from "../src/logger.js";
import { PrincipalRateLimiter } from "../src/rate-limit.js";

const issuer = "https://identity.example.test/";
const resource = "https://relay.example.test/mcp";

describe("Relay OAuth HTTP enforcement", () => {
  let system: TestSystem;
  let relay: RelayHttpServer;
  let url: string;
  let sign: (scope: string) => Promise<string>;

  beforeEach(async () => {
    const keyPair = await generateKeyPair("RS256", { extractable: true });
    const publicJwk = {
      ...(await exportJWK(keyPair.publicKey)),
      kid: "oauth-http-test",
      alg: "RS256",
      use: "sig",
    };
    sign = async (scope) =>
      await new SignJWT({ scope })
        .setProtectedHeader({ alg: "RS256", kid: "oauth-http-test" })
        .setIssuer(issuer)
        .setAudience(resource)
        .setSubject("user-123")
        .setIssuedAt()
        .setExpirationTime("5m")
        .sign(keyPair.privateKey);

    system = createTestSystem();
    relay = createRelayHttpServer({
      service: system.service,
      authenticator: new OAuthTokenAuthenticator(
        { issuer, resource, jwksUri: `${issuer}.well-known/jwks.json` },
        { keyResolver: createLocalJWKSet({ keys: [publicJwk] }) },
      ),
      logger: new SafeLogger(() => undefined),
      rateLimiter: new PrincipalRateLimiter(1_000),
    });
    ({ url } = await relay.listen(0, "127.0.0.1"));
  });

  afterEach(async () => {
    await relay.close();
    system.dispose();
  });

  it("serves discovery metadata without a token", async () => {
    const response = await fetch(new URL("/.well-known/oauth-protected-resource", url));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      resource,
      authorization_servers: [issuer],
      scopes_supported: [RELAY_READ_SCOPE, RELAY_WRITE_SCOPE],
    });
  });

  it("accepts a valid read-scoped token on authenticated endpoints", async () => {
    const response = await fetch(new URL("/healthz", url), {
      headers: { authorization: `Bearer ${await sign(RELAY_READ_SCOPE)}` },
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
  });

  it("rejects invalid tokens and read-only mutation attempts with discoverable challenges", async () => {
    const invalid = await fetch(url, {
      method: "POST",
      headers: { authorization: "Bearer not-a-jwt", "content-type": "application/json" },
      body: "{}",
    });
    expect(invalid.status).toBe(401);
    expect(invalid.headers.get("www-authenticate")).toContain("resource_metadata=");

    const readOnlyToken = await sign(RELAY_READ_SCOPE);
    const mutation = await fetch(url, {
      method: "POST",
      headers: {
        authorization: `Bearer ${readOnlyToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: "upsert_project", arguments: projectInput() },
      }),
    });
    expect(mutation.status).toBe(403);
    const challenge = mutation.headers.get("www-authenticate");
    expect(challenge).toContain('error="insufficient_scope"');
    expect(challenge).toContain('scope="relay:read relay:write"');
    expect(system.repository.countRowsForTesting("projects")).toBe(0);
  });

  it("requires write scope for mutations hidden inside JSON-RPC batches", async () => {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        authorization: `Bearer ${await sign(RELAY_READ_SCOPE)}`,
        "content-type": "application/json",
      },
      body: JSON.stringify([
        { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} },
        {
          jsonrpc: "2.0",
          id: 2,
          method: "tools/call",
          params: { name: "upsert_project", arguments: projectInput() },
        },
      ]),
    });
    expect(response.status).toBe(403);
    expect(system.repository.countRowsForTesting("projects")).toBe(0);
  });
});
