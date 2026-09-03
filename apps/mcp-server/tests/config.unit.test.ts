import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { LIMITS } from "../../../packages/contracts/src/index.js";
import { DevTokenAuthenticator } from "../src/auth.js";
import { loadHttpConfig, loadTunnelConfig } from "../src/config.js";

describe("Relay runtime configuration", () => {
  it("uses loopback and bounded defaults", () => {
    const config = loadHttpConfig({});
    expect(config).toEqual({
      host: "127.0.0.1",
      port: 8787,
      authMode: "dev",
      persistence: "sqlite",
      databasePath: resolve(".data/relay.db"),
      requestByteLimit: LIMITS.requestBytes,
      rateLimitPerMinute: 120,
    });
  });

  it("requires explicit trusted stdio identity", () => {
    expect(() => loadTunnelConfig({})).toThrow(/RELAY_TUNNEL_PRINCIPAL/);
    expect(loadTunnelConfig({ RELAY_TUNNEL_PRINCIPAL: " relay-local-user " })).toEqual({
      principalRef: "relay-local-user",
      databasePath: resolve(".data/relay.db"),
    });
  });

  it("requires a real development credential mapping", async () => {
    expect(() => DevTokenAuthenticator.fromEnvironment({})).toThrow(/requires/);
    const token = "runtime-test-token-1234567890";
    const authenticator = DevTokenAuthenticator.fromEnvironment({
      RELAY_DEV_TOKEN: token,
      RELAY_DEV_PRINCIPAL: "principal-a",
    });
    await expect(authenticator.authenticate(`Bearer ${token}`)).resolves.toMatchObject({
      principalRef: "principal-a",
      scopes: new Set(["relay:read", "relay:write"]),
    });
  });

  it("fails closed when OAuth configuration is incomplete or unsafe", () => {
    expect(() => loadHttpConfig({ RELAY_AUTH_MODE: "oauth" })).toThrow(/RELAY_OAUTH_ISSUER/);
    expect(() =>
      loadHttpConfig({
        RELAY_AUTH_MODE: "oauth",
        RELAY_OAUTH_ISSUER: "http://identity.example.test",
        RELAY_OAUTH_RESOURCE: "https://relay.example.test/mcp",
        RELAY_OAUTH_JWKS_URI: "https://identity.example.test/jwks.json",
      }),
    ).toThrow(/HTTPS/);
    expect(() =>
      loadHttpConfig({
        RELAY_AUTH_MODE: "oauth",
        RELAY_OAUTH_ISSUER: "https://identity.example.test",
        RELAY_OAUTH_RESOURCE: "https://relay.example.test/mcp",
        RELAY_OAUTH_JWKS_URI: "https://identity.example.test/jwks.json",
        RELAY_OAUTH_TENANT_CLAIM: "unsafe claim",
      }),
    ).toThrow(/safe JWT claim name/);
  });

  it("requires a PostgreSQL URL and keeps secure TLS as the default", () => {
    expect(() => loadHttpConfig({ RELAY_PERSISTENCE: "postgres" })).toThrow(/RELAY_DATABASE_URL/);
    const config = loadHttpConfig({
      RELAY_PERSISTENCE: "postgres",
      RELAY_DATABASE_URL: "postgresql://database.example.test/relay",
    });
    expect(config.persistence).toBe("postgres");
    expect(config.databaseUrl).toContain("database.example.test/relay");
    expect(config.postgresSslMode).toBe("verify-full");
    expect(() =>
      loadHttpConfig({
        RELAY_PERSISTENCE: "postgres",
        RELAY_DATABASE_URL: "postgresql://database.example.test/relay?sslmode=disable",
      }),
    ).toThrow(/RELAY_POSTGRES_SSL_MODE/);
  });
});
