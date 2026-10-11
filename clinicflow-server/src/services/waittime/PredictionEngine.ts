import type {
  ClinicState,
  ClinicStatePatient,
} from "./types.js";

import {
  simulateClinic,
  type LateBookingPolicy,
  type QueueSimulationResult,
  type SimulatedVisit,
} from "./QueueSimulator.js";

import {
  estimateVisitDuration,
  MIN_HISTORY_SAMPLES,
} from "./DurationEstimator.js";

export type WaitPredictionType =
  | "scheduled"
  | "walk_in";

export type WaitPredictionConfidence =
  | "high"
  | "medium"
  | "low";

/*
 * Where an auto walk-in's visit falls relative to walk-in
 * hours:
 * - "current": in a walk-in block that is open now
 * - "later": pushed to a walk-in block that starts later
 *   today (e.g. this afternoon is full; next 5:15 PM)
 */
export type WalkInBlockPlacement = {
  status: "current" | "later";
  startsAt: string;
  endsAt: string;
};

export type WaitPrediction = {
  appointmentId: number;
  patientId: number;

  predictionType: WaitPredictionType;

  // null when no doctor can be projected.
  expectedWaitMinutes: number | null;
  lowerWaitMinutes: number | null;
  upperWaitMinutes: number | null;

  projectedProviderId: number | null;
  projectedStartAt: string | null;
  patientsAhead: number | null;

  confidence: WaitPredictionConfidence;

  explanation: string[];

  predictedAt: string;

  delayStatus: SimulatedVisit["delayStatus"];
  delayMinutes: number;
  delayReason: string | null;

  walkInBlock: WalkInBlockPlacement | null;

  /*
   * If visits run long, this walk-in might not start
   * before their walk-in block ends (and would move to a
   * later block). The upper wait is then capped at the
   * block's end instead of jumping hours ahead.
   */
  mayMissWalkInHours: boolean;

  /*
   * Accepted walk-in who could not start in an open
   * walk-in block and is projected into a free gap in a
   * doctor's working time instead (outside walk-in
   * hours, never displacing a booked patient).
   */
  spillover: boolean;
};

/*
 * "If you walk in now":
 * - open: can be seen in a walk-in block open now
 * - full: open blocks are full; next opening later today
 * - not_started: no block open yet; walk-ins start later
 * - closed: no walk-in time left today
 */
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

  // Start of the projected visit (for full/not_started,
  // the next walk-in opening).
  nextOpeningAt: string | null;

  // Doctors currently in a walk-in block with a room.
  acceptingDoctors: number;

  /*
   * Open, but tight: if visits run long, a new walk-in
   * may not fit before walk-in hours end at this time.
   */
  mayMissWalkInHours: boolean;
  walkInHoursEndAt: string | null;

  /*
   * How many more walk-ins (of typical length) can still
   * be started in the walk-in blocks open now.
   */
  spotsLeft: number;
};

export type ClinicPredictions = {
  predictedAt: string;
  predictions: WaitPrediction[];
  newWalkIn: NewWalkInEstimate;
};

// Placeholder ids for hypothetical walk-ins.
const NEW_WALK_IN_ID = -1;
const CAPACITY_PROBE_COUNT = 40;

const MINUTE = 60_000;

function findVisit(
  result: QueueSimulationResult,
  appointmentId: number,
): SimulatedVisit | undefined {
  return (
    result.assignments.find(
      (item) => item.appointmentId === appointmentId,
    ) ??
    result.scheduledAssignments.find(
      (item) => item.appointmentId === appointmentId,
    )
  );
}

function blockPlacement(
  visit: SimulatedVisit,
  now: number,
): WalkInBlockPlacement | null {
  if (
    !visit.walkInWindowStartAt ||
    !visit.walkInWindowEndAt
  ) {
    return null;
  }

  return {
    status:
      Date.parse(visit.walkInWindowStartAt) <= now
        ? "current"
        : "later",
    startsAt: visit.walkInWindowStartAt,
    endsAt: visit.walkInWindowEndAt,
  };
}

/*
 * =========================================================
 * LIKELY RANGE (sampled)
 * =========================================================
 *
 * The clinic is played out many times with realistic,
 * MIXED visit lengths (some short, some long, drawn
 * around each visit's expected length). The likely range
 * is the middle 60% of the resulting waits.
 *
 * Earlier the range came from "every visit short" and
 * "every visit long" runs, which overstates the spread
 * because in reality short and long visits partly cancel
 * out.
 *
 * Runs where the patient lands in a different walk-in
 * block than expected (e.g. long visits push them past
 * 3:00 PM) are a risk to flag, not a likely wait: their
 * wait is capped at that block's end, and if enough runs
 * miss the block the prediction is flagged.
 */
const SAMPLE_RUNS = 150;
const RANGE_LOW_QUANTILE = 0.2;
const RANGE_HIGH_QUANTILE = 0.8;
// Flag "may run past walk-in hours" when at least this
// share of runs miss the expected block.
const MISS_RISK_SHARE = 0.2;
// Fixed seed: the same clinic state gives the same range
// on every refresh (no jitter).
const SAMPLE_SEED = 0x5eed;

function seededRandom(seed: number) {
  let value = seed >>> 0;

  const next = () => {
    value = (value + 0x6d2b79f5) >>> 0;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);

    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  // Standard normal (Box-Muller).
  const normal = () =>
    Math.sqrt(-2 * Math.log(Math.max(next(), 1e-9))) *
    Math.cos(2 * Math.PI * next());

  return { next, normal };
}

/*
 * One random visit length per patient (log-normal around
 * the expected length; spread from the estimate's
 * typical short/long values, i.e. history when there is
 * enough of it).
 */
function sampleDurations(
  state: ClinicState,
  extras: ClinicStatePatient[],
  now: number,
  random: ReturnType<typeof seededRandom>,
): Map<number, number> {
  const overrides = new Map<number, number>();

  const patients = [
    ...state.activeVisits,
    ...state.scheduledQueue,
    ...state.walkInQueue,
    ...state.pendingWalkIns,
    ...state.upcomingScheduledAppointments,
    ...extras,
  ];

  for (const patient of patients) {
    const estimate = estimateVisitDuration({
      durationMinutes: patient.durationMinutes,
      appointmentTypeId: patient.appointmentTypeId,
      durationStats: state.durationStats,
    });

    // lower/upper are the 25th/75th percentiles
    // (z = +/-0.674).
    const sigma = Math.max(
      0.1,
      (Math.log(estimate.upperMinutes) -
        Math.log(Math.max(1, estimate.lowerMinutes))) /
        1.349,
    );

    let minutes =
      estimate.expectedMinutes *
      Math.exp(sigma * random.normal());

    /*
     * A visit already in progress lasts at least as long
     * as it has run so far, plus a little.
     */
    if (patient.consultStartedAt) {
      const elapsed =
        (now - Date.parse(patient.consultStartedAt)) /
        MINUTE;

      if (minutes <= elapsed) {
        minutes =
          elapsed +
          Math.max(
            2,
            estimate.expectedMinutes *
              0.25 *
              (0.5 + random.next()),
          );
      }
    }

    overrides.set(
      patient.appointmentId,
      Math.max(3, Math.round(minutes)),
    );
  }

  return overrides;
}

function quantile(sorted: number[], q: number) {
  if (sorted.length === 0) {
    return 0;
  }

  const index = (sorted.length - 1) * q;
  const low = Math.floor(index);
  const high = Math.ceil(index);

  return (
    sorted[low] +
    (sorted[high] - sorted[low]) * (index - low)
  );
}

function sampledRange(
  visit: SimulatedVisit,
  appointmentId: number,
  runs: QueueSimulationResult[],
  now: number,
) {
  const expectedMinutes = visit.estimatedWaitMinutes;

  const blockStart = visit.walkInWindowStartAt
    ? Date.parse(visit.walkInWindowStartAt)
    : null;

  const blockEnd = visit.walkInWindowEndAt
    ? Date.parse(visit.walkInWindowEndAt)
    : null;

  const minutesUntil = (time: number) =>
    Math.max(0, Math.round((time - now) / MINUTE));

  let missedBlock = 0;
  const waits: number[] = [];

  /*
   * Runs that miss the block only count toward the risk
   * flag; the range describes when the patient is seen
   * if they ARE seen in this block.
   */
  for (const run of runs) {
    const sample = findVisit(run, appointmentId);

    if (!sample) {
      missedBlock += 1;
      continue;
    }

    if (
      blockEnd !== null &&
      sample.walkInWindowEndAt !== visit.walkInWindowEndAt
    ) {
      const sampleStart = Date.parse(
        sample.projectedStartAt,
      );

      if (sampleStart >= blockEnd) {
        missedBlock += 1;
      } else {
        // Squeezed into an earlier block: unlikely; keep
        // it within the expected block.
        waits.push(
          minutesUntil(blockStart ?? sampleStart),
        );
      }

      continue;
    }

    waits.push(sample.estimatedWaitMinutes);
  }

  waits.sort((a, b) => a - b);

  const lowerMinutes = Math.min(
    expectedMinutes,
    Math.round(quantile(waits, RANGE_LOW_QUANTILE)),
  );

  const upperMinutes = Math.max(
    expectedMinutes,
    Math.round(quantile(waits, RANGE_HIGH_QUANTILE)),
  );

  return {
    expectedMinutes,
    lowerMinutes,
    upperMinutes,
    mayMissWalkInHours:
      blockEnd !== null &&
      runs.length > 0 &&
      missedBlock / runs.length >= MISS_RISK_SHARE,
    walkInHoursEndAt: visit.walkInWindowEndAt,
  };
}

function getConfidence(
  patient: ClinicStatePatient,
  state: ClinicState,
  visit: SimulatedVisit,
  spread: number,
  mayMissWalkInHours: boolean,
): WaitPredictionConfidence {
  if (visit.delayStatus === "consult_overrun") {
    return "low";
  }

  const hasHistory =
    patient.appointmentTypeId != null &&
    (state.durationStats[patient.appointmentTypeId]
      ?.sampleSize ?? 0) >= MIN_HISTORY_SAMPLES;

  // Next in line, or the range is tight.
  if (
    !mayMissWalkInHours &&
    (visit.patientsAhead === 0 ||
      (hasHistory && spread <= 10))
  ) {
    return "high";
  }

  return spread > 30 ? "low" : "medium";
}

function clockTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-US", {
    timeZone: "America/Toronto",
    hour: "numeric",
    minute: "2-digit",
  });
}

function explain(
  patient: ClinicStatePatient,
  state: ClinicState,
  visit: SimulatedVisit,
  placement: WalkInBlockPlacement | null,
  mayMissWalkInHours: boolean,
): string[] {
  const provider = state.providers.find(
    (item) => item.doctorId === visit.projectedDoctorId,
  );

  const doctorName = provider
    ? `Dr. ${provider.firstName} ${provider.lastName}`
    : `provider ${visit.projectedDoctorId}`;

  const lines: string[] = [];

  if (visit.spillover) {
    lines.push(
      `Walk-in hours are full, so this patient is fitted into free time with ${doctorName} at ${clockTime(visit.projectedStartAt)} (no booked patient is moved).`,
    );
  } else if (placement?.status === "later") {
    lines.push(
      `Today's current walk-in hours are full; next walk-in time is ${clockTime(visit.projectedStartAt)} with ${doctorName}.`,
    );
  } else {
    lines.push(
      visit.estimatedWaitMinutes === 0
        ? `Can be seen now by ${doctorName}.`
        : `Projected to be seen by ${doctorName}.`,
    );
  }

  if (visit.patientsAhead > 0) {
    lines.push(
      `${visit.patientsAhead} patient(s) ahead with this doctor.`,
    );
  }

  if (mayMissWalkInHours && placement) {
    lines.push(
      `If visits run long, may not be seen before walk-in hours end at ${clockTime(placement.endsAt)}.`,
    );
  }

  if (visit.delayReason) {
    lines.push(`${visit.delayReason}.`);
  }

  const estimate = estimateVisitDuration({
    durationMinutes: patient.durationMinutes,
    appointmentTypeId: patient.appointmentTypeId,
    durationStats: state.durationStats,
  });

  if (estimate.source === "historical") {
    lines.push(
      `Visit length based on ${estimate.sampleSize} recent visits of this type.`,
    );
  }

  return lines;
}

function hypotheticalWalkIn(
  id: number,
  now: Date,
): ClinicStatePatient {
  return {
    appointmentId: id,
    patientId: id,
    doctorId: null,
    assignmentMode: "auto",
    appointmentTypeId: null,
    visitType: "walk_in",
    // Treated as ready now (already through forms), so
    // the estimate is "from check-in".
    status: "checked_in",
    scheduledStartAt: null,
    durationMinutes: null,
    arrivedAt: now.toISOString(),
    checkedInAt: now.toISOString(),
    roomedAt: null,
    consultStartedAt: null,
  };
}

/*
 * Predicts waits for every patient currently waiting
 * (booked and walk-in, including walk-ins not checked in
 * yet) plus a "walk in now" estimate, from one clinic
 * snapshot. Three simulations: expected, short and long
 * visit lengths.
 */
export function predictClinic(
  state: ClinicState,
  now = new Date(state.generatedAt),
  options: {
    lateBookingPolicy?: LateBookingPolicy;
  } = {},
): ClinicPredictions {
  const nowMs = now.getTime();

  const newWalkIn = hypotheticalWalkIn(
    NEW_WALK_IN_ID,
    now,
  );

  const simulationOptions = {
    extraWalkIns: [newWalkIn],
    // Same admission rule as Add Walk-In: a new
    // walk-in must finish inside the block.
    extraWalkInsMustFinishInBlock: true,
    lateBookingPolicy: options.lateBookingPolicy,
  };

  const expected = simulateClinic(
    state,
    now,
    simulationOptions,
  );

  const random = seededRandom(SAMPLE_SEED);

  const sampledRuns = Array.from(
    { length: SAMPLE_RUNS },
    () =>
      simulateClinic(state, now, {
        ...simulationOptions,
        durationOverrides: sampleDurations(
          state,
          [newWalkIn],
          nowMs,
          random,
        ),
      }),
  );

  const waiting = [
    ...state.scheduledQueue,
    ...state.walkInQueue,
    ...state.pendingWalkIns,
  ];

  const predictions: WaitPrediction[] =
    waiting.map((patient) => {
      const base = {
        appointmentId: patient.appointmentId,
        patientId: patient.patientId,
        predictionType: patient.visitType,
        predictedAt: expected.simulatedAt,
      };

      const visit = findVisit(
        expected,
        patient.appointmentId,
      );

      if (!visit) {
        const reason = expected.unassigned.find(
          (item) =>
            item.appointmentId ===
            patient.appointmentId,
        )?.reason;

        return {
          ...base,
          expectedWaitMinutes: null,
          lowerWaitMinutes: null,
          upperWaitMinutes: null,
          projectedProviderId: patient.doctorId,
          projectedStartAt: null,
          patientsAhead: null,
          confidence: "low",
          explanation: [
            reason === "provider_unavailable"
              ? "The doctor is currently unavailable."
              : "No walk-in time left today, so a wait cannot be projected.",
          ],
          delayStatus: "none",
          delayMinutes: 0,
          delayReason: null,
          walkInBlock: null,
          mayMissWalkInHours: false,
          spillover: false,
        };
      }

      const range = sampledRange(
        visit,
        patient.appointmentId,
        sampledRuns,
        nowMs,
      );

      const placement = blockPlacement(visit, nowMs);

      return {
        ...base,
        expectedWaitMinutes: range.expectedMinutes,
        lowerWaitMinutes: range.lowerMinutes,
        upperWaitMinutes: range.upperMinutes,
        projectedProviderId:
          visit.projectedDoctorId,
        projectedStartAt: visit.projectedStartAt,
        patientsAhead: visit.patientsAhead,
        confidence: getConfidence(
          patient,
          state,
          visit,
          range.upperMinutes - range.lowerMinutes,
          range.mayMissWalkInHours,
        ),
        explanation: explain(
          patient,
          state,
          visit,
          placement,
          range.mayMissWalkInHours,
        ),
        delayStatus: visit.delayStatus,
        delayMinutes: visit.delayMinutes,
        delayReason: visit.delayReason,
        walkInBlock: placement,
        mayMissWalkInHours: range.mayMissWalkInHours,
        spillover: visit.spillover,
      };
    });

  /*
   * "Walk in now" estimate and remaining capacity.
   */
  const newVisit = findVisit(expected, NEW_WALK_IN_ID);

  const newRange = newVisit
    ? sampledRange(
        newVisit,
        NEW_WALK_IN_ID,
        sampledRuns,
        nowMs,
      )
    : null;

  const newPlacement = newVisit
    ? blockPlacement(newVisit, nowMs)
    : null;

  const acceptingDoctors = state.providers.filter(
    (provider) =>
      provider.walkInEligibleNow &&
      provider.status !== "unavailable" &&
      provider.roomName,
  ).length;

  /*
   * Spots left: add many typical walk-ins at the back of
   * the queue and count how many can still be seen,
   * start to finish, in a walk-in block that is open now.
   */
  const probes = Array.from(
    { length: CAPACITY_PROBE_COUNT },
    (_, index) =>
      hypotheticalWalkIn(-100 - index, now),
  );

  const capacityRun = simulateClinic(state, now, {
    extraWalkIns: probes,
    extraWalkInsMustFinishInBlock: true,
    lateBookingPolicy: options.lateBookingPolicy,
  });

  const spotsLeft = capacityRun.assignments.filter(
    (visit) =>
      visit.appointmentId <= -100 &&
      visit.walkInWindowStartAt !== null &&
      Date.parse(visit.walkInWindowStartAt) <= nowMs,
  ).length;

  const status: NewWalkInStatus = !newVisit
    ? "closed"
    : newPlacement?.status === "later"
      ? acceptingDoctors > 0
        ? "full"
        : "not_started"
      : "open";

  return {
    predictedAt: expected.simulatedAt,
    predictions,
    newWalkIn: {
      status,
      expectedWaitMinutes:
        newRange?.expectedMinutes ?? null,
      lowerWaitMinutes:
        newRange?.lowerMinutes ?? null,
      upperWaitMinutes:
        newRange?.upperMinutes ?? null,
      projectedProviderId:
        newVisit?.projectedDoctorId ?? null,
      nextOpeningAt:
        newVisit?.projectedStartAt ?? null,
      acceptingDoctors,
      spotsLeft,
      mayMissWalkInHours:
        status === "open" &&
        (newRange?.mayMissWalkInHours ?? false),
      walkInHoursEndAt:
        newRange?.walkInHoursEndAt ?? null,
    },
  };
}

/*
 * Single-patient prediction (kept for existing callers).
 */
export function predictWait({
  patient,
  state,
}: {
  patient: ClinicStatePatient;
  state: ClinicState;
}): WaitPrediction | undefined {
  return predictClinic(state).predictions.find(
    (item) =>
      item.appointmentId === patient.appointmentId,
  );
}

/*
 * =========================================================
 * WALK-IN ADMISSION CHECK
 * =========================================================
 *
 * Used by Add Walk-In. A new walk-in is accepted for the
 * current walk-in block only if their visit (this visit
 * type's expected length, after everyone already
 * waiting) is expected to FINISH before the block ends.
 * Otherwise staff see why and may override; the visit is
 * then flagged as possibly shorter than usual.
 */
export type WalkInAdmissionStatus =
  // Fits start to finish in a walk-in block open now.
  | "fits"
  // Starts in time but is expected to end after the
  // block ends.
  | "runs_over"
  // No room left in open blocks; next opening later.
  | "full"
  // Walk-in hours have not started yet today.
  | "not_started"
  // No walk-in time left today.
  | "closed";

export type WalkInAdmission = {
  status: WalkInAdmissionStatus;
  fits: boolean;

  durationMinutes: number;
  expectedWaitMinutes: number | null;
  projectedDoctorId: number | null;
  projectedStartAt: string | null;
  projectedEndAt: string | null;

  // End of the walk-in block the visit would start in.
  blockEndsAt: string | null;
  // How far past the block end the visit would run.
  overrunMinutes: number;

  // Earliest time the visit fits fully (later block).
  nextOpeningAt: string | null;
};

export function checkWalkInAdmission(
  state: ClinicState,
  now: Date,
  candidate: {
    appointmentTypeId: number | null;
    durationMinutes: number | null;
    assignmentMode: "auto" | "manual";
    doctorId: number | null;
  },
): WalkInAdmission {
  const nowMs = now.getTime();
  const CANDIDATE_ID = -2;

  const patient: ClinicStatePatient = {
    ...hypotheticalWalkIn(CANDIDATE_ID, now),
    appointmentTypeId: candidate.appointmentTypeId,
    durationMinutes: candidate.durationMinutes,
    assignmentMode: candidate.assignmentMode,
    doctorId:
      candidate.assignmentMode === "manual"
        ? candidate.doctorId
        : null,
  };

  const durationMinutes = estimateVisitDuration({
    durationMinutes: candidate.durationMinutes,
    appointmentTypeId: candidate.appointmentTypeId,
    durationStats: state.durationStats,
  }).expectedMinutes;

  const empty = {
    durationMinutes,
    expectedWaitMinutes: null,
    projectedDoctorId: null,
    projectedStartAt: null,
    projectedEndAt: null,
    blockEndsAt: null,
    overrunMinutes: 0,
    nextOpeningAt: null,
  };

  const minutesFromNow = (iso: string) =>
    Math.max(
      0,
      Math.round((Date.parse(iso) - nowMs) / MINUTE),
    );

  const describe = (
    visit: SimulatedVisit,
    blockEndsAt: string | null,
  ) => ({
    expectedWaitMinutes: minutesFromNow(
      visit.projectedStartAt,
    ),
    projectedDoctorId: visit.projectedDoctorId,
    projectedStartAt: visit.projectedStartAt,
    projectedEndAt: visit.projectedEndAt,
    blockEndsAt,
    overrunMinutes: blockEndsAt
      ? Math.max(
          0,
          Math.round(
            (Date.parse(visit.projectedEndAt) -
              Date.parse(blockEndsAt)) /
              MINUTE,
          ),
        )
      : 0,
  });

  /*
   * Manual: the walk-in waits for the chosen doctor; it
   * must finish before that doctor's current walk-in
   * block ends.
   */
  if (candidate.assignmentMode === "manual") {
    const provider = state.providers.find(
      (item) => item.doctorId === candidate.doctorId,
    );

    const visit = findVisit(
      simulateClinic(state, now, {
        extraWalkIns: [patient],
      }),
      CANDIDATE_ID,
    );

    if (!visit || !provider) {
      return { ...empty, status: "closed", fits: false };
    }

    // The walk-in block the doctor is in right now
    // (from today's schedule; the summary field is a
    // fallback when no schedule is loaded).
    const currentBlock = (provider.todayBlocks ?? []).find(
      (item) =>
        item.blockType === "walk_in" &&
        Date.parse(item.startAt) <= nowMs &&
        nowMs < Date.parse(item.endAt),
    );

    const blockEndsAt =
      currentBlock?.endAt ??
      (provider.walkInEligibleNow
        ? provider.walkInBlockEndsAt
        : null);

    if (!blockEndsAt) {
      return {
        ...empty,
        ...describe(visit, null),
        status: "closed",
        fits: false,
      };
    }

    const fits =
      Date.parse(visit.projectedEndAt) <=
      Date.parse(blockEndsAt);

    return {
      ...empty,
      ...describe(visit, blockEndsAt),
      status: fits ? "fits" : "runs_over",
      fits,
    };
  }

  /*
   * Auto: strict run (must finish in a block) and loose
   * run (only has to start in it).
   */
  const strict = findVisit(
    simulateClinic(state, now, {
      extraWalkIns: [patient],
      extraWalkInsMustFinishInBlock: true,
    }),
    CANDIDATE_ID,
  );

  const strictPlacement = strict
    ? blockPlacement(strict, nowMs)
    : null;

  if (strict && strictPlacement?.status === "current") {
    return {
      ...empty,
      ...describe(strict, strictPlacement.endsAt),
      status: "fits",
      fits: true,
    };
  }

  const loose = findVisit(
    simulateClinic(state, now, {
      extraWalkIns: [patient],
    }),
    CANDIDATE_ID,
  );

  const loosePlacement = loose
    ? blockPlacement(loose, nowMs)
    : null;

  if (loose && loosePlacement?.status === "current") {
    return {
      ...empty,
      ...describe(loose, loosePlacement.endsAt),
      status: "runs_over",
      fits: false,
      nextOpeningAt: strict?.projectedStartAt ?? null,
    };
  }

  if (strict) {
    const acceptingNow = state.providers.some(
      (provider) =>
        provider.walkInEligibleNow &&
        provider.status !== "unavailable" &&
        provider.roomName,
    );

    return {
      ...empty,
      ...describe(strict, strictPlacement?.endsAt ?? null),
      overrunMinutes: 0,
      status: acceptingNow ? "full" : "not_started",
      fits: false,
      nextOpeningAt: strict.projectedStartAt,
    };
  }

  return { ...empty, status: "closed", fits: false };
}

/*
 * =========================================================
 * NEXT-STEP OPTIONS FOR A WAITING WALK-IN
 * =========================================================
 *
 * When a walk-in won't be seen before their walk-in hours
 * end, the patient chooses:
 * - next available: the earliest walk-in hours of any
 *   doctor (assignment "auto"), or
 * - a specific doctor: that doctor's next walk-in hours
 *   (assignment "manual").
 *
 * Each option is simulated with the rest of the queue
 * unchanged, so the times are what the patient would
 * actually get. Their place in line (check-in order) is
 * kept either way.
 */
export type WalkInNextStepOption = {
  doctorId: number | null;
  doctorName: string | null;
  startAt: string | null;
  waitMinutes: number | null;
  // Today's walk-in hours still ahead for this doctor.
  walkInHours: { startAt: string; endAt: string }[];
};

export type WalkInNextStepOptions = {
  appointmentId: number;
  currentMode: "auto" | "manual";
  currentDoctorId: number | null;
  nextAvailable: WalkInNextStepOption | null;
  doctors: WalkInNextStepOption[];
};

export function walkInNextStepOptions(
  state: ClinicState,
  now: Date,
  appointmentId: number,
): WalkInNextStepOptions | null {
  const nowMs = now.getTime();

  const original = [
    ...state.walkInQueue,
    ...state.pendingWalkIns,
  ].find((patient) => patient.appointmentId === appointmentId);

  if (!original) {
    return null;
  }

  const withAssignment = (
    assignmentMode: "auto" | "manual",
    doctorId: number | null,
  ): ClinicState => {
    const swap = (list: ClinicStatePatient[]) =>
      list.map((patient) =>
        patient.appointmentId === appointmentId
          ? { ...patient, assignmentMode, doctorId }
          : patient,
      );

    return {
      ...state,
      walkInQueue: swap(state.walkInQueue),
      pendingWalkIns: swap(state.pendingWalkIns),
    };
  };

  const doctorName = (doctorId: number | null) => {
    const provider = state.providers.find(
      (item) => item.doctorId === doctorId,
    );

    return provider
      ? `${provider.firstName} ${provider.lastName}`
      : null;
  };

  const hoursAhead = (doctorId: number) =>
    (
      state.providers.find(
        (item) => item.doctorId === doctorId,
      )?.todayBlocks ?? []
    )
      .filter(
        (block) =>
          block.blockType === "walk_in" &&
          Date.parse(block.endAt) > nowMs,
      )
      .map((block) => ({
        startAt: block.startAt,
        endAt: block.endAt,
      }));

  const option = (
    simulatedState: ClinicState,
    fallbackDoctorId: number | null,
  ): WalkInNextStepOption => {
    const visit = findVisit(
      simulateClinic(simulatedState, now),
      appointmentId,
    );

    const doctorId =
      visit?.projectedDoctorId ?? fallbackDoctorId;

    return {
      doctorId,
      doctorName: doctorName(doctorId),
      startAt: visit?.projectedStartAt ?? null,
      waitMinutes: visit
        ? visit.estimatedWaitMinutes
        : null,
      walkInHours:
        doctorId !== null ? hoursAhead(doctorId) : [],
    };
  };

  const nextAvailable = option(
    withAssignment("auto", null),
    null,
  );

  const doctors = state.providers
    .filter((provider) => provider.status !== "unavailable" || hoursAhead(provider.doctorId).length > 0)
    .map((provider) =>
      option(
        withAssignment("manual", provider.doctorId),
        provider.doctorId,
      ),
    )
    .sort(
      (a, b) =>
        (a.startAt ? Date.parse(a.startAt) : Infinity) -
        (b.startAt ? Date.parse(b.startAt) : Infinity),
    );

  return {
    appointmentId,
    currentMode: original.assignmentMode,
    currentDoctorId: original.doctorId,
    nextAvailable:
      nextAvailable.startAt !== null
        ? nextAvailable
        : null,
    doctors,
  };
}
