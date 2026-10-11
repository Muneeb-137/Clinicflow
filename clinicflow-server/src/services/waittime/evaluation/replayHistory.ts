import { pool } from "../../../db.js";

import { predictClinic } from "../PredictionEngine.js";

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
 * REPLAY OF REAL HISTORY
 * =========================================================
 *
 * Rebuilds each past clinic day from the database and asks
 * the engine for every recorded check-in, then compares
 * with the wait that really happened.
 *
 * Provider status at a past moment is not stored, so it
 * is reconstructed: "in consult" while one of their
 * visits is roomed, otherwise "available" during their
 * scheduled blocks. A consult left open (the doctor never
 * clicked Complete) is ended when that doctor's next
 * patient was roomed.
 */

const CLINIC_TIME_ZONE = "America/Toronto";
const MINUTE = 60_000;
const MAX_VALID_WAIT_MINUTES = 12 * 60;

const instant = (column: string) =>
  `(${column} AT TIME ZONE current_setting('TimeZone'))`;

const ms = (value: unknown) =>
  value === null || value === undefined
    ? null
    : new Date(value as string | Date).getTime();

export async function replayHistory(
  startDate: string,
  endDate: string,
) {
  const visitsResult = await pool.query(
    `
      SELECT
        a.appointment_id,
        a.appointment_date::text AS day,
        a.visit_type,
        a.status,
        a.doctor_id,
        a.assignment_mode,
        a.appointment_type_id,
        a.duration_minutes,

        CASE
          WHEN a.start_time IS NULL THEN NULL
          ELSE (a.appointment_date + a.start_time)
            AT TIME ZONE '${CLINIC_TIME_ZONE}'
        END AS scheduled_start_at,

        a.arrived_at,
        ${instant("a.checked_in_at")} AS checked_in_at,
        ${instant("a.roomed_at")} AS roomed_at,
        ${instant("COALESCE(a.consult_ended_at, a.completed_at)")}
          AS ended_at,
        ${instant("COALESCE(a.cancelled_at, a.missed_at)")}
          AS dropped_at

      FROM appointments AS a

      WHERE a.appointment_date
        BETWEEN $1::date AND $2::date
      ORDER BY a.appointment_date;
    `,
    [startDate, endDate],
  );

  const blocksResult = await pool.query(
    `
      SELECT
        days.day::text AS day,
        dsb.doctor_id,
        dsb.block_type,
        (days.day + dsb.start_time)
          AT TIME ZONE '${CLINIC_TIME_ZONE}' AS start_at,
        (days.day + dsb.end_time)
          AT TIME ZONE '${CLINIC_TIME_ZONE}' AS end_at
      FROM (
        SELECT DISTINCT appointment_date AS day
        FROM appointments
        WHERE appointment_date
          BETWEEN $1::date AND $2::date
      ) AS days
      JOIN doctor_schedule_blocks AS dsb
        ON dsb.is_active = TRUE
        AND dsb.day_of_week =
          EXTRACT(DOW FROM days.day)::integer
        AND dsb.block_type <> 'blocked';
    `,
    [startDate, endDate],
  );

  const roomsResult = await pool.query(
    `
      SELECT
        doctor_id,
        assignment_date::text AS day,
        room_name
      FROM doctor_room_assignments
      WHERE assignment_date
        BETWEEN $1::date AND $2::date;
    `,
    [startDate, endDate],
  );

  const doctorsResult = await pool.query(
    `SELECT doctor_id, first_name, last_name FROM doctors`,
  );

  const doctorName = new Map(
    doctorsResult.rows.map((row) => [
      row.doctor_id as number,
      row,
    ]),
  );

  // Group visits by day.
  const days = new Map<string, VisitRecord[]>();

  for (const row of visitsResult.rows) {
    const list = days.get(row.day) ?? [];

    list.push({
      id: row.appointment_id,
      visitType:
        row.visit_type === "walk_in"
          ? "walk_in"
          : "scheduled",
      bookedDoctorId:
        row.visit_type === "walk_in" &&
        row.assignment_mode !== "manual"
          ? null
          : row.doctor_id,
      assignmentMode:
        row.assignment_mode === "manual"
          ? "manual"
          : "auto",
      seenByDoctorId: row.doctor_id,
      appointmentTypeId: row.appointment_type_id,
      bookedMinutes: row.duration_minutes,
      scheduledStartAt: ms(row.scheduled_start_at),
      arrivedAt: ms(row.arrived_at),
      checkedInAt: ms(row.checked_in_at),
      roomedAt: ms(row.roomed_at),
      endedAt: ms(row.ended_at),
      droppedAt:
        row.status === "cancelled" ||
        row.status === "missed"
          ? ms(row.dropped_at)
          : null,
    });

    days.set(row.day, list);
  }

  const outcomes: PredictionOutcome[] = [];
  const priorVisits: VisitRecord[] = [];
  let skipped = 0;

  for (const [day, visits] of [...days].sort()) {
    /*
     * A doctor sees one patient at a time: end any
     * consult that was left open when that doctor's next
     * patient was roomed (or after its booked length).
     */
    const byDoctor = new Map<number, VisitRecord[]>();

    for (const visit of visits) {
      if (
        visit.roomedAt !== null &&
        visit.seenByDoctorId !== null
      ) {
        const list =
          byDoctor.get(visit.seenByDoctorId) ?? [];
        list.push(visit);
        byDoctor.set(visit.seenByDoctorId, list);
      }
    }

    for (const list of byDoctor.values()) {
      list.sort(
        (a, b) =>
          (a.roomedAt as number) - (b.roomedAt as number),
      );

      list.forEach((visit, index) => {
        const nextRoomed = list[index + 1]?.roomedAt;
        const fallbackEnd =
          (visit.roomedAt as number) +
          (visit.bookedMinutes ?? 20) * MINUTE;

        let end = visit.endedAt ?? fallbackEnd;

        if (
          end - (visit.roomedAt as number) >
          3 * (visit.bookedMinutes ?? 20) * MINUTE
        ) {
          end = fallbackEnd;
        }

        if (
          nextRoomed !== undefined &&
          nextRoomed !== null &&
          end > nextRoomed
        ) {
          end = nextRoomed;
        }

        visit.endedAt = end;
      });
    }

    const providers: ProviderDay[] = [
      ...new Set(
        blocksResult.rows
          .filter((row) => row.day === day)
          .map((row) => row.doctor_id as number),
      ),
    ].map((doctorId) => {
      const blocks = blocksResult.rows.filter(
        (row) =>
          row.day === day && row.doctor_id === doctorId,
      );

      const room =
        roomsResult.rows.find(
          (row) =>
            row.day === day &&
            row.doctor_id === doctorId,
        )?.room_name ?? `Room (doctor ${doctorId})`;

      const name = doctorName.get(doctorId);

      return {
        doctorId,
        firstName: name?.first_name ?? "Doctor",
        lastName: name?.last_name ?? String(doctorId),
        roomName: room,
        onDuty: blocks.map((row) => ({
          start: ms(row.start_at) as number,
          end: ms(row.end_at) as number,
        })),
        walkInBlocks: blocks
          .filter((row) => row.block_type === "walk_in")
          .map((row) => ({
            start: ms(row.start_at) as number,
            end: ms(row.end_at) as number,
          })),
      };
    });

    const durationStats = durationStatsFrom(priorVisits);
  const checkInMinutes = checkInMinutesFrom(priorVisits);

    for (const visit of visits) {
      if (
        visit.checkedInAt === null ||
        visit.roomedAt === null
      ) {
        continue;
      }

      const actual =
        (visit.roomedAt - visit.checkedInAt) / MINUTE;

      if (
        actual < 0 ||
        actual > MAX_VALID_WAIT_MINUTES
      ) {
        skipped += 1;
        continue;
      }

      const time = visit.checkedInAt;

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
      ).predictions.find(
        (item) => item.appointmentId === visit.id,
      );

      const earlierWaits = visits
        .filter(
          (other) =>
            other.visitType === visit.visitType &&
            other.roomedAt !== null &&
            other.checkedInAt !== null &&
            other.roomedAt <= time,
        )
        .map(
          (other) =>
            ((other.roomedAt as number) -
              (other.checkedInAt as number)) /
            MINUTE,
        );

      outcomes.push({
        visitType: visit.visitType,
        actualMinutes: actual,
        expectedMinutes:
          prediction?.expectedWaitMinutes ?? null,
        lowerMinutes:
          prediction?.lowerWaitMinutes ?? null,
        upperMinutes:
          prediction?.upperWaitMinutes ?? null,
        baselineMinutes:
          earlierWaits.length === 0
            ? 15
            : earlierWaits.reduce((a, b) => a + b, 0) /
              earlierWaits.length,
        queueLength:
          state.scheduledQueue.length +
          state.walkInQueue.length,
      });
    }

    priorVisits.push(...visits);
  }

  return {
    outcomes,
    skipped,
    days: days.size,
  };
}
