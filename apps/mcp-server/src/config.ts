import { resolve } from "node:path";
import { LIMITS } from "../../../packages/contracts/src/index.js";

const positiveInteger = (value: string | undefined, fallback: number, name: string): number => {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65_535) {
    throw new Error(`${name} must be a positive integer no greater than 65535.`);
  }
  return parsed;
};

export interface HttpConfig {
  host: string;
  port: number;
  databasePath: string;
  requestByteLimit: number;
  rateLimitPerMinute: number;
}

export interface TunnelConfig {
  principalRef: string;
  databasePath: string;
}

export const loadHttpConfig = (environment: NodeJS.ProcessEnv): HttpConfig => ({
  host: environment.RELAY_HOST?.trim() || "127.0.0.1",
  port: positiveInteger(environment.RELAY_PORT, 8787, "RELAY_PORT"),
  databasePath: resolve(environment.RELAY_DATABASE_PATH?.trim() || ".data/relay.db"),
  requestByteLimit: LIMITS.requestBytes,
  rateLimitPerMinute: positiveInteger(
    environment.RELAY_RATE_LIMIT_PER_MINUTE,
    120,
    "RELAY_RATE_LIMIT_PER_MINUTE",
  ),
});

export const loadTunnelConfig = (environment: NodeJS.ProcessEnv): TunnelConfig => {
  const principalRef = environment.RELAY_TUNNEL_PRINCIPAL?.trim();
  if (!principalRef) {
    throw new Error(
      "RELAY_TUNNEL_PRINCIPAL is required for trusted stdio use through Secure MCP Tunnel.",
    );
  }
  return {
    principalRef,
    databasePath: resolve(environment.RELAY_DATABASE_PATH?.trim() || ".data/relay.db"),
  };
};
