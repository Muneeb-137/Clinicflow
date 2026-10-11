import type { DurationStats } from "./types.js";

export type DurationEstimateSource =
  | "historical"
  | "appointment_duration"
  | "configured_default";

export type DurationEstimate = {
  expectedMinutes: number;
  lowerMinutes: number;
  upperMinutes: number;
  source: DurationEstimateSource;
  sampleSize: number;
};

type EstimateVisitDurationInput = {
  durationMinutes: number | null;
  appointmentTypeId?: number | null;
  durationStats?: Record<number, DurationStats>;
};

const DEFAULT_DURATION_MINUTES = 20;

/*
 * Minimum completed visits of one appointment type before
 * real history replaces the booked duration.
 */
export const MIN_HISTORY_SAMPLES = 8;

export function estimateVisitDuration(
  input: EstimateVisitDurationInput,
): DurationEstimate {
  const stats =
    input.appointmentTypeId != null
      ? input.durationStats?.[
          input.appointmentTypeId
        ]
      : undefined;

  /*
   * Enough real history: use how long this kind of
   * visit actually takes (median), with the middle 50%
   * of visits as the uncertainty range.
   */
  if (
    stats &&
    stats.sampleSize >= MIN_HISTORY_SAMPLES
  ) {
    const expectedMinutes = Math.max(
      5,
      Math.round(stats.medianMinutes),
    );

    return {
      expectedMinutes,
      lowerMinutes: Math.max(
        5,
        Math.min(
          expectedMinutes,
          Math.round(stats.p25Minutes),
        ),
      ),
      upperMinutes: Math.max(
        expectedMinutes,
        Math.round(stats.p75Minutes),
      ),
      source: "historical",
      sampleSize: stats.sampleSize,
    };
  }

  const expectedMinutes =
    input.durationMinutes ??
    DEFAULT_DURATION_MINUTES;

  /*
   * Not enough history yet: a conservative range around
   * the configured appointment duration. This is NOT
   * historical evidence.
   */
  const lowerMinutes = Math.max(
    5,
    Math.round(expectedMinutes * 0.75),
  );

  const upperMinutes = Math.max(
    lowerMinutes,
    Math.round(expectedMinutes * 1.35),
  );

  return {
    expectedMinutes,
    lowerMinutes,
    upperMinutes,

    source:
      input.durationMinutes !== null
        ? "appointment_duration"
        : "configured_default",

    sampleSize: stats?.sampleSize ?? 0,
  };
}
