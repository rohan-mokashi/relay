import { createHash, timingSafeEqual } from "node:crypto";
import { createRemoteJWKSet, errors as joseErrors, jwtVerify, type JWTVerifyGetKey } from "jose";
import { RelayError } from "../../../packages/domain/src/errors.js";
import type { OAuthConfig } from "./config.js";

export const RELAY_READ_SCOPE = "relay:read";
export const RELAY_WRITE_SCOPE = "relay:write";

const digest = (value: string): Buffer => createHash("sha256").update(value).digest();

const bearerToken = (header: string | string[] | undefined): string => {
  const value = Array.isArray(header) ? header[0] : header;
  const match = value?.match(/^Bearer ([^\s]+)$/i);
  if (!match?.[1]) {
    throw new RelayError("AUTHENTICATION_REQUIRED", "A valid Relay bearer credential is required.");
  }
  return match[1];
};

export interface AuthenticatedPrincipal {
  principalRef: string;
  scopes: ReadonlySet<string>;
}

export interface ProtectedResourceMetadata {
  resource: string;
  authorization_servers: string[];
  scopes_supported: string[];
  resource_documentation?: string;
}

export interface RelayAuthenticator {
  readonly mode: "dev" | "oauth";
  authenticate(header: string | string[] | undefined): Promise<AuthenticatedPrincipal>;
  challenge(scopes: readonly string[], error?: "invalid_token" | "insufficient_scope"): string;
  protectedResourceMetadata(): ProtectedResourceMetadata | undefined;
  securityScopes(): { read: string[]; write: string[] } | undefined;
}

export const requireScopes = (
  principal: AuthenticatedPrincipal,
  required: readonly string[],
): void => {
  const missing = required.filter((scope) => !principal.scopes.has(scope));
  if (missing.length > 0) {
    throw new RelayError("ACCESS_DENIED", "The bearer credential lacks a required Relay scope.");
  }
};

export class DevTokenAuthenticator implements RelayAuthenticator {
  readonly mode = "dev" as const;
  private readonly entries: Array<{ tokenDigest: Buffer; principalRef: string }>;

  constructor(tokens: ReadonlyMap<string, string>) {
    if (tokens.size === 0) {
      throw new Error(
        "Relay requires RELAY_DEV_TOKEN + RELAY_DEV_PRINCIPAL or RELAY_DEV_TOKENS_JSON.",
      );
    }
    this.entries = [...tokens.entries()].map(([token, principalRef]) => {
      if (token.length < 16)
        throw new Error("Relay development bearer tokens must be at least 16 characters.");
      if (!principalRef.trim()) throw new Error("Relay development principals cannot be empty.");
      return { tokenDigest: digest(token), principalRef: principalRef.trim() };
    });
  }

  static fromEnvironment(environment: NodeJS.ProcessEnv): DevTokenAuthenticator {
    const tokens = new Map<string, string>();
    const encoded = environment.RELAY_DEV_TOKENS_JSON?.trim();
    if (encoded) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(encoded);
      } catch {
        throw new Error("RELAY_DEV_TOKENS_JSON must be valid JSON.");
      }
      if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
        throw new Error("RELAY_DEV_TOKENS_JSON must be an object mapping tokens to principals.");
      }
      for (const [token, principal] of Object.entries(parsed)) {
        if (typeof principal !== "string") {
          throw new Error("Every RELAY_DEV_TOKENS_JSON value must be a principal string.");
        }
        tokens.set(token, principal);
      }
    }

    const token = environment.RELAY_DEV_TOKEN?.trim();
    const principal = environment.RELAY_DEV_PRINCIPAL?.trim();
    if (token || principal) {
      if (!token || !principal) {
        throw new Error("Set both RELAY_DEV_TOKEN and RELAY_DEV_PRINCIPAL.");
      }
      tokens.set(token, principal);
    }
    return new DevTokenAuthenticator(tokens);
  }

  async authenticate(header: string | string[] | undefined): Promise<AuthenticatedPrincipal> {
    const supplied = digest(bearerToken(header));
    for (const entry of this.entries) {
      if (timingSafeEqual(supplied, entry.tokenDigest)) {
        return {
          principalRef: entry.principalRef,
          scopes: new Set([RELAY_READ_SCOPE, RELAY_WRITE_SCOPE]),
        };
      }
    }
    throw new RelayError("AUTHENTICATION_REQUIRED", "A valid Relay bearer credential is required.");
  }

  challenge(): string {
    return 'Bearer realm="relay"';
  }

  protectedResourceMetadata(): undefined {
    return undefined;
  }

  securityScopes(): undefined {
    return undefined;
  }
}

interface OAuthTokenAuthenticatorOptions {
  keyResolver?: JWTVerifyGetKey;
}

export class OAuthTokenAuthenticator implements RelayAuthenticator {
  readonly mode = "oauth" as const;
  private readonly keyResolver: JWTVerifyGetKey;
  private readonly metadataUrl: string;

  constructor(
    private readonly config: OAuthConfig,
    options: OAuthTokenAuthenticatorOptions = {},
  ) {
    this.keyResolver = options.keyResolver ?? createRemoteJWKSet(new URL(config.jwksUri));
    this.metadataUrl = new URL("/.well-known/oauth-protected-resource", config.resource).href;
  }

  async authenticate(header: string | string[] | undefined): Promise<AuthenticatedPrincipal> {
    const token = bearerToken(header);
    try {
      const { payload } = await jwtVerify(token, this.keyResolver, {
        issuer: this.config.issuer,
        audience: this.config.resource,
        algorithms: ["RS256", "PS256", "ES256", "EdDSA"],
        requiredClaims: ["sub", "exp"],
        clockTolerance: 5,
      });
      if (!payload.sub) throw new Error("subject claim is missing");

      let tenant: string | undefined;
      if (this.config.tenantClaim) {
        const claim = payload[this.config.tenantClaim];
        if (typeof claim !== "string" || claim.length === 0) {
          throw new Error("tenant claim is missing");
        }
        tenant = claim;
      }

      const externalIdentity = JSON.stringify([this.config.issuer, tenant ?? null, payload.sub]);
      const principalRef = `oauth:${createHash("sha256").update(externalIdentity).digest("hex")}`;
      const scopes =
        typeof payload.scope === "string"
          ? new Set(payload.scope.split(/\s+/).filter(Boolean))
          : new Set<string>();
      return { principalRef, scopes };
    } catch (caught) {
      if (caught instanceof RelayError) throw caught;
      if (caught instanceof joseErrors.JOSEError || caught instanceof Error) {
        throw new RelayError(
          "AUTHENTICATION_REQUIRED",
          "A valid Relay bearer credential is required.",
        );
      }
      throw caught;
    }
  }

  challenge(
    scopes: readonly string[],
    error: "invalid_token" | "insufficient_scope" = "invalid_token",
  ): string {
    const description =
      error === "insufficient_scope"
        ? "The access token does not grant the required Relay scope."
        : "A valid Relay access token is required.";
    return [
      "Bearer",
      `resource_metadata="${this.metadataUrl}",`,
      `scope="${scopes.join(" ")}",`,
      `error="${error}",`,
      `error_description="${description}"`,
    ].join(" ");
  }

  protectedResourceMetadata(): ProtectedResourceMetadata {
    return {
      resource: this.config.resource,
      authorization_servers: [this.config.issuer],
      scopes_supported: [RELAY_READ_SCOPE, RELAY_WRITE_SCOPE],
      ...(this.config.documentationUrl
        ? { resource_documentation: this.config.documentationUrl }
        : {}),
    };
  }

  securityScopes(): { read: string[]; write: string[] } {
    return {
      read: [RELAY_READ_SCOPE],
      write: [RELAY_READ_SCOPE, RELAY_WRITE_SCOPE],
    };
  }
}

export const createAuthenticator = (
  environment: NodeJS.ProcessEnv,
  oauthConfig?: OAuthConfig,
): RelayAuthenticator =>
  oauthConfig
    ? new OAuthTokenAuthenticator(oauthConfig)
    : DevTokenAuthenticator.fromEnvironment(environment);
