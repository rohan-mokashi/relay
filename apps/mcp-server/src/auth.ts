import { createHash, timingSafeEqual } from "node:crypto";
import { RelayError } from "../../../packages/domain/src/errors.js";

const digest = (value: string): Buffer => createHash("sha256").update(value).digest();

export class DevTokenAuthenticator {
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

  authenticate(header: string | string[] | undefined): string {
    const value = Array.isArray(header) ? header[0] : header;
    const match = value?.match(/^Bearer ([^\s]+)$/i);
    if (!match?.[1]) {
      throw new RelayError(
        "AUTHENTICATION_REQUIRED",
        "A valid Relay bearer credential is required.",
      );
    }
    const supplied = digest(match[1]);
    for (const entry of this.entries) {
      if (timingSafeEqual(supplied, entry.tokenDigest)) return entry.principalRef;
    }
    throw new RelayError("AUTHENTICATION_REQUIRED", "A valid Relay bearer credential is required.");
  }
}
