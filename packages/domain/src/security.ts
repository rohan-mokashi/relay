import { createHash } from "node:crypto";
import { RelayError } from "./errors.js";

export const normalizeSlug = (value: string): string => {
  const normalized = value
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/[._\s]+/g, "-")
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  if (!normalized) {
    throw new RelayError("VALIDATION_FAILED", "Project slug is empty after normalization.", [
      { field: "slug", message: "Use at least one letter or number" },
    ]);
  }
  return normalized;
};

const stableValue = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, stableValue(child)]),
    );
  }
  return value;
};

export const hashPayload = (value: unknown): string =>
  createHash("sha256")
    .update(JSON.stringify(stableValue(value)))
    .digest("hex");

const secretPatterns: RegExp[] = [
  /\bsk-[A-Za-z0-9_-]{16,}\b/,
  /\b(?:ghp|github_pat)_[A-Za-z0-9_]{16,}\b/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{12,}/i,
  /(?:access[_-]?token|api[_-]?key|password|session[_-]?cookie)\s*[:=]\s*[^\s,;]{8,}/i,
];

const sensitiveKey = /^(?:authorization|cookie|password|secret|api[_-]?key|access[_-]?token)$/i;

const secretLocation = (value: unknown, path = "$", keyName?: string): string | undefined => {
  if (typeof value === "string") {
    if (keyName && sensitiveKey.test(keyName) && value.trim().length > 0) return path;
    if (secretPatterns.some((pattern) => pattern.test(value))) return path;
    return undefined;
  }
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const found = secretLocation(value[index], `${path}[${index}]`);
      if (found) return found;
    }
    return undefined;
  }
  if (value !== null && typeof value === "object") {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      const found = secretLocation(child, `${path}.${key}`, key);
      if (found) return found;
    }
  }
  return undefined;
};

export const assertNoObviousSecrets = (value: unknown): void => {
  const location = secretLocation(value);
  if (location) {
    throw new RelayError(
      "VALIDATION_FAILED",
      "Relay rejected content that appears to contain a credential.",
      [{ field: location, message: "Remove credentials and submit only project context" }],
    );
  }
};
