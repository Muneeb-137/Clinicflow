import { predictClinic } from "../PredictionEngine.js";
import type { LateBookingPolicy } from "../QueueSimulator.js";

export type EngineOptions = {
  lateBookingPolicy?: LateBookingPolicy;
};

import type { PredictionOutcome } from "./metrics.js";

import {
  checkInMinutesFrom,
  durationStatsFrom,
  stateAt,
  type ProviderDay,
  type VisitRecord,
} from "./stateAt.js";

/*
 * =========================================================
 * SYNTHETIC CLINIC
 * =========================================================
 *
 * A minute-by-minute simulation of clinic days where the
 * truth is known. The engine is asked for a prediction at
 * every check-in, using only what the front desk could see
 * at that moment, and is scored against the wait that
 * actually happened.
 *
 * Realism the engine does NOT know in advance:
 * - visit lengths vary (log-normal around the booked
 *   length)
 * - booked patients arrive early/late, some never come
 * - walk-ins arrive at random times and take a few
 *   minutes to complete forms
 */

const MINUTE = 60_000;

export type AppointmentTypeConfig = {
  id: number;
  bookedMinutes: number;
  // Actual median = bookedMinutes * actualFactor.
  actualFactor: number;
  // Log-normal spread (0.3 ~ +/-35%).
  sigma: number;
  bookedWeight: number;
  walkInWeight: number;
};

export type DoctorConfig = {
  id: number;
  // [startMinute, endMinute] from midnight.
  bookedBlocks: [number, number][];
  walkInBlocks: [number, number][];
};

export type ScenarioConfig = {
  name: string;
  description: string;
  days: number;
  seed: number;

  doctors: DoctorConfig[];
  appointmentTypes: AppointmentTypeConfig[];

  // Share of booking slots that get booked.
  bookingFill: number;
  noShowRate: number;
  // Booked arrival vs appointment time (minutes).
  arrivalOffsetMean: number;
  arrivalOffsetSd: number;

  // Walk-in arrivals per hour, while any walk-in
  // block is open.
  walkInsPerHour: number;
  // Arrival -> check-in (forms), uniform range.
  walkInFormsMinutes: [number, number];

  /*
   * Front-desk habit: a booked patient is roomed no
   * earlier than this many minutes before their
   * appointment time (Infinity = whenever the doctor is
   * free, which is what the app allows).
   */
  earlyRoomingMinutes: number;
};

/* ---------------- deterministic randomness ------------- */

function mulberry32(seed: number) {
  let state = seed >>> 0;

  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);

    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeRandom(seed: number) {
  const next = mulberry32(seed);

  const normal = () => {
    const u = Math.max(next(), 1e-9);
    const v = next();

    return (
      Math.sqrt(-2 * Math.log(u)) *
      Math.cos(2 * Math.PI * v)
    );
  };

  return {
    next,
    normal,
    uniform: (min: number, max: number) =>
      min + (max - min) * next(),
    logNormal: (medianValue: number, sigma: number) =>
      medianValue * Math.exp(sigma * normal()),
    pick<T>(items: T[], weight: (item: T) => number) {
      const total = items.reduce(
        (sum, item) => sum + weight(item),
        0,
      );

      let roll = next() * total;

      for (const item of items) {
        roll -= weight(item);

        if (roll <= 0) {
          return item;
        }
      }

      return items[items.length - 1];
    },
  };
}

/* ---------------- one simulated day -------------------- */

type SimVisit = VisitRecord & {
  actualMinutes: number;
};

type DayResult = {
  visits: SimVisit[];
  outcomes: PredictionOutcome[];
  arrivalOutcomes: PredictionOutcome[];
  unserved: number;
};

function simulateDay(
  config: ScenarioConfig,
  dayIndex: number,
  random: ReturnType<typeof makeRandom>,
  priorVisits: VisitRecord[],
  nextId: () => number,
  engineOptions: EngineOptions,
): DayResult {
  // A fixed Monday; the time zone is irrelevant here
  // because every time is an absolute instant.
  const dayStart =
    Date.UTC(2026, 10, 2) + dayIndex * 24 * 60 * MINUTE;

  const at = (minuteOfDay: number) =>
    dayStart + minuteOfDay * MINUTE;

  const typeById = new Map(
    config.appointmentTypes.map((type) => [
      type.id,
      type,
    ]),
  );

  const providers: ProviderDay[] = config.doctors.map(
    (doctor) => ({
      doctorId: doctor.id,
      firstName: "Doctor",
      lastName: String(doctor.id),
      roomName: `Room ${doctor.id}`,
      onDuty: [
        ...doctor.bookedBlocks,
        ...doctor.walkInBlocks,
      ].map(([start, end]) => ({
        start: at(start),
        end: at(end),
      })),
      walkInBlocks: doctor.walkInBlocks.map(
        ([start, end]) => ({
          start: at(start),
          end: at(end),
        }),
      ),
    }),
  );

  const visits: SimVisit[] = [];

  const actualFor = (typeId: number) => {
    const type = typeById.get(typeId)!;

    return Math.max(
      3,
      random.logNormal(
        type.bookedMinutes * type.actualFactor,
        type.sigma,
      ),
    );
  };

  /*
   * Bookings: walk each booked block, booking visits back
   * to back with some empty slots.
   */
  for (const doctor of config.doctors) {
    for (const [blockStart, blockEnd] of doctor.bookedBlocks) {
      let minute = blockStart;

      while (minute < blockEnd) {
        const type = random.pick(
          config.appointmentTypes.filter(
            (item) =>
              item.bookedWeight > 0 &&
              minute + item.bookedMinutes <= blockEnd,
          ),
          (item) => item.bookedWeight,
        );

        if (!type) {
          break;
        }

        if (random.next() < config.bookingFill) {
          const start = at(minute);
          const noShow =
            random.next() < config.noShowRate;

          const arrivedAt = noShow
            ? null
            : start +
              Math.round(
                config.arrivalOffsetMean +
                  config.arrivalOffsetSd *
                    random.normal(),
              ) *
                MINUTE;

          visits.push({
            id: nextId(),
            visitType: "scheduled",
            bookedDoctorId: doctor.id,
            assignmentMode: "manual",
            seenByDoctorId: null,
            appointmentTypeId: type.id,
            bookedMinutes: type.bookedMinutes,
            scheduledStartAt: start,
            arrivedAt,
            checkedInAt:
              arrivedAt === null
                ? null
                : arrivedAt +
                  Math.round(random.uniform(0, 2)) *
                    MINUTE,
            roomedAt: null,
            endedAt: null,
            droppedAt: noShow
              ? start + type.bookedMinutes * MINUTE
              : null,
            actualMinutes: actualFor(type.id),
          });

          minute += type.bookedMinutes;
        } else {
          minute += 15;
        }
      }
    }
  }

  /*
   * Walk-ins: random arrivals while any walk-in block is
   * open.
   */
  const walkInMinutes = new Set<number>();

  for (const doctor of config.doctors) {
    for (const [start, end] of doctor.walkInBlocks) {
      for (let minute = start; minute < end; minute += 1) {
        walkInMinutes.add(minute);
      }
    }
  }

  for (const minute of [...walkInMinutes].sort(
    (a, b) => a - b,
  )) {
    if (random.next() < config.walkInsPerHour / 60) {
      const type = random.pick(
        config.appointmentTypes.filter(
          (item) => item.walkInWeight > 0,
        ),
        (item) => item.walkInWeight,
      );

      const arrivedAt = at(minute);

      visits.push({
        id: nextId(),
        visitType: "walk_in",
        bookedDoctorId: null,
        assignmentMode: "auto",
        seenByDoctorId: null,
        appointmentTypeId: type.id,
        bookedMinutes: type.bookedMinutes,
        scheduledStartAt: null,
        arrivedAt,
        checkedInAt:
          arrivedAt +
          Math.round(
            random.uniform(...config.walkInFormsMinutes),
          ) *
            MINUTE,
        roomedAt: null,
        endedAt: null,
        droppedAt: null,
        actualMinutes: actualFor(type.id),
      });
    }
  }

  /*
   * Front desk, minute by minute. Same rules as the app:
   * booked patients first (in appointment order); walk-ins
   * first come first served to a doctor in a walk-in
   * block, only if the visit fits before that doctor's
   * next booked patient.
   */
  const firstMinute = Math.min(
    ...config.doctors.flatMap((doctor) =>
      [...doctor.bookedBlocks, ...doctor.walkInBlocks].map(
        ([start]) => start,
      ),
    ),
  ) - 60;

  const lastMinute = 24 * 60 - 1;

  const busyUntil = new Map<number, number>();

  for (
    let minute = firstMinute;
    minute <= lastMinute;
    minute += 1
  ) {
    const now = at(minute);

    const doctorOrder = [...providers].sort(
      () => random.next() - 0.5,
    );

    for (const provider of doctorOrder) {
      if ((busyUntil.get(provider.doctorId) ?? 0) > now) {
        continue;
      }

      const onDuty = provider.onDuty.some(
        (block) => block.start <= now && now < block.end,
      );

      const booked = visits
        .filter(
          (visit) =>
            visit.visitType === "scheduled" &&
            visit.bookedDoctorId === provider.doctorId &&
            visit.roomedAt === null &&
            visit.checkedInAt !== null &&
            visit.checkedInAt <= now &&
            (visit.scheduledStartAt as number) -
              config.earlyRoomingMinutes * MINUTE <=
              now,
        )
        .sort(
          (a, b) =>
            (a.scheduledStartAt as number) -
            (b.scheduledStartAt as number),
        );

      let chosen: SimVisit | undefined;

      // Booked patients are seen even if the doctor's
      // block has just ended.
      if (booked.length > 0) {
        chosen = booked[0];
      } else if (onDuty) {
        const walkInBlock = provider.walkInBlocks.find(
          (block) =>
            block.start <= now && now < block.end,
        );

        const nextBooked = visits
          .filter(
            (visit) =>
              visit.visitType === "scheduled" &&
              visit.bookedDoctorId ===
                provider.doctorId &&
              visit.roomedAt === null &&
              (visit.droppedAt === null ||
                visit.droppedAt > now) &&
              (visit.scheduledStartAt as number) > now,
          )
          .map(
            (visit) => visit.scheduledStartAt as number,
          )
          .sort((a, b) => a - b)[0];

        if (walkInBlock) {
          chosen = visits
            .filter(
              (visit) =>
                visit.visitType === "walk_in" &&
                visit.roomedAt === null &&
                visit.checkedInAt !== null &&
                visit.checkedInAt <= now &&
                (nextBooked === undefined ||
                  now +
                    (visit.bookedMinutes ?? 20) *
                      MINUTE <=
                    nextBooked),
            )
            .sort(
              (a, b) =>
                (a.checkedInAt as number) -
                (b.checkedInAt as number),
            )[0];
        }
      }

      if (chosen) {
        chosen.roomedAt = now;
        chosen.seenByDoctorId = provider.doctorId;
        chosen.endedAt =
          now +
          Math.round(chosen.actualMinutes) * MINUTE;

        busyUntil.set(
          provider.doctorId,
          chosen.endedAt,
        );
      }
    }
  }

  /*
   * Score: ask the engine at each check-in (and, for
   * walk-ins, at arrival) using only the history up to
   * yesterday for learned visit lengths.
   */
  const durationStats = durationStatsFrom(priorVisits);
  const checkInMinutes = checkInMinutesFrom(priorVisits);

  const outcomes: PredictionOutcome[] = [];
  const arrivalOutcomes: PredictionOutcome[] = [];

  const roomedToday = (
    visitType: SimVisit["visitType"],
    before: number,
  ) =>
    visits
      .filter(
        (visit) =>
          visit.visitType === visitType &&
          visit.roomedAt !== null &&
          visit.roomedAt <= before &&
          visit.checkedInAt !== null,
      )
      .map(
        (visit) =>
          ((visit.roomedAt as number) -
            (visit.checkedInAt as number)) /
          MINUTE,
      );

  // Naive "posted wait": average wait so far today for
  // this visit type (15 min before anyone is seen).
  const baselineAt = (
    visitType: SimVisit["visitType"],
    time: number,
  ) => {
    const waits = roomedToday(visitType, time);

    return waits.length === 0
      ? 15
      : waits.reduce((sum, value) => sum + value, 0) /
          waits.length;
  };

  const predictAt = (
    visit: SimVisit,
    time: number,
  ): PredictionOutcome | null => {
    if (visit.roomedAt === null) {
      return null;
    }

    const state = stateAt(
      time,
      visits,
      providers,
      durationStats,
      checkInMinutes,
    );

    const prediction = predictClinic(
      state,
      new Date(time),
      engineOptions,
    ).predictions.find(
      (item) => item.appointmentId === visit.id,
    );

    return {
      visitType: visit.visitType,
      actualMinutes: (visit.roomedAt - time) / MINUTE,
      expectedMinutes:
        prediction?.expectedWaitMinutes ?? null,
      lowerMinutes:
        prediction?.lowerWaitMinutes ?? null,
      upperMinutes:
        prediction?.upperWaitMinutes ?? null,
      baselineMinutes: baselineAt(
        visit.visitType,
        time,
      ),
      queueLength:
        state.scheduledQueue.length +
        state.walkInQueue.length,
    };
  };

  let unserved = 0;

  for (const visit of visits) {
    if (visit.checkedInAt === null) {
      continue;
    }

    if (visit.roomedAt === null) {
      unserved += 1;
      continue;
    }

    const atCheckIn = predictAt(
      visit,
      visit.checkedInAt,
    );

    if (atCheckIn) {
      outcomes.push(atCheckIn);
    }

    if (
      visit.visitType === "walk_in" &&
      visit.arrivedAt !== null
    ) {
      const atArrival = predictAt(
        visit,
        visit.arrivedAt,
      );

      if (atArrival) {
        arrivalOutcomes.push(atArrival);
      }
    }
  }

  return {
    visits,
    outcomes,
    arrivalOutcomes,
    unserved,
  };
}

export function runSyntheticScenario(
  config: ScenarioConfig,
  engineOptions: EngineOptions = {},
) {
  const random = makeRandom(config.seed);

  let id = 1;
  const nextId = () => id++;

  const allVisits: VisitRecord[] = [];
  const outcomes: PredictionOutcome[] = [];
  const arrivalOutcomes: PredictionOutcome[] = [];
  let unserved = 0;

  for (let day = 0; day < config.days; day += 1) {
    const result = simulateDay(
      config,
      day,
      random,
      allVisits,
      nextId,
      engineOptions,
    );

    allVisits.push(...result.visits);
    outcomes.push(...result.outcomes);
    arrivalOutcomes.push(...result.arrivalOutcomes);
    unserved += result.unserved;
  }

  return {
    outcomes,
    arrivalOutcomes,
    unserved,
    visits: allVisits,
  };
}
