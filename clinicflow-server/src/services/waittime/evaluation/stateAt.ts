import type {
  ClinicState,
  ClinicStatePatient,
  ClinicStateProvider,
  DurationStats,
} from "../types.js";

/*
 * Rebuilds the engine's ClinicState at any moment from a
 * list of visit records, so predictions can be replayed
 * against what really happened (real history or a
 * simulated clinic).
 *
 * All times are epoch milliseconds.
 */

export type VisitRecord = {
  id: number;
  visitType: "scheduled" | "walk_in";

  // Booked doctor, or the walk-in's chosen doctor when
  // assignmentMode is "manual".
  bookedDoctorId: number | null;
  assignmentMode: "auto" | "manual";

  // Doctor who actually saw the patient.
  seenByDoctorId: number | null;

  appointmentTypeId: number | null;
  bookedMinutes: number | null;

  scheduledStartAt: number | null;
  arrivedAt: number | null;
  checkedInAt: number | null;
  roomedAt: number | null;
  endedAt: number | null;

  // When the booking stopped being expected (cancelled,
  // or marked missed). null = still expected.
  droppedAt: number | null;
};

export type ProviderDay = {
  doctorId: number;
  firstName: string;
  lastName: string;
  roomName: string | null;

  // When the doctor is working (any block type).
  onDuty: { start: number; end: number }[];

  // Walk-in blocks.
  walkInBlocks: { start: number; end: number }[];

  // Doctor's own "ready at" estimates are not
  // reconstructed; history does not record them.
};

const iso = (value: number | null) =>
  value === null ? null : new Date(value).toISOString();

function within(
  time: number,
  start: number | null,
  end: number | null,
) {
  return (
    start !== null &&
    start <= time &&
    (end === null || time < end)
  );
}

function toPatient(
  visit: VisitRecord,
  status: ClinicStatePatient["status"],
  time: number,
): ClinicStatePatient {
  const roomed = status === "roomed";

  return {
    appointmentId: visit.id,
    patientId: visit.id,

    // Auto walk-ins have no doctor until roomed.
    doctorId: roomed
      ? visit.seenByDoctorId
      : visit.visitType === "walk_in" &&
          visit.assignmentMode === "auto"
        ? null
        : visit.bookedDoctorId,

    assignmentMode: visit.assignmentMode,
    appointmentTypeId: visit.appointmentTypeId,
    visitType: visit.visitType,
    status,

    scheduledStartAt: iso(visit.scheduledStartAt),
    durationMinutes: visit.bookedMinutes,

    arrivedAt: within(time, visit.arrivedAt, null)
      ? iso(visit.arrivedAt)
      : null,
    checkedInAt: within(time, visit.checkedInAt, null)
      ? iso(visit.checkedInAt)
      : null,
    roomedAt: roomed ? iso(visit.roomedAt) : null,
    consultStartedAt: roomed ? iso(visit.roomedAt) : null,
  };
}

export function stateAt(
  time: number,
  visits: VisitRecord[],
  providers: ProviderDay[],
  durationStats: Record<number, DurationStats> = {},
  checkInMinutes?: number,
): ClinicState {
  const activeVisits: ClinicStatePatient[] = [];
  const scheduledQueue: ClinicStatePatient[] = [];
  const walkInQueue: ClinicStatePatient[] = [];
  const pendingWalkIns: ClinicStatePatient[] = [];
  const upcoming: ClinicStatePatient[] = [];

  /*
   * The snapshot is taken at the instant of the event
   * being predicted (a check-in), so rooming that happens
   * at exactly that instant has not happened yet. Without
   * this, patients roomed the same minute they checked in
   * would look "already roomed" and get no prediction.
   */
  for (const visit of visits) {
    if (
      visit.roomedAt !== null &&
      visit.roomedAt < time &&
      (visit.endedAt === null || time < visit.endedAt)
    ) {
      activeVisits.push(
        toPatient(visit, "roomed", time),
      );
      continue;
    }

    const roomedOrGone =
      (visit.roomedAt !== null &&
        visit.roomedAt < time) ||
      (visit.droppedAt !== null &&
        visit.droppedAt <= time);

    if (roomedOrGone) {
      continue;
    }

    if (
      visit.checkedInAt !== null &&
      visit.checkedInAt <= time
    ) {
      (visit.visitType === "walk_in"
        ? walkInQueue
        : scheduledQueue
      ).push(toPatient(visit, "checked_in", time));
      continue;
    }

    if (
      visit.visitType === "walk_in" &&
      visit.arrivedAt !== null &&
      visit.arrivedAt <= time
    ) {
      pendingWalkIns.push(
        toPatient(visit, "scheduled", time),
      );
      continue;
    }

    // Not arrived, and the booking window has not ended
    // (late patients are still expected, like the app,
    // which marks them missed when the window ends).
    if (
      visit.visitType === "scheduled" &&
      visit.scheduledStartAt !== null &&
      visit.scheduledStartAt +
        (visit.bookedMinutes ?? 0) * 60_000 >
        time
    ) {
      upcoming.push(
        toPatient(visit, "scheduled", time),
      );
    }
  }

  const stateProviders: ClinicStateProvider[] =
    providers.map((provider) => {
      const active = activeVisits.find(
        (visit) =>
          visit.doctorId === provider.doctorId,
      );

      const onDuty = provider.onDuty.some((block) =>
        within(time, block.start, block.end),
      );

      const walkInBlock = provider.walkInBlocks.find(
        (block) => within(time, block.start, block.end),
      );

      return {
        doctorId: provider.doctorId,
        firstName: provider.firstName,
        lastName: provider.lastName,

        status: active
          ? "in_consult"
          : onDuty
            ? "available"
            : "unavailable",
        statusReason: null,
        currentAppointmentId:
          active?.appointmentId ?? null,

        roomName: provider.roomName,

        walkInEligibleNow: Boolean(walkInBlock),
        walkInBlockEndsAt: walkInBlock
          ? iso(walkInBlock.end)
          : null,

        todayBlocks: [
          ...provider.walkInBlocks.map((block) => ({
            blockType: "walk_in",
            startAt: iso(block.start) as string,
            endAt: iso(block.end) as string,
          })),
          ...provider.onDuty
            .filter(
              (block) =>
                !provider.walkInBlocks.some(
                  (walkIn) =>
                    walkIn.start === block.start &&
                    walkIn.end === block.end,
                ),
            )
            .map((block) => ({
              blockType: "scheduled",
              startAt: iso(block.start) as string,
              endAt: iso(block.end) as string,
            })),
        ],

        estimatedReadyAt: null,
        readinessEstimateMinutes: null,
        readinessEstimateUpdatedAt: null,
      };
    });

  return {
    generatedAt: new Date(time).toISOString(),
    providers: stateProviders,
    scheduledQueue,
    walkInQueue,
    pendingWalkIns,
    activeVisits,
    upcomingScheduledAppointments: upcoming,
    durationStats,
    checkInMinutes,
  };
}

/*
 * Same filtering and percentiles as the live engine's
 * loadDurationStats, computed from visit records.
 */
export function durationStatsFrom(
  visits: VisitRecord[],
): Record<number, DurationStats> {
  const byType = new Map<number, number[]>();

  for (const visit of visits) {
    if (
      visit.appointmentTypeId === null ||
      visit.roomedAt === null ||
      visit.endedAt === null
    ) {
      continue;
    }

    const minutes =
      (visit.endedAt - visit.roomedAt) / 60_000;

    const cap = Math.min(
      240,
      3 * (visit.bookedMinutes ?? 30),
    );

    if (minutes < 2 || minutes > cap) {
      continue;
    }

    const list =
      byType.get(visit.appointmentTypeId) ?? [];
    list.push(minutes);
    byType.set(visit.appointmentTypeId, list);
  }

  const percentile = (sorted: number[], p: number) => {
    const index = (sorted.length - 1) * p;
    const low = Math.floor(index);
    const high = Math.ceil(index);

    return (
      sorted[low] +
      (sorted[high] - sorted[low]) * (index - low)
    );
  };

  const stats: Record<number, DurationStats> = {};

  for (const [typeId, values] of byType) {
    const sorted = [...values].sort((a, b) => a - b);

    stats[typeId] = {
      medianMinutes: percentile(sorted, 0.5),
      p25Minutes: percentile(sorted, 0.25),
      p75Minutes: percentile(sorted, 0.75),
      sampleSize: sorted.length,
    };
  }

  return stats;
}

/*
 * Median walk-in arrival -> check-in minutes, like the
 * live engine's loadCheckInMinutes (undefined until there
 * are 8 samples).
 */
export function checkInMinutesFrom(
  visits: VisitRecord[],
): number | undefined {
  const samples = visits
    .filter(
      (visit) =>
        visit.visitType === "walk_in" &&
        visit.arrivedAt !== null &&
        visit.checkedInAt !== null,
    )
    .map(
      (visit) =>
        ((visit.checkedInAt as number) -
          (visit.arrivedAt as number)) /
        60_000,
    )
    .filter((minutes) => minutes >= 0 && minutes <= 60)
    .sort((a, b) => a - b);

  if (samples.length < 8) {
    return undefined;
  }

  const middle = Math.floor(samples.length / 2);

  return samples.length % 2
    ? samples[middle]
    : (samples[middle - 1] + samples[middle]) / 2;
}
