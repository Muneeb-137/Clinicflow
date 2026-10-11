import type {
  ClinicStateProvider,
} from "./types.js";

export type ProviderEligibilityReason =
  | "eligible"
  | "outside_walk_in_window"
  | "provider_unavailable"
  | "no_room_assigned";

export type ProviderEligibilityResult = {
  doctorId: number;
  eligible: boolean;
  reason: ProviderEligibilityReason;
};

export function checkForecastEligibility(
  provider: ClinicStateProvider,
): ProviderEligibilityResult {
  // Doctor must currently be inside
  // an active walk-in schedule block.
  if (!provider.walkInEligibleNow) {
    return {
      doctorId: provider.doctorId,
      eligible: false,
      reason: "outside_walk_in_window",
    };
  }

  // "in_consult" is intentionally allowed.
  // The doctor is busy now, but can still
  // participate in the future walk-in queue.
  if (provider.status === "unavailable") {
    return {
      doctorId: provider.doctorId,
      eligible: false,
      reason: "provider_unavailable",
    };
  }

  // For now, require the doctor to have
  // a room assigned.
  if (!provider.roomName) {
    return {
      doctorId: provider.doctorId,
      eligible: false,
      reason: "no_room_assigned",
    };
  }

  return {
    doctorId: provider.doctorId,
    eligible: true,
    reason: "eligible",
  };
}

export function checkDispatchEligibility(
  provider: ClinicStateProvider,
): ProviderEligibilityResult {
  // Doctor must currently be inside
  // an active walk-in schedule block.
  if (!provider.walkInEligibleNow) {
    return {
      doctorId: provider.doctorId,
      eligible: false,
      reason: "outside_walk_in_window",
    };
  }

  // Actual dispatch is stricter than forecasting.
  // A patient can only be sent to a provider
  // whose real status is AVAILABLE right now.
  if (provider.status !== "available") {
    return {
      doctorId: provider.doctorId,
      eligible: false,
      reason: "provider_unavailable",
    };
  }

  // Doctor must have a room available/assigned.
  if (!provider.roomName) {
    return {
      doctorId: provider.doctorId,
      eligible: false,
      reason: "no_room_assigned",
    };
  }

  return {
    doctorId: provider.doctorId,
    eligible: true,
    reason: "eligible",
  };
}