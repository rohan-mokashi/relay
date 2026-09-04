import { describe, expect, it } from "vitest";
import { parseAlphaObservationLines, summarizeAlphaObservations } from "../src/index.js";

const observation = (participant: number, overrides: Record<string, unknown> = {}) => ({
  schema_version: 1 as const,
  participant_ref: `alpha_tester${String(participant).padStart(2, "0")}`,
  recorded_at: "2026-09-04T12:00:00Z",
  onboarding_minutes: 8,
  continuation_minutes: 0.75,
  repeated_context_items: 0,
  incorrect_assumptions: 0,
  acceptance_criteria_total: 4,
  acceptance_criteria_completed: 4,
  trust_rating: 4,
  returned_for_second_project: participant <= 6,
  support_requests: 0,
  ...overrides,
});

describe("private alpha metrics", () => {
  it("passes the pre-registered value gate for a qualifying bounded cohort", () => {
    const input = Array.from({ length: 10 }, (_, index) => observation(index + 1));
    const summary = summarizeAlphaObservations(input);

    expect(summary.participant_count).toBe(10);
    expect(summary.onboarding_under_ten_rate).toBe(1);
    expect(summary.repeat_usage_rate).toBe(0.6);
    expect(summary.value_gate_passed).toBe(true);
    expect(JSON.stringify(summary)).not.toContain("alpha_tester");
  });

  it("keeps the gate closed when the cohort or continuation signal is insufficient", () => {
    const input = Array.from({ length: 9 }, (_, index) =>
      observation(index + 1, {
        continuation_minutes: 4,
        returned_for_second_project: false,
      }),
    );
    const summary = summarizeAlphaObservations(input);

    expect(summary.value_gate_passed).toBe(false);
    expect(summary.gates.find((gate) => gate.metric === "minimum_participants")?.passed).toBe(
      false,
    );
    expect(
      summary.gates.find((gate) => gate.metric === "continuation_under_one_rate")?.passed,
    ).toBe(false);
  });

  it("rejects duplicate participant records without echoing the record", () => {
    const line = JSON.stringify(observation(1));
    expect(() => parseAlphaObservationLines(`${line}\n${line}`)).toThrow(
      "repeats a participant_ref",
    );
  });

  it("rejects free text and impossible acceptance-criterion counts", () => {
    expect(() =>
      parseAlphaObservationLines(
        JSON.stringify(
          observation(1, {
            notes: "private project detail",
            acceptance_criteria_completed: 5,
          }),
        ),
      ),
    ).toThrow("failed validation");
  });
});
