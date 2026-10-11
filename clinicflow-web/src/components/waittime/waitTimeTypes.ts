/*
 * Shapes returned by the wait-time API.
 *
 * "Wait" always means check-in → roomed. A null minute
 * value means there is no data or the engine cannot
 * project one (for example no doctor in a walk-in
 * block) — it is never the same as 0.
 */
export type VisitType = "walk_in" | "scheduled";

export type PredictionConfidence =
  | "high"
  | "medium"
  | "low";

export type VisitTypeWaitSummary = {
  visitType: VisitType;

  // Patients roomed today.
  seenCount: number;
  averageWaitMinutes: number | null;
  medianWaitMinutes: number | null;

  // Patients in the waiting room right now.
  waitingCount: number;
  averageCurrentWaitMinutes: number | null;
  longestCurrentWaitMinutes: number | null;

  // Trailing 28-day average (excluding today).
  baselineAverageWaitMinutes: number | null;
  baselineSampleSize: number;

  // Average engine-predicted remaining wait of those waiting.
  averagePredictedWaitMinutes: number | null;
};

/*
 * Walk-ins may only START inside a doctor's walk-in
 * hours. "current" = seen in the block open now;
 * "later" = pushed to a walk-in block later today.
 */
export type WalkInBlockInfo = {
  status: "current" | "later";
  startsAt: string;
  endsAt: string;
};

export type NewWalkInStatus =
  | "open"
  | "full"
  | "not_started"
  | "closed";

export type NewWalkInEstimate = {
  status: NewWalkInStatus;
  expectedWaitMinutes: number | null;
  lowerWaitMinutes: number | null;
  upperWaitMinutes: number | null;
  projectedProviderId: number | null;
  // Projected start, or the next walk-in opening.
  nextOpeningAt: string | null;
  // Doctors in a walk-in block now with a room.
  acceptingDoctors: number;
  // Typical walk-ins that can still be seen (start to
  // finish) in the walk-in blocks open now.
  spotsLeft: number;
  // Open but tight: if visits run long, a new walk-in may
  // not fit before walk-in hours end (walkInHoursEndAt).
  mayMissWalkInHours?: boolean;
  walkInHoursEndAt?: string | null;
};

/*
 * GET /api/wait-time/walk-in-admission — does a new
 * walk-in of this visit type FINISH before walk-in
 * hours end? Never blocks: staff can "Add anyway".
 */
export type WalkInAdmissionStatus =
  | "fits"
  | "runs_over"
  | "full"
  | "not_started"
  | "closed";

export type WalkInAdmission = {
  status: WalkInAdmissionStatus;
  fits: boolean;
  durationMinutes: number;
  expectedWaitMinutes: number | null;
  projectedDoctorId: number | null;
  projectedDoctorName: string | null;
  projectedStartAt: string | null;
  projectedEndAt: string | null;
  // End of the walk-in block the visit would start in.
  blockEndsAt: string | null;
  // How far past blockEndsAt the visit would run.
  overrunMinutes: number;
  // Earliest time it fits fully (a later block).
  nextOpeningAt: string | null;
  appointmentTypeName: string;
  checkedAt: string;
};

export type MyWaitPrediction = {
  appointmentId: number;
  predictionType: VisitType;
  expectedWaitMinutes: number | null;
  lowerWaitMinutes: number | null;
  upperWaitMinutes: number | null;
  patientsAhead: number | null;
  confidence: PredictionConfidence;
  projectedStartAt?: string | null;
  walkInBlock?: WalkInBlockInfo | null;
  mayMissWalkInHours?: boolean;
};

export type WaitTimeSummary = {
  generatedAt: string;
  byVisitType: VisitTypeWaitSummary[];
  newWalkIn: NewWalkInEstimate;
  // Only present for patient sessions.
  myPrediction?: MyWaitPrediction | null;
};

export type WalkInProjection = {
  assignmentMode: "auto" | "manual";
  assignedDoctorId: number | null;
  projectedDoctorId: number | null;
  projectedDoctorName: string | null;
  projectedProviderStatus:
    | "available"
    | "in_consult"
    | "unavailable"
    | null;
  projectedRoomName: string | null;
  projectedStartAt: string | null;
  estimatedWaitMinutes: number | null;
  delayStatus: "none" | "consult_overrun";
  delayMinutes: number;
  delayReason: string | null;
};

export type WaitPrediction = {
  appointmentId: number;
  patientId: number;
  predictionType: VisitType;
  expectedWaitMinutes: number | null;
  lowerWaitMinutes: number | null;
  upperWaitMinutes: number | null;
  projectedProviderId: number | null;
  projectedStartAt: string | null;
  patientsAhead: number | null;
  confidence: PredictionConfidence;
  explanation: string[];
  predictedAt: string;
  delayStatus: "none" | "consult_overrun";
  delayMinutes: number;
  delayReason: string | null;
  walkInProjection: WalkInProjection | null;
  walkInBlock?: WalkInBlockInfo | null;
  mayMissWalkInHours?: boolean;
  // Accepted walk-in fitted into a doctor's free time
  // outside walk-in hours (no booked patient is moved).
  spillover?: boolean;
};

export type WaitPredictionsResponse = {
  predictedAt: string;
  newWalkIn: NewWalkInEstimate;
  predictions: WaitPrediction[];
};

/*
 * GET /api/wait-time/walk-in-options/:appointmentId —
 * where a waiting walk-in can go when they won't be seen
 * before their walk-in hours end. doctorName is
 * "First Last" (no "Dr.").
 */
export type WalkInHoursWindow = {
  startAt: string;
  endAt: string;
};

export type WalkInOption = {
  doctorId: number | null;
  doctorName: string | null;
  startAt: string | null;
  waitMinutes: number | null;
  // That doctor's walk-in hours still ahead today.
  walkInHours: WalkInHoursWindow[];
};

export type WalkInOptions = {
  appointmentId: number;
  currentMode: "auto" | "manual";
  currentDoctorId: number | null;
  nextAvailable: WalkInOption | null;
  // Sorted by startAt; null startAt last.
  doctors: WalkInOption[];
};
