import { z } from "zod";
import { TimestampSchema } from "../../contracts/src/index.js";

const boundedCount = z.number().int().min(0).max(10_000);

export const AlphaObservationSchema = z
  .object({
    schema_version: z.literal(1),
    participant_ref: z.string().regex(/^alpha_[a-z0-9]{8,24}$/),
    recorded_at: TimestampSchema,
    onboarding_minutes: z.number().min(0).max(180),
    continuation_minutes: z.number().min(0).max(180),
    repeated_context_items: boundedCount,
    incorrect_assumptions: boundedCount,
    acceptance_criteria_total: z.number().int().min(1).max(1_000),
    acceptance_criteria_completed: z.number().int().min(0).max(1_000),
    trust_rating: z.number().int().min(1).max(5),
    returned_for_second_project: z.boolean(),
    support_requests: boundedCount,
  })
  .strict()
  .superRefine((observation, context) => {
    if (observation.acceptance_criteria_completed > observation.acceptance_criteria_total) {
      context.addIssue({
        code: "custom",
        path: ["acceptance_criteria_completed"],
        message: "Completed acceptance criteria cannot exceed the total.",
      });
    }
  });

export type AlphaObservation = z.infer<typeof AlphaObservationSchema>;

export const ALPHA_EXIT_THRESHOLDS = {
  minimumParticipants: 10,
  maximumParticipants: 20,
  onboardingUnderTenRate: 0.8,
  continuationUnderOneRate: 0.7,
  zeroIncorrectAssumptionRate: 0.8,
  acceptanceCriteriaCompletionRate: 0.8,
  averageTrustRating: 4,
  repeatUsageRate: 0.5,
} as const;

interface MetricGate {
  metric: string;
  observed: number;
  threshold: string;
  passed: boolean;
}

export interface AlphaMetricsSummary {
  schema_version: 1;
  participant_count: number;
  target_cohort_range: { minimum: number; maximum: number };
  onboarding_under_ten_rate: number;
  continuation_under_one_rate: number;
  zero_incorrect_assumption_rate: number;
  acceptance_criteria_completion_rate: number;
  average_trust_rating: number;
  repeat_usage_rate: number;
  support_request_count: number;
  gates: MetricGate[];
  value_gate_passed: boolean;
  privacy_notice: string;
}

const rate = (matches: number, total: number): number =>
  total === 0 ? 0 : Number((matches / total).toFixed(3));

export const parseAlphaObservationLines = (input: string): AlphaObservation[] => {
  const observations: AlphaObservation[] = [];
  const participantRefs = new Set<string>();

  for (const [index, rawLine] of input.split(/\r?\n/u).entries()) {
    const line = rawLine.trim();
    if (!line) continue;

    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      throw new Error(`Alpha observation line ${index + 1} is not valid JSON.`);
    }

    const result = AlphaObservationSchema.safeParse(parsed);
    if (!result.success) {
      throw new Error(
        `Alpha observation line ${index + 1} failed validation: ${z.prettifyError(result.error)}`,
      );
    }
    if (participantRefs.has(result.data.participant_ref)) {
      throw new Error(`Alpha observation line ${index + 1} repeats a participant_ref.`);
    }
    participantRefs.add(result.data.participant_ref);
    observations.push(result.data);
  }

  return observations;
};

export const summarizeAlphaObservations = (
  observations: AlphaObservation[],
): AlphaMetricsSummary => {
  const participantCount = observations.length;
  const acceptanceCriteriaTotal = observations.reduce(
    (sum, observation) => sum + observation.acceptance_criteria_total,
    0,
  );
  const acceptanceCriteriaCompleted = observations.reduce(
    (sum, observation) => sum + observation.acceptance_criteria_completed,
    0,
  );
  const onboardingUnderTenRate = rate(
    observations.filter((observation) => observation.onboarding_minutes <= 10).length,
    participantCount,
  );
  const continuationUnderOneRate = rate(
    observations.filter((observation) => observation.continuation_minutes <= 1).length,
    participantCount,
  );
  const zeroIncorrectAssumptionRate = rate(
    observations.filter((observation) => observation.incorrect_assumptions === 0).length,
    participantCount,
  );
  const acceptanceCriteriaCompletionRate = rate(
    acceptanceCriteriaCompleted,
    acceptanceCriteriaTotal,
  );
  const averageTrustRating =
    participantCount === 0
      ? 0
      : Number(
          (
            observations.reduce((sum, observation) => sum + observation.trust_rating, 0) /
            participantCount
          ).toFixed(2),
        );
  const repeatUsageRate = rate(
    observations.filter((observation) => observation.returned_for_second_project).length,
    participantCount,
  );
  const supportRequestCount = observations.reduce(
    (sum, observation) => sum + observation.support_requests,
    0,
  );

  const gates: MetricGate[] = [
    {
      metric: "minimum_participants",
      observed: participantCount,
      threshold: `>= ${ALPHA_EXIT_THRESHOLDS.minimumParticipants}`,
      passed: participantCount >= ALPHA_EXIT_THRESHOLDS.minimumParticipants,
    },
    {
      metric: "bounded_cohort",
      observed: participantCount,
      threshold: `<= ${ALPHA_EXIT_THRESHOLDS.maximumParticipants}`,
      passed: participantCount <= ALPHA_EXIT_THRESHOLDS.maximumParticipants,
    },
    {
      metric: "onboarding_under_ten_rate",
      observed: onboardingUnderTenRate,
      threshold: `>= ${ALPHA_EXIT_THRESHOLDS.onboardingUnderTenRate}`,
      passed: onboardingUnderTenRate >= ALPHA_EXIT_THRESHOLDS.onboardingUnderTenRate,
    },
    {
      metric: "continuation_under_one_rate",
      observed: continuationUnderOneRate,
      threshold: `>= ${ALPHA_EXIT_THRESHOLDS.continuationUnderOneRate}`,
      passed: continuationUnderOneRate >= ALPHA_EXIT_THRESHOLDS.continuationUnderOneRate,
    },
    {
      metric: "zero_incorrect_assumption_rate",
      observed: zeroIncorrectAssumptionRate,
      threshold: `>= ${ALPHA_EXIT_THRESHOLDS.zeroIncorrectAssumptionRate}`,
      passed: zeroIncorrectAssumptionRate >= ALPHA_EXIT_THRESHOLDS.zeroIncorrectAssumptionRate,
    },
    {
      metric: "acceptance_criteria_completion_rate",
      observed: acceptanceCriteriaCompletionRate,
      threshold: `>= ${ALPHA_EXIT_THRESHOLDS.acceptanceCriteriaCompletionRate}`,
      passed:
        acceptanceCriteriaCompletionRate >= ALPHA_EXIT_THRESHOLDS.acceptanceCriteriaCompletionRate,
    },
    {
      metric: "average_trust_rating",
      observed: averageTrustRating,
      threshold: `>= ${ALPHA_EXIT_THRESHOLDS.averageTrustRating}`,
      passed: averageTrustRating >= ALPHA_EXIT_THRESHOLDS.averageTrustRating,
    },
    {
      metric: "repeat_usage_rate",
      observed: repeatUsageRate,
      threshold: `>= ${ALPHA_EXIT_THRESHOLDS.repeatUsageRate}`,
      passed: repeatUsageRate >= ALPHA_EXIT_THRESHOLDS.repeatUsageRate,
    },
  ];

  return {
    schema_version: 1,
    participant_count: participantCount,
    target_cohort_range: {
      minimum: ALPHA_EXIT_THRESHOLDS.minimumParticipants,
      maximum: ALPHA_EXIT_THRESHOLDS.maximumParticipants,
    },
    onboarding_under_ten_rate: onboardingUnderTenRate,
    continuation_under_one_rate: continuationUnderOneRate,
    zero_incorrect_assumption_rate: zeroIncorrectAssumptionRate,
    acceptance_criteria_completion_rate: acceptanceCriteriaCompletionRate,
    average_trust_rating: averageTrustRating,
    repeat_usage_rate: repeatUsageRate,
    support_request_count: supportRequestCount,
    gates,
    value_gate_passed: gates.every((gate) => gate.passed),
    privacy_notice:
      "Aggregate output excludes participant references, project content, credentials, and free text.",
  };
};
