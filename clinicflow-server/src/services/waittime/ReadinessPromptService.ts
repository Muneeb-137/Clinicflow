import type {
  ClinicState,
  ClinicStateProvider,
} from "./types.js";

import {
  estimateVisitDuration,
} from "./DurationEstimator.js";

export type ReadinessPromptReason =
  | "not_in_consult"
  | "no_active_visit"
  | "within_expected_duration"
  | "active_readiness_estimate"
  | "forecast_stale";

export type ReadinessPromptResult = {
  doctorId: number;
  shouldPrompt: boolean;
  reason: ReadinessPromptReason;
};

type CheckReadinessPromptInput = {
  provider: ClinicStateProvider;
  state: ClinicState;
  now: Date;
};

export function checkReadinessPrompt({
  provider,
  state,
  now,
}: CheckReadinessPromptInput): ReadinessPromptResult {
  // Only a provider who is actively in a consultation can need
  // a readiness update.
  if (provider.status !== "in_consult") {
    return {
      doctorId: provider.doctorId,
      shouldPrompt: false,
      reason: "not_in_consult",
    };
  }

  // Find this provider's active visit.
  const activeVisit = state.activeVisits.find(
    (visit) =>
      visit.doctorId === provider.doctorId,
  );

  if (
    !activeVisit ||
    !activeVisit.consultStartedAt
  ) {
    return {
      doctorId: provider.doctorId,
      shouldPrompt: false,
      reason: "no_active_visit",
    };
  }

  // If the doctor has already provided a readiness estimate
  // that is still in the future, keep using it.
  if (provider.estimatedReadyAt) {
    const estimatedReadyAt = new Date(
      provider.estimatedReadyAt,
    );

    if (estimatedReadyAt > now) {
      return {
        doctorId: provider.doctorId,
        shouldPrompt: false,
        reason: "active_readiness_estimate",
      };
    }
  }

  const durationEstimate =
    estimateVisitDuration({
        durationMinutes:
          activeVisit.durationMinutes,
        appointmentTypeId:
          activeVisit.appointmentTypeId,
        durationStats:
          state.durationStats,
      });

    const expectedDurationMinutes =
    durationEstimate.expectedMinutes;

    const consultStartedAt = new Date(
        activeVisit.consultStartedAt,
    );

  const expectedReadyAt = new Date(
    consultStartedAt.getTime() +
      expectedDurationMinutes * 60_000,
  );

  // The original visit-duration forecast is still valid.
  if (now < expectedReadyAt) {
    return {
      doctorId: provider.doctorId,
      shouldPrompt: false,
      reason: "within_expected_duration",
    };
  }

  // The baseline forecast has expired and the provider is
  // still actually in consultation.
  return {
    doctorId: provider.doctorId,
    shouldPrompt: true,
    reason: "forecast_stale",
  };
}