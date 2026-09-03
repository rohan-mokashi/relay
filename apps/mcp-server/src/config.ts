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
  authMode: "dev" | "oauth";
  oauth?: OAuthConfig;
  persistence: "sqlite" | "postgres";
  databasePath: string;
  databaseUrl?: string;
  postgresSslMode?: "verify-full" | "require" | "disable";
  requestByteLimit: number;
  rateLimitPerMinute: number;
}

export interface OAuthConfig {
  issuer: string;
  resource: string;
  jwksUri: string;
  tenantClaim?: string;
  documentationUrl?: string;
}

export interface TunnelConfig {
  principalRef: string;
  databasePath: string;
}

const enumValue = <T extends string>(
  value: string | undefined,
  allowed: readonly T[],
  fallback: T,
  name: string,
): T => {
  const normalized = value?.trim().toLowerCase() || fallback;
  if (!allowed.includes(normalized as T)) {
    throw new Error(`${name} must be one of: ${allowed.join(", ")}.`);
  }
  return normalized as T;
};

const required = (environment: NodeJS.ProcessEnv, name: string): string => {
  const value = environment[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
};

const secureUrl = (value: string, name: string): string => {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must be an absolute HTTPS URL.`);
  }
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) {
    throw new Error(
      `${name} must be an absolute HTTPS URL without credentials, query, or fragment.`,
    );
  }
  return url.href;
};

const postgresConnectionUrl = (value: string): string => {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("RELAY_DATABASE_URL must be a PostgreSQL connection URL.");
  }
  if (!["postgres:", "postgresql:"].includes(url.protocol) || !url.hostname || url.hash) {
    throw new Error("RELAY_DATABASE_URL must be a PostgreSQL connection URL.");
  }
  for (const parameter of ["sslmode", "sslcert", "sslkey", "sslrootcert"]) {
    if (url.searchParams.has(parameter)) {
      throw new Error(
        `RELAY_DATABASE_URL must not set ${parameter}; use RELAY_POSTGRES_SSL_MODE instead.`,
      );
    }
  }
  return value;
};

const loadOAuthConfig = (environment: NodeJS.ProcessEnv): OAuthConfig => {
  const tenantClaim = environment.RELAY_OAUTH_TENANT_CLAIM?.trim();
  if (tenantClaim && !/^[A-Za-z][A-Za-z0-9_.:-]{0,63}$/.test(tenantClaim)) {
    throw new Error("RELAY_OAUTH_TENANT_CLAIM must be a safe JWT claim name.");
  }
  const documentationValue = environment.RELAY_OAUTH_DOCUMENTATION_URL?.trim();
  return {
    issuer: secureUrl(required(environment, "RELAY_OAUTH_ISSUER"), "RELAY_OAUTH_ISSUER"),
    resource: secureUrl(required(environment, "RELAY_OAUTH_RESOURCE"), "RELAY_OAUTH_RESOURCE"),
    jwksUri: secureUrl(required(environment, "RELAY_OAUTH_JWKS_URI"), "RELAY_OAUTH_JWKS_URI"),
    ...(tenantClaim ? { tenantClaim } : {}),
    ...(documentationValue
      ? {
          documentationUrl: secureUrl(documentationValue, "RELAY_OAUTH_DOCUMENTATION_URL"),
        }
      : {}),
  };
};

export const loadHttpConfig = (environment: NodeJS.ProcessEnv): HttpConfig => {
  const authMode = enumValue(
    environment.RELAY_AUTH_MODE,
    ["dev", "oauth"],
    "dev",
    "RELAY_AUTH_MODE",
  );
  const persistence = enumValue(
    environment.RELAY_PERSISTENCE,
    ["sqlite", "postgres"],
    "sqlite",
    "RELAY_PERSISTENCE",
  );
  const databaseUrlValue = environment.RELAY_DATABASE_URL?.trim();
  const postgresSslMode = enumValue(
    environment.RELAY_POSTGRES_SSL_MODE,
    ["verify-full", "require", "disable"],
    "verify-full",
    "RELAY_POSTGRES_SSL_MODE",
  );
  const databaseUrl = databaseUrlValue ? postgresConnectionUrl(databaseUrlValue) : undefined;
  if (persistence === "postgres") {
    if (!databaseUrl) {
      throw new Error(
        "RELAY_DATABASE_URL must be a PostgreSQL connection URL when RELAY_PERSISTENCE=postgres.",
      );
    }
  }

  return {
    host: environment.RELAY_HOST?.trim() || "127.0.0.1",
    port: positiveInteger(environment.RELAY_PORT, 8787, "RELAY_PORT"),
    authMode,
    ...(authMode === "oauth" ? { oauth: loadOAuthConfig(environment) } : {}),
    persistence,
    databasePath: resolve(environment.RELAY_DATABASE_PATH?.trim() || ".data/relay.db"),
    ...(persistence === "postgres" && databaseUrl ? { databaseUrl } : {}),
    ...(persistence === "postgres" ? { postgresSslMode } : {}),
    requestByteLimit: LIMITS.requestBytes,
    rateLimitPerMinute: positiveInteger(
      environment.RELAY_RATE_LIMIT_PER_MINUTE,
      120,
      "RELAY_RATE_LIMIT_PER_MINUTE",
    ),
  };
};

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
