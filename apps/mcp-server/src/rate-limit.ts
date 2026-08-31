import { RelayError } from "../../../packages/domain/src/errors.js";

interface WindowState {
  startedAt: number;
  count: number;
}

export class PrincipalRateLimiter {
  private readonly windows = new Map<string, WindowState>();

  constructor(
    private readonly maximumPerMinute: number,
    private readonly now: () => number = () => Date.now(),
  ) {
    if (!Number.isInteger(maximumPerMinute) || maximumPerMinute < 1) {
      throw new Error("Relay rate limit must be a positive integer.");
    }
  }

  consume(principalRef: string): void {
    const now = this.now();
    const existing = this.windows.get(principalRef);
    if (!existing || now - existing.startedAt >= 60_000) {
      this.windows.set(principalRef, { startedAt: now, count: 1 });
      return;
    }
    existing.count += 1;
    if (existing.count > this.maximumPerMinute) {
      throw new RelayError("RATE_LIMITED", "Relay request rate limit exceeded. Retry later.");
    }
  }
}
