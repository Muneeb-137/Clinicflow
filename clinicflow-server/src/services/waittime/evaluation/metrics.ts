/*
 * Accuracy metrics for wait predictions.
 */

export type PredictionOutcome = {
  visitType: "scheduled" | "walk_in";

  // Real wait from the moment of prediction to roomed.
  actualMinutes: number;

  // Engine prediction (null = engine could not estimate).
  expectedMinutes: number | null;
  lowerMinutes: number | null;
  upperMinutes: number | null;

  // Naive comparison: what a simple rule would have said.
  baselineMinutes: number;

  // Patients waiting in the clinic when predicted.
  queueLength: number;
};

export type AccuracySummary = {
  predictions: number;
  estimated: number;
  coveragePct: number;

  meanAbsErrorMinutes: number | null;
  medianAbsErrorMinutes: number | null;
  // Positive = engine predicts longer than reality.
  biasMinutes: number | null;
  within5Pct: number | null;
  within10Pct: number | null;
  within15Pct: number | null;

  // Actual wait fell inside the predicted range
  // (with 2 minutes of tolerance).
  rangeHitPct: number | null;

  baselineMeanAbsErrorMinutes: number | null;

  averageActualMinutes: number | null;
};

const round = (value: number) =>
  Math.round(value * 10) / 10;

function median(values: number[]) {
  if (values.length === 0) {
    return null;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);

  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

const mean = (values: number[]) =>
  values.length === 0
    ? null
    : values.reduce((sum, value) => sum + value, 0) /
      values.length;

const pct = (part: number, whole: number) =>
  whole === 0 ? null : round((100 * part) / whole);

export function summarize(
  outcomes: PredictionOutcome[],
): AccuracySummary {
  const estimated = outcomes.filter(
    (outcome) => outcome.expectedMinutes !== null,
  );

  const errors = estimated.map(
    (outcome) =>
      (outcome.expectedMinutes as number) -
      outcome.actualMinutes,
  );

  const absErrors = errors.map(Math.abs);

  const rangeHits = estimated.filter(
    (outcome) =>
      outcome.actualMinutes >=
        (outcome.lowerMinutes as number) - 2 &&
      outcome.actualMinutes <=
        (outcome.upperMinutes as number) + 2,
  ).length;

  const baselineErrors = estimated.map((outcome) =>
    Math.abs(
      outcome.baselineMinutes - outcome.actualMinutes,
    ),
  );

  const maybe = (value: number | null) =>
    value === null ? null : round(value);

  return {
    predictions: outcomes.length,
    estimated: estimated.length,
    coveragePct:
      pct(estimated.length, outcomes.length) ?? 0,

    meanAbsErrorMinutes: maybe(mean(absErrors)),
    medianAbsErrorMinutes: maybe(median(absErrors)),
    biasMinutes: maybe(mean(errors)),
    within5Pct: pct(
      absErrors.filter((error) => error <= 5).length,
      absErrors.length,
    ),
    within10Pct: pct(
      absErrors.filter((error) => error <= 10).length,
      absErrors.length,
    ),
    within15Pct: pct(
      absErrors.filter((error) => error <= 15).length,
      absErrors.length,
    ),
    rangeHitPct: pct(rangeHits, estimated.length),

    baselineMeanAbsErrorMinutes: maybe(
      mean(baselineErrors),
    ),

    averageActualMinutes: maybe(
      mean(estimated.map((o) => o.actualMinutes)),
    ),
  };
}

export function summarizeByVisitType(
  outcomes: PredictionOutcome[],
) {
  return {
    walk_in: summarize(
      outcomes.filter((o) => o.visitType === "walk_in"),
    ),
    scheduled: summarize(
      outcomes.filter((o) => o.visitType === "scheduled"),
    ),
  };
}
