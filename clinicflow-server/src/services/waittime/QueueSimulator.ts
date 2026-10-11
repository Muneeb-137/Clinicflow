import type {
  ClinicState,
  ClinicStatePatient,
  ClinicStateProvider,
} from "./types.js";

import {
  estimateVisitDuration,
} from "./DurationEstimator.js";

/*
 * =========================================================
 * QUEUE SIMULATOR
 * =========================================================
 *
 * Projects when every waiting patient will be seen and by
 * which doctor, by playing the clinic forward on one
 * timeline per doctor, using each doctor's schedule for
 * the rest of today.
 *
 * Order of placement (clinic policy):
 *
 * 1. Booked patients go first on their own doctor's
 *    timeline, in appointment-time order, starting at
 *    their appointment time (an early arrival waits for
 *    it; a late one is seen when the doctor is free). A
 *    booked patient who has not arrived still reserves
 *    their slot. Walk-ins never push these back.
 *
 * 2. Walk-ins, first come first served (checked-in ones by
 *    check-in time, then arrived-but-not-checked-in ones by
 *    arrival). Each takes the earliest gap, on any doctor
 *    with a room, inside one of that doctor's walk-in
 *    blocks today (now or later), long enough for the
 *    visit. A walk-in that does not fit before a booked
 *    slot is placed after it instead of being dropped.
 *
 * Blocked time (lunch etc.) is never used. A doctor who is
 * "unavailable" before their shift is assumed to start at
 * their next block; one who is unavailable during their
 * shift (stepped away) cannot be projected.
 *
 * The same simulation runs with expected, short (lower)
 * and long (upper) visit lengths to give a wait range.
 */

export type DurationScenario =
  | "expected"
  | "lower"
  | "upper";

export type DelayStatus =
  | "none"
  | "consult_overrun";

export type UnassignedReason =
  | "provider_unavailable"
  | "no_eligible_provider";

export type SimulatedVisit = {
  appointmentId: number;
  visitType: "scheduled" | "walk_in";

  projectedDoctorId: number;
  projectedStartAt: string;
  projectedEndAt: string;
  estimatedWaitMinutes: number;
  durationMinutes: number;

  // Patients ahead of this one on the same doctor.
  patientsAhead: number;

  delayStatus: DelayStatus;
  delayMinutes: number;
  delayReason: string | null;

  /*
   * Auto walk-ins: the walk-in block the visit starts in
   * (null for booked and manual walk-ins). Lets callers
   * tell "seen in the block open now" from "pushed to a
   * later block".
   */
  walkInWindowStartAt: string | null;
  walkInWindowEndAt: string | null;

  /*
   * Accepted auto walk-in seen in a free gap OUTSIDE
   * walk-in hours (any doctor's working time, never
   * displacing a booked patient), because they could not
   * start in a walk-in block that is open now.
   */
  spillover: boolean;
};

export type QueueSimulationResult = {
  simulatedAt: string;
  scenario: DurationScenario;

  // Walk-ins (checked in and pending).
  assignments: SimulatedVisit[];

  // Checked-in booked patients.
  scheduledAssignments: SimulatedVisit[];

  unassigned: {
    appointmentId: number;
    reason: UnassignedReason;
  }[];

  // Kept for existing callers.
  unassignedAppointmentIds: number[];

  // How the engine planned each doctor's day (for the
  // Wait Time Lab and debugging).
  doctorTimelines: DoctorTimeline[];
};

export type TimelineEntryKind =
  | "current_visit"
  | "blocked"
  | "booked_waiting"
  | "booked_upcoming"
  | "walk_in";

export type DoctorTimeline = {
  doctorId: number;
  status: ClinicStateProvider["status"];

  // When the engine thinks the doctor is next free.
  freeFrom: string | null;
  freeFromReason: string;

  acceptsAutoWalkIns: boolean;
  walkInWindows: { start: string; end: string }[];

  delayStatus: DelayStatus;
  delayMinutes: number;

  entries: {
    kind: TimelineEntryKind;
    appointmentId: number | null;
    start: string;
    end: string;
  }[];
};

/*
 * Booked patients whose appointment time has passed but
 * who have not arrived (and are not yet marked missed):
 * - "reserve": keep their time as if they could walk in
 *   now (they take priority when they arrive)
 * - "ignore": assume they will not come
 */
export type LateBookingPolicy =
  | "reserve"
  | "ignore";

// "ignore" measured better in the evaluation harness:
// reserving late, not-yet-arrived patients pushed back
// predictions for patients actually waiting.
export const DEFAULT_LATE_BOOKING_POLICY: LateBookingPolicy =
  "ignore";

/*
 * Clinic policy: booked patients are seen at their
 * appointment time, not earlier, even if they arrive
 * early; walk-ins use the doctor's time before it.
 */
export const DEFAULT_EARLY_ROOMING_MINUTES = 0;

export const DEFAULT_ALLOW_SPILLOVER = false;

type SimulateOptions = {
  scenario?: DurationScenario;

  /*
   * Extra walk-ins to add at the back of the queue, e.g. a
   * hypothetical "if someone walks in now" patient.
   */
  extraWalkIns?: ClinicStatePatient[];

  /*
   * Admission rule for the extra (hypothetical) walk-ins:
   * their whole visit must fit inside a walk-in block,
   * not just start in it. Used to decide whether a new
   * walk-in can still be accepted for the current block.
   * Patients already in the queue keep the "start before
   * the block ends" rule.
   */
  extraWalkInsMustFinishInBlock?: boolean;

  /*
   * Let accepted walk-ins who cannot start in an open
   * walk-in block use free gaps in any doctor's working
   * time. Off by default: clinic policy is that walk-ins
   * are seen only during walk-in hours (the same doctor's
   * next hours, or the next available doctor's).
   */
  allowSpillover?: boolean;

  /*
   * Visit length (minutes) per appointment id, replacing
   * the estimate. Used to play the clinic out many times
   * with realistic, mixed visit lengths (likely range).
   */
  durationOverrides?: Map<number, number>;

  lateBookingPolicy?: LateBookingPolicy;

  /*
   * How early a booked patient who has arrived may be
   * seen before their appointment time.
   */
  earlyRoomingMinutes?: number;
};

type Interval = {
  start: number;
  end: number;

  // What occupies this time (for explanations).
  kind?: TimelineEntryKind;
  appointmentId?: number | null;
};

type Timeline = {
  provider: ClinicStateProvider;

  // null = doctor cannot be projected today.
  freeFrom: number | null;
  freeFromReason: string;

  // Today's walk-in blocks that have not ended.
  walkInWindows: Interval[];

  // Has a room and a walk-in block left today.
  acceptsAutoWalkIns: boolean;

  // Today's working blocks (booked or walk-in) that have
  // not ended; used for spillover.
  dutyWindows: Interval[];

  busy: Interval[];

  delayStatus: DelayStatus;
  delayMinutes: number;
  delayReason: string | null;
};

const MINUTE = 60_000;

// Walk-in arrival -> check-in when no history is loaded.
export const DEFAULT_CHECK_IN_MINUTES = 5;

function minutesBetween(
  start: number,
  end: number,
): number {
  return Math.max(
    0,
    Math.round((end - start) / MINUTE),
  );
}

function visitMinutes(
  patient: ClinicStatePatient,
  state: ClinicState,
  scenario: DurationScenario,
  overrides?: Map<number, number>,
): number {
  const override = overrides?.get(patient.appointmentId);

  if (override !== undefined) {
    return override;
  }

  const estimate = estimateVisitDuration({
    durationMinutes: patient.durationMinutes,
    appointmentTypeId: patient.appointmentTypeId,
    durationStats: state.durationStats,
  });

  if (scenario === "lower") {
    return estimate.lowerMinutes;
  }

  if (scenario === "upper") {
    return estimate.upperMinutes;
  }

  return estimate.expectedMinutes;
}

function blocksOf(
  provider: ClinicStateProvider,
  predicate: (blockType: string) => boolean,
): Interval[] {
  return (provider.todayBlocks ?? [])
    .filter((block) => predicate(block.blockType))
    .map((block) => ({
      start: Date.parse(block.startAt),
      end: Date.parse(block.endAt),
    }))
    .sort((a, b) => a.start - b.start);
}

const isDutyBlock = (blockType: string) =>
  blockType === "scheduled" || blockType === "walk_in";

/*
 * When the doctor will next be free, based on their live
 * status, the visit they are in, and today's schedule.
 */
function getProviderFreeFrom(
  provider: ClinicStateProvider,
  state: ClinicState,
  now: number,
  scenario: DurationScenario,
  overrides?: Map<number, number>,
): Pick<
  Timeline,
  | "freeFrom"
  | "freeFromReason"
  | "delayStatus"
  | "delayMinutes"
  | "delayReason"
> {
  const none = {
    delayStatus: "none" as const,
    delayMinutes: 0,
    delayReason: null,
  };

  const clock = (time: number) =>
    new Date(time).toLocaleTimeString("en-US", {
      timeZone: "America/Toronto",
      hour: "numeric",
      minute: "2-digit",
    });

  if (provider.status === "available") {
    return {
      freeFrom: now,
      freeFromReason: "Available now.",
      ...none,
    };
  }

  if (provider.status !== "in_consult") {
    /*
     * Unavailable. Before (or between) shifts, assume
     * they start at their next block today. During a
     * shift they have stepped away; unknown.
     */
    const duty = blocksOf(provider, isDutyBlock);

    const inShift = duty.some(
      (block) => block.start <= now && now < block.end,
    );

    const nextStart = duty.find(
      (block) => block.start > now,
    )?.start;

    if (!inShift && nextStart !== undefined) {
      return {
        freeFrom: nextStart,
        freeFromReason: `Not started yet; shift starts at ${clock(nextStart)}.`,
        ...none,
      };
    }

    return {
      freeFrom: null,
      freeFromReason: inShift
        ? "Marked unavailable during their shift; cannot be projected."
        : "No more shifts today.",
      ...none,
    };
  }

  const activeVisit = state.activeVisits.find(
    (visit) =>
      visit.doctorId === provider.doctorId,
  );

  /*
   * Best signal: the doctor's own "ready in N minutes"
   * estimate, while it is still in the future.
   */
  if (provider.estimatedReadyAt) {
    const readyAt = Date.parse(
      provider.estimatedReadyAt,
    );

    if (readyAt > now) {
      return {
        freeFrom: readyAt,
        freeFromReason: `In consult; doctor said ready at ${clock(readyAt)}.`,
        ...none,
      };
    }
  }

  const expectedMinutes = activeVisit
    ? visitMinutes(activeVisit, state, scenario, overrides)
    : 20;

  const consultStartedAt = activeVisit
    ?.consultStartedAt
    ? Date.parse(activeVisit.consultStartedAt)
    : now;

  const expectedEnd =
    consultStartedAt + expectedMinutes * MINUTE;

  if (expectedEnd > now) {
    return {
      freeFrom: expectedEnd,
      freeFromReason: `In consult since ${clock(consultStartedAt)} (expected ${expectedMinutes} min); free about ${clock(expectedEnd)}.`,
      ...none,
    };
  }

  /*
   * The visit has run past its expected length (or the
   * doctor's own estimate passed) and they are still in
   * consult. Assume a little more time, proportional to
   * the visit, rather than pretending they are free.
   */
  const overrunMinutes = Math.max(
    5,
    Math.round(expectedMinutes * 0.25),
  );

  const overBy = Math.round(
    (now - expectedEnd) / MINUTE,
  );

  return {
    freeFrom: now + overrunMinutes * MINUTE,
    freeFromReason: `Still in consult, ${overBy} min past the expected ${expectedMinutes} min; assuming ${overrunMinutes} more min.`,
    delayStatus: "consult_overrun",
    delayMinutes: overrunMinutes,
    delayReason: "Doctor still in consultation",
  };
}

/*
 * Earliest start >= from for a visit of `duration` ms that
 * fits between busy intervals and starts before
 * latestStart (exclusive). Returns null if none.
 */
function findEarliestGap(
  busy: Interval[],
  from: number,
  duration: number,
  latestStart: number,
): number | null {
  let candidate = from;

  for (const interval of busy) {
    if (interval.end <= candidate) {
      continue;
    }

    if (candidate + duration <= interval.start) {
      break;
    }

    candidate = Math.max(candidate, interval.end);
  }

  return candidate < latestStart
    ? candidate
    : null;
}

/*
 * Earliest start inside any of the windows (walk-in
 * blocks). The visit may run past the block's end, as
 * long as it starts inside it.
 */
function findEarliestGapInWindows(
  busy: Interval[],
  from: number,
  duration: number,
  windows: Interval[],
): number | null {
  for (const window of windows) {
    if (window.end <= from) {
      continue;
    }

    const start = findEarliestGap(
      busy,
      Math.max(from, window.start),
      duration,
      window.end,
    );

    if (start !== null) {
      return start;
    }
  }

  return null;
}

function insertInterval(
  busy: Interval[],
  interval: Interval,
) {
  const index = busy.findIndex(
    (existing) => existing.start > interval.start,
  );

  if (index === -1) {
    busy.push(interval);
  } else {
    busy.splice(index, 0, interval);
  }
}

const toIso = (time: number) =>
  new Date(time).toISOString();

function toDoctorTimeline(
  timeline: Timeline,
  state: ClinicState,
  now: number,
): DoctorTimeline {
  const activeVisit = state.activeVisits.find(
    (visit) =>
      visit.doctorId === timeline.provider.doctorId,
  );

  const entries: DoctorTimeline["entries"] = [];

  // The visit in progress, until the doctor is free.
  if (
    timeline.provider.status === "in_consult" &&
    timeline.freeFrom !== null
  ) {
    entries.push({
      kind: "current_visit",
      appointmentId: activeVisit?.appointmentId ?? null,
      start: toIso(
        activeVisit?.consultStartedAt
          ? Date.parse(activeVisit.consultStartedAt)
          : now,
      ),
      end: toIso(timeline.freeFrom),
    });
  }

  for (const interval of timeline.busy) {
    entries.push({
      kind: interval.kind ?? "blocked",
      appointmentId: interval.appointmentId ?? null,
      start: toIso(interval.start),
      end: toIso(interval.end),
    });
  }

  return {
    doctorId: timeline.provider.doctorId,
    status: timeline.provider.status,
    freeFrom:
      timeline.freeFrom === null
        ? null
        : toIso(timeline.freeFrom),
    freeFromReason: timeline.freeFromReason,
    acceptsAutoWalkIns: timeline.acceptsAutoWalkIns,
    walkInWindows: timeline.walkInWindows.map(
      (window) => ({
        start: toIso(window.start),
        end: toIso(window.end),
      }),
    ),
    delayStatus: timeline.delayStatus,
    delayMinutes: timeline.delayMinutes,
    entries,
  };
}

function timeOrInfinity(
  value: string | null,
): number {
  return value
    ? Date.parse(value)
    : Number.POSITIVE_INFINITY;
}

export function simulateClinic(
  state: ClinicState,
  simulationTime = new Date(),
  options: SimulateOptions = {},
): QueueSimulationResult {
  const scenario = options.scenario ?? "expected";
  const lateBookingPolicy =
    options.lateBookingPolicy ??
    DEFAULT_LATE_BOOKING_POLICY;

  const earlyRoomingMs =
    (options.earlyRoomingMinutes ??
      DEFAULT_EARLY_ROOMING_MINUTES) * MINUTE;

  const now = simulationTime.getTime();

  const durationOverrides = options.durationOverrides;

  const timelines = new Map<number, Timeline>();

  for (const provider of state.providers) {
    const availability = getProviderFreeFrom(
      provider,
      state,
      now,
      scenario,
      durationOverrides,
    );

    let walkInWindows = blocksOf(
      provider,
      (type) => type === "walk_in",
    ).filter((block) => block.end > now);

    // No schedule loaded: fall back to the walk-in block
    // the doctor is in right now.
    if (
      (provider.todayBlocks ?? []).length === 0 &&
      provider.walkInEligibleNow &&
      provider.walkInBlockEndsAt
    ) {
      walkInWindows = [
        {
          start: now,
          end: Date.parse(provider.walkInBlockEndsAt),
        },
      ];
    }

    // Lunch and other non-bookable time is busy.
    const busy = blocksOf(
      provider,
      (type) => !isDutyBlock(type),
    )
      .filter((block) => block.end > now)
      .map((block) => ({
        ...block,
        kind: "blocked" as const,
        appointmentId: null,
      }));

    const dutyWindows = blocksOf(
      provider,
      isDutyBlock,
    ).filter((block) => block.end > now);

    timelines.set(provider.doctorId, {
      provider,
      ...availability,
      walkInWindows,
      dutyWindows,
      acceptsAutoWalkIns:
        availability.freeFrom !== null &&
        Boolean(provider.roomName) &&
        walkInWindows.length > 0,
      busy,
    });
  }

  const scheduledAssignments: SimulatedVisit[] = [];
  const assignments: SimulatedVisit[] = [];

  const unassigned: QueueSimulationResult["unassigned"] =
    [];

  /*
   * ---------------------------------------------------
   * 1. BOOKED PATIENTS, per doctor, in appointment order
   * ---------------------------------------------------
   */
  const bookedByDoctor = new Map<
    number,
    {
      patient: ClinicStatePatient;
      arrived: boolean;
    }[]
  >();

  const addBooking = (
    patient: ClinicStatePatient,
    arrived: boolean,
  ) => {
    if (patient.doctorId === null) {
      return;
    }

    const list =
      bookedByDoctor.get(patient.doctorId) ?? [];

    list.push({ patient, arrived });
    bookedByDoctor.set(patient.doctorId, list);
  };

  for (const patient of state.scheduledQueue) {
    addBooking(patient, true);
  }

  for (
    const patient of state.upcomingScheduledAppointments
  ) {
    const isLate =
      timeOrInfinity(patient.scheduledStartAt) <= now;

    if (isLate && lateBookingPolicy === "ignore") {
      continue;
    }

    addBooking(patient, false);
  }

  for (const [doctorId, bookings] of bookedByDoctor) {
    const timeline = timelines.get(doctorId);

    bookings.sort(
      (a, b) =>
        timeOrInfinity(a.patient.scheduledStartAt) -
        timeOrInfinity(b.patient.scheduledStartAt),
    );

    if (!timeline || timeline.freeFrom === null) {
      // Doctor cannot be projected: waiting patients get
      // no estimate. Not-arrived bookings still block.
      for (const { patient, arrived } of bookings) {
        if (arrived) {
          unassigned.push({
            appointmentId: patient.appointmentId,
            reason: "provider_unavailable",
          });
        } else if (timeline && patient.scheduledStartAt) {
          const start = Math.max(
            now,
            Date.parse(patient.scheduledStartAt),
          );

          insertInterval(timeline.busy, {
            start,
            end:
              start +
              visitMinutes(patient, state, scenario, durationOverrides) *
                MINUTE,
            kind: "booked_upcoming",
            appointmentId: patient.appointmentId,
          });
        }
      }

      continue;
    }

    let clock = timeline.freeFrom;
    let patientsAhead = 0;

    for (const { patient, arrived } of bookings) {
      const duration =
        visitMinutes(patient, state, scenario, durationOverrides) * MINUTE;

      /*
       * A booked patient's turn starts at their appointment
       * time, even if they arrive early (the doctor uses
       * the time before for walk-ins); at most
       * earlyRoomingMinutes earlier. Late arrivals are seen
       * as soon as the doctor is free.
       */
      const appointmentAt = timeOrInfinity(
        patient.scheduledStartAt,
      );

      const earliest = Math.max(
        now,
        appointmentAt === Number.POSITIVE_INFINITY
          ? now
          : appointmentAt - earlyRoomingMs,
      );

      // Skip over lunch/blocked time.
      const start =
        findEarliestGap(
          timeline.busy,
          Math.max(clock, earliest),
          duration,
          Number.POSITIVE_INFINITY,
        ) ?? Math.max(clock, earliest);

      const end = start + duration;

      insertInterval(timeline.busy, {
        start,
        end,
        kind: arrived
          ? "booked_waiting"
          : "booked_upcoming",
        appointmentId: patient.appointmentId,
      });

      clock = end;

      if (arrived) {
        scheduledAssignments.push({
          appointmentId: patient.appointmentId,
          visitType: "scheduled",
          projectedDoctorId: doctorId,
          projectedStartAt: new Date(start).toISOString(),
          projectedEndAt: new Date(end).toISOString(),
          estimatedWaitMinutes: minutesBetween(now, start),
          durationMinutes: Math.round(duration / MINUTE),
          patientsAhead,
          delayStatus: timeline.delayStatus,
          delayMinutes: timeline.delayMinutes,
          delayReason: timeline.delayReason,
          walkInWindowStartAt: null,
          walkInWindowEndAt: null,
          spillover: false,
        });
      }

      patientsAhead += 1;
    }
  }

  /*
   * ---------------------------------------------------
   * 2. WALK-INS, first come first served
   * ---------------------------------------------------
   */
  const walkInQueue = [
    ...[...state.walkInQueue].sort(
      (a, b) =>
        timeOrInfinity(a.checkedInAt) -
        timeOrInfinity(b.checkedInAt),
    ),
    ...[...state.pendingWalkIns].sort(
      (a, b) =>
        timeOrInfinity(a.arrivedAt) -
        timeOrInfinity(b.arrivedAt),
    ),
    ...(options.extraWalkIns ?? []),
  ];

  const extraWalkIns = new Set(
    options.extraWalkIns ?? [],
  );

  const allowSpillover =
    options.allowSpillover ??
    DEFAULT_ALLOW_SPILLOVER;

  const mustFinishInBlock = new Set(
    options.extraWalkInsMustFinishInBlock
      ? (options.extraWalkIns ?? [])
      : [],
  );

  const checkInDelay =
    (state.checkInMinutes ??
      DEFAULT_CHECK_IN_MINUTES) * MINUTE;

  for (const patient of walkInQueue) {
    const duration =
      visitMinutes(patient, state, scenario, durationOverrides) * MINUTE;

    const isManual =
      patient.assignmentMode === "manual";

    /*
     * A walk-in who has not checked in yet (forms
     * pending) cannot be roomed until they finish.
     */
    const readyAt =
      patient.status === "checked_in"
        ? now
        : Math.max(
            now,
            timeOrInfinity(patient.arrivedAt) ===
              Number.POSITIVE_INFINITY
              ? now
              : timeOrInfinity(patient.arrivedAt) +
                  checkInDelay,
          );

    let best: {
      timeline: Timeline;
      start: number;
    } | null = null;

    let anyCandidate = false;

    for (const timeline of timelines.values()) {
      if (timeline.freeFrom === null) {
        continue;
      }

      if (
        isManual &&
        timeline.provider.doctorId !== patient.doctorId
      ) {
        continue;
      }

      /*
       * Walk-ins are seen during walk-in hours. Auto
       * walk-ins: any doctor with a room and walk-in
       * hours left today. Manual walk-ins (patient chose
       * this doctor): that doctor's walk-in hours, now or
       * later today.
       */
      if (!isManual && !timeline.acceptsAutoWalkIns) {
        continue;
      }

      if (
        isManual &&
        timeline.walkInWindows.length === 0
      ) {
        continue;
      }

      anyCandidate = true;

      const from = Math.max(
        readyAt,
        timeline.freeFrom,
      );

      const start = findEarliestGapInWindows(
            timeline.busy,
            from,
            duration,
            mustFinishInBlock.has(patient)
              ? timeline.walkInWindows
                  .map((window) => ({
                    ...window,
                    // start + duration <= block end
                    end: window.end - duration + 1,
                  }))
                  .filter(
                    (window) => window.end > window.start,
                  )
              : timeline.walkInWindows,
          );

      if (start === null) {
        continue;
      }

      const windowEnd = (candidate: Timeline) =>
        candidate.walkInWindows[0]?.end ??
        Number.POSITIVE_INFINITY;

      if (
        !best ||
        start < best.start ||
        (start === best.start &&
          windowEnd(timeline) <
            windowEnd(best.timeline))
      ) {
        best = { timeline, start };
      }
    }

    /*
     * SPILLOVER (accepted walk-ins only, not hypothetical
     * ones being checked for admission): if this patient
     * cannot start in a walk-in block that is open now,
     * they may be seen in the earliest free gap in any
     * doctor's working time today (booked patients keep
     * their slots; lunch is never used). A later walk-in
     * block still counts if it comes first.
     */
    let spillover = false;

    const startsInOpenWalkInBlock =
      best !== null &&
      best.timeline.walkInWindows.some(
        (window) =>
          window.start <= now &&
          window.start <= best!.start &&
          best!.start < window.end,
      );

    if (
      allowSpillover &&
      !isManual &&
      !extraWalkIns.has(patient) &&
      !startsInOpenWalkInBlock
    ) {
      for (const timeline of timelines.values()) {
        if (
          timeline.freeFrom === null ||
          !timeline.provider.roomName
        ) {
          continue;
        }

        const start = findEarliestGapInWindows(
          timeline.busy,
          Math.max(readyAt, timeline.freeFrom),
          duration,
          timeline.dutyWindows,
        );

        if (
          start !== null &&
          (!best || start < best.start)
        ) {
          best = { timeline, start };

          spillover = !timeline.walkInWindows.some(
            (window) =>
              window.start <= start &&
              start < window.end,
          );
        }
      }
    }

    if (!best) {
      unassigned.push({
        appointmentId: patient.appointmentId,
        reason:
          !anyCandidate && isManual
            ? "provider_unavailable"
            : "no_eligible_provider",
      });

      continue;
    }

    const { timeline, start } = best;
    const end = start + duration;

    // Count only patients, not lunch/blocked time.
    const patientsAhead = timeline.busy.filter(
      (interval) =>
        interval.kind !== "blocked" &&
        interval.start < start &&
        interval.end > now,
    ).length;

    insertInterval(timeline.busy, {
      start,
      end,
      kind: "walk_in",
      appointmentId: patient.appointmentId,
    });

    const window = spillover
      ? undefined
      : timeline.walkInWindows.find(
          (candidate) =>
            candidate.start <= start &&
            start < candidate.end,
        );

    assignments.push({
      appointmentId: patient.appointmentId,
      visitType: "walk_in",
      projectedDoctorId: timeline.provider.doctorId,
      projectedStartAt: new Date(start).toISOString(),
      projectedEndAt: new Date(end).toISOString(),
      estimatedWaitMinutes: minutesBetween(now, start),
      durationMinutes: Math.round(duration / MINUTE),
      patientsAhead,
      delayStatus: timeline.delayStatus,
      delayMinutes: timeline.delayMinutes,
      delayReason: timeline.delayReason,
      walkInWindowStartAt: window
        ? new Date(window.start).toISOString()
        : null,
      walkInWindowEndAt: window
        ? new Date(window.end).toISOString()
        : null,
      spillover,
    });
  }

  return {
    simulatedAt: simulationTime.toISOString(),
    scenario,
    assignments,
    scheduledAssignments,
    unassigned,
    unassignedAppointmentIds: unassigned.map(
      (item) => item.appointmentId,
    ),
    doctorTimelines: [...timelines.values()].map(
      (timeline) =>
        toDoctorTimeline(timeline, state, now),
    ),
  };
}

/*
 * Walk-in projection used when rooming an auto-assigned
 * walk-in (appointmentRoutes) and by older callers.
 */
export function simulateWalkInQueue(
  state: ClinicState,
  simulationTime = new Date(),
): QueueSimulationResult {
  return simulateClinic(state, simulationTime);
}
