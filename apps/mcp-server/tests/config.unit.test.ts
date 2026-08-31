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

  it("requires a real development credential mapping", () => {
    expect(() => DevTokenAuthenticator.fromEnvironment({})).toThrow(/requires/);
    const token = "runtime-test-token-1234567890";
    const authenticator = DevTokenAuthenticator.fromEnvironment({
      RELAY_DEV_TOKEN: token,
      RELAY_DEV_PRINCIPAL: "principal-a",
    });
    expect(authenticator.authenticate(`Bearer ${token}`)).toBe("principal-a");
  });
});
