import type { ErrorCode } from "../../contracts/src/index.js";

export interface FieldIssue {
  field?: string;
  message: string;
}

export class RelayError extends Error {
  readonly code: ErrorCode;
  readonly details?: FieldIssue[];

  constructor(code: ErrorCode, message: string, details?: FieldIssue[]) {
    super(message);
    this.name = "RelayError";
    this.code = code;
    this.details = details;
  }
}

export const asRelayError = (error: unknown): RelayError => {
  if (error instanceof RelayError) return error;
  return new RelayError("INTERNAL_ERROR", "Relay could not complete the request safely.");
};
