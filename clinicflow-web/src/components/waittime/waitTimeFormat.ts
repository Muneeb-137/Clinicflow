import { CLINIC_TIME_ZONE } from "../../utils/clinicTime";
import { apiFetch } from "../../lib/api";

import type {
  NewWalkInEstimate,
  PredictionConfidence,
  VisitType,
  VisitTypeWaitSummary,
  WaitTimeSummary,
} from "./waitTimeTypes";

/*
 * Loads today's wait-time summary. Works for staff and
 * patient sessions (patients also get myPrediction).
 */
export async function fetchWaitTimeSummary(): Promise<WaitTimeSummary> {
  const response = await apiFetch(
    "/api/wait-time/summary",
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data.message ?? "Unable to load wait times.",
    );
  }

  return data as WaitTimeSummary;
}

export function getVisitTypeSummary(
  summary: WaitTimeSummary | null,
  visitType: VisitType,
): VisitTypeWaitSummary | null {
  return (
    summary?.byVisitType.find(
      (item) => item.visitType === visitType,
    ) ?? null
  );
}

// Whole minutes, or null when there is no value.
export function roundMinutes(
  minutes: number | null | undefined,
): number | null {
  if (minutes == null || Number.isNaN(Number(minutes))) {
    return null;
  }

  return Math.max(0, Math.round(Number(minutes)));
}

/*
 * "~25 min (20–35)" when the range is wider than a
 * point, "~25 min" otherwise. Null when the engine
 * cannot estimate — callers show their own empty state.
 */
export function formatWaitEstimate(
  expected: number | null | undefined,
  lower?: number | null,
  upper?: number | null,
): string | null {
  const expectedMinutes = roundMinutes(expected);

  if (expectedMinutes === null) {
    return null;
  }

  const range = formatWaitRange(lower, upper);

  return range
    ? `~${expectedMinutes} min (${range})`
    : `~${expectedMinutes} min`;
}

// "20–35" or null when there is no real range.
export function formatWaitRange(
  lower: number | null | undefined,
  upper: number | null | undefined,
): string | null {
  const lowerMinutes = roundMinutes(lower);
  const upperMinutes = roundMinutes(upper);

  if (
    lowerMinutes === null ||
    upperMinutes === null ||
    lowerMinutes === upperMinutes
  ) {
    return null;
  }

  return `${lowerMinutes}–${upperMinutes}`;
}

export type BaselineComparison = {
  // Positive = longer than usual.
  differenceMinutes: number;
  direction: "shorter" | "longer" | "same";
  text: string;
};

/*
 * Today's average vs the trailing 28-day average. Null
 * unless both values exist, so we never claim a
 * comparison we cannot back up.
 */
export function compareWithBaseline(
  summary: VisitTypeWaitSummary | null,
): BaselineComparison | null {
  if (
    !summary ||
    summary.averageWaitMinutes == null ||
    summary.baselineAverageWaitMinutes == null ||
    summary.baselineSampleSize <= 0
  ) {
    return null;
  }

  const differenceMinutes = Math.round(
    summary.averageWaitMinutes -
      summary.baselineAverageWaitMinutes,
  );

  if (differenceMinutes === 0) {
    return {
      differenceMinutes,
      direction: "same",
      text: "About the same as usual",
    };
  }

  const direction =
    differenceMinutes < 0 ? "shorter" : "longer";

  return {
    differenceMinutes,
    direction,
    text: `${Math.abs(differenceMinutes)} min ${direction} than usual`,
  };
}

export function getConfidenceLabel(
  confidence: PredictionConfidence,
) {
  if (confidence === "high") {
    return "High confidence";
  }

  if (confidence === "medium") {
    return "Medium confidence";
  }

  return "Low confidence";
}

export function pluralize(
  count: number,
  singular: string,
  plural = `${singular}s`,
) {
  return `${count} ${count === 1 ? singular : plural}`;
}

export const visitTypeLabels: Record<VisitType, string> = {
  walk_in: "Walk-in",
  scheduled: "Scheduled",
};

export function getWalkInNowEmptyLabel(
  newWalkIn: NewWalkInEstimate | null | undefined,
) {
  if (newWalkIn && newWalkIn.acceptingDoctors === 0) {
    return "No walk-in doctors right now";
  }

  return "Can't estimate right now";
}

const clinicClockFormatter = new Intl.DateTimeFormat(
  "en-US",
  {
    timeZone: CLINIC_TIME_ZONE,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  },
);

/*
 * Clinic-local clock time ("5:15 PM", America/Toronto).
 * Null when the value is missing or not a valid date.
 */
export function formatClockTime(
  value: string | null | undefined,
): string | null {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return clinicClockFormatter.format(date);
}

export type WalkInNowTone = "normal" | "warning" | "muted";

export type WalkInNowPresentation = {
  status: NewWalkInEstimate["status"] | "unknown";
  // Short main line: "~25 min", "Walk-in hours are full".
  headline: string;
  // Big minute number — only set while walk-in hours are
  // open, so a pushed-to-evening number is never shown.
  minutes: number | null;
  // "Likely 20–35 min" / "Next walk-in time: 5:15 PM".
  detail: string | null;
  // "3 walk-in spots left" (open only).
  spotsLabel: string | null;
  tone: WalkInNowTone;
};

/*
 * How to present "If you walk in now" for each walk-in
 * status. Callers render `minutes` as the big value when
 * it is set, otherwise `headline` as a phrase.
 */
export function presentWalkInNow(
  newWalkIn: NewWalkInEstimate | null | undefined,
): WalkInNowPresentation {
  if (!newWalkIn) {
    return {
      status: "unknown",
      headline: "Can't estimate right now",
      minutes: null,
      detail: null,
      spotsLabel: null,
      tone: "muted",
    };
  }

  const nextOpening = formatClockTime(newWalkIn.nextOpeningAt);

  if (newWalkIn.status === "full") {
    return {
      status: "full",
      headline: "Walk-in hours are full",
      minutes: null,
      detail: nextOpening
        ? `Next walk-in time: ${nextOpening}`
        : "No more walk-in time today",
      spotsLabel: null,
      tone: "warning",
    };
  }

  if (newWalkIn.status === "not_started") {
    return {
      status: "not_started",
      headline: nextOpening
        ? `Walk-in hours start at ${nextOpening}`
        : "Walk-in hours haven't started",
      minutes: null,
      detail: null,
      spotsLabel: null,
      tone: "muted",
    };
  }

  if (newWalkIn.status === "closed") {
    return {
      status: "closed",
      headline: "No more walk-in time today",
      minutes: null,
      detail: null,
      spotsLabel: null,
      tone: "muted",
    };
  }

  // open
  const minutes = roundMinutes(newWalkIn.expectedWaitMinutes);
  const range = formatWaitRange(
    newWalkIn.lowerWaitMinutes,
    newWalkIn.upperWaitMinutes,
  );

  const spots = Math.max(0, Math.floor(newWalkIn.spotsLeft ?? 0));

  return {
    status: "open",
    headline:
      minutes !== null
        ? `~${minutes} min`
        : getWalkInNowEmptyLabel(newWalkIn),
    minutes,
    detail:
      minutes !== null && range ? `Likely ${range} min` : null,
    spotsLabel: newWalkIn.mayMissWalkInHours
      ? `Tight: may not fit if visits run long (walk-in hours end ${formatClockTime(newWalkIn.walkInHoursEndAt) ?? "soon"})`
      : spots > 0
        ? `${pluralize(spots, "walk-in spot")} left`
        : "Few walk-in spots left",
    tone: minutes !== null ? "normal" : "muted",
  };
}

// Tailwind text colour for a presenter tone.
export const walkInNowToneClasses: Record<WalkInNowTone, string> = {
  normal: "text-slate-950",
  warning: "text-amber-700",
  muted: "text-slate-400",
};
