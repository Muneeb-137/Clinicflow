import express from "express";
import type { PoolClient } from "pg";

import { pool } from "../db.js";
import { emitClinicUpdate } from "../socket.js";
import {
  type AuthenticatedRequest,
  requireStaffAuth,
} from "../middleware/authMiddleware.js";
import { requireRole } from "../middleware/requireRole.js";
import { isRealDate, isRealTime } from "../middleware/inputValidation.js";
import { clinicToday } from "../clinicTimeZone.js";

/*
 * =========================================================
 * SCHEDULE EDITOR
 * =========================================================
 *
 * - Weekly hours per doctor: for each weekday, the blocks of
 *   booked appointments, walk-ins and blocked time (lunch,
 *   meetings...), plus how many booked patients the doctor
 *   takes that day and the booking grid (every 15 min...).
 * - Time off: a doctor away on some dates (all day or some
 *   hours), or the whole clinic closed (holidays).
 *
 * Every schedule query reads effective_schedule_blocks(date),
 * so changes apply everywhere straight away: booking times,
 * the calendar, walk-in admission and wait estimates.
 *
 * Changes never move or cancel existing bookings. Instead,
 * each change answers with the upcoming bookings that now
 * fall outside the doctor's hours, so staff can contact
 * those patients.
 */

const router = express.Router();

const BLOCK_TYPES = ["scheduled", "walk_in", "blocked"] as const;
const BLOCK_REASONS = [
  "lunch",
  "catch_up",
  "meeting",
  "paperwork",
  "offsite",
  "other",
] as const;
const BOOKING_INTERVALS = [5, 10, 15, 20, 30, 45, 60];

type BlockInput = {
  start_time: string;
  end_time: string;
  block_type: (typeof BLOCK_TYPES)[number];
  block_reason: (typeof BLOCK_REASONS)[number] | null;
};

const toMinutes = (time: string) => {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
};

// "9:00" / "09:00:00" -> "09:00"
const normalizeTime = (time: string) => time.slice(0, 5).padStart(5, "0");

/*
 * Upcoming active bookings that no longer fit inside one of
 * the doctor's booked-appointment hours (because of a
 * schedule change or time off).
 */
async function bookingsOutsideHours(
  db: PoolClient | typeof pool,
  filter: {
    doctorId: number | null;
    fromDate: string;
    toDate: string;
  },
) {
  const result = await db.query<{
    appointment_id: number;
    appointment_date: string;
    start_time: string;
    duration_minutes: number;
    doctor_id: number;
    doctor_name: string;
    patient_name: string;
    patient_phone: string | null;
  }>(
    `
      SELECT
        a.appointment_id,
        a.appointment_date::text AS appointment_date,
        to_char(a.start_time, 'HH24:MI') AS start_time,
        a.duration_minutes,
        a.doctor_id,
        CONCAT('Dr. ', d.first_name, ' ', d.last_name) AS doctor_name,
        CONCAT(p.first_name, ' ', p.last_name) AS patient_name,
        p.phone AS patient_phone
      FROM appointments AS a
      JOIN doctors AS d ON d.doctor_id = a.doctor_id
      JOIN patients AS p ON p.patient_id = a.patient_id
      WHERE a.visit_type = 'scheduled'
        AND a.status = 'scheduled'
        AND a.start_time IS NOT NULL
        AND a.appointment_date BETWEEN $2::date AND $3::date
        AND a.appointment_date >= $4::date
        AND ($1::integer IS NULL OR a.doctor_id = $1::integer)
        AND NOT EXISTS (
          SELECT 1
          FROM effective_schedule_blocks(a.appointment_date) AS e
          WHERE e.doctor_id = a.doctor_id
            AND e.block_type = 'scheduled'
            AND a.start_time >= e.start_time
            AND a.start_time
              + make_interval(mins => COALESCE(a.duration_minutes, 1))
              <= e.end_time
        )
      ORDER BY a.appointment_date, a.start_time
      LIMIT 200;
    `,
    [filter.doctorId, filter.fromDate, filter.toDate, clinicToday()],
  );

  return result.rows;
}

function parseBlocks(value: unknown): BlockInput[] | string {
  if (!Array.isArray(value)) {
    return "Send the day's blocks as a list.";
  }

  if (value.length > 30) {
    return "A day can have at most 30 blocks.";
  }

  const blocks: BlockInput[] = [];

  for (const item of value as Record<string, unknown>[]) {
    const start = String(item?.start_time ?? "");
    const end = String(item?.end_time ?? "");
    const type = item?.block_type;
    const reason = item?.block_reason ?? null;

    if (!isRealTime(start) || !isRealTime(end)) {
      return "Each block needs a valid start and end time.";
    }

    if (toMinutes(end) <= toMinutes(start)) {
      return `A block must end after it starts (${normalizeTime(start)}–${normalizeTime(end)}).`;
    }

    if (!BLOCK_TYPES.includes(type as BlockInput["block_type"])) {
      return "Block type must be booked appointments, walk-ins or blocked.";
    }

    if (
      type === "blocked" &&
      reason !== null &&
      !BLOCK_REASONS.includes(reason as (typeof BLOCK_REASONS)[number])
    ) {
      return "Choose a reason for the blocked time.";
    }

    blocks.push({
      start_time: normalizeTime(start),
      end_time: normalizeTime(end),
      block_type: type as BlockInput["block_type"],
      block_reason:
        type === "blocked"
          ? ((reason as BlockInput["block_reason"]) ?? "other")
          : null,
    });
  }

  blocks.sort((a, b) => toMinutes(a.start_time) - toMinutes(b.start_time));

  for (let i = 1; i < blocks.length; i++) {
    if (toMinutes(blocks[i].start_time) < toMinutes(blocks[i - 1].end_time)) {
      return `Blocks can't overlap (${blocks[i - 1].start_time}–${blocks[i - 1].end_time} and ${blocks[i].start_time}–${blocks[i].end_time}).`;
    }
  }

  return blocks;
}

/*
 * GET /api/schedule/doctors/:doctorId/week
 *
 * The doctor's weekly hours, Sunday (0) to Saturday (6).
 */
router.get(
  "/doctors/:doctorId/week",
  requireStaffAuth,
  async (request, response) => {
    const doctorId = Number(request.params.doctorId);

    if (!Number.isInteger(doctorId) || doctorId <= 0) {
      return response.status(400).json({ message: "Invalid doctor." });
    }

    try {
      const [doctor, blocks, settings] = await Promise.all([
        pool.query(
          `SELECT doctor_id, first_name, last_name, specialty
           FROM doctors WHERE doctor_id = $1 AND is_active = TRUE`,
          [doctorId],
        ),
        pool.query(
          `
            SELECT
              day_of_week,
              to_char(start_time, 'HH24:MI') AS start_time,
              to_char(end_time, 'HH24:MI') AS end_time,
              block_type,
              block_reason
            FROM doctor_schedule_blocks
            WHERE doctor_id = $1 AND is_active = TRUE
            ORDER BY day_of_week, start_time
          `,
          [doctorId],
        ),
        pool.query(
          `
            SELECT
              day_of_week,
              scheduled_patient_capacity,
              booking_interval_minutes,
              max_long_visits_per_day
            FROM doctor_schedule_settings
            WHERE doctor_id = $1 AND is_active = TRUE
          `,
          [doctorId],
        ),
      ]);

      if (doctor.rows.length === 0) {
        return response.status(404).json({ message: "Active doctor not found." });
      }

      const days = Array.from({ length: 7 }, (_, dayOfWeek) => ({
        day_of_week: dayOfWeek,
        blocks: blocks.rows
          .filter((row) => row.day_of_week === dayOfWeek)
          .map(({ day_of_week: _day, ...block }) => block),
        settings:
          settings.rows.find((row) => row.day_of_week === dayOfWeek) ?? null,
      }));

      return response.json({ doctor: doctor.rows[0], days });
    } catch (error) {
      console.error("Error loading weekly schedule:", error);
      return response.status(500).json({ message: "Unable to load the schedule." });
    }
  },
);

/*
 * PUT /api/schedule/doctors/:doctorId/days/:dayOfWeek
 * body: {
 *   blocks: [{ start_time, end_time, block_type, block_reason }],
 *   scheduled_patient_capacity, booking_interval_minutes
 * }
 *
 * Replaces that weekday's hours. Answers with upcoming
 * bookings that now fall outside the doctor's hours.
 */
router.put(
  "/doctors/:doctorId/days/:dayOfWeek",
  requireStaffAuth,
  requireRole("admin"),
  async (request, response) => {
    const doctorId = Number(request.params.doctorId);
    const dayOfWeek = Number(request.params.dayOfWeek);

    if (
      !Number.isInteger(doctorId) ||
      doctorId <= 0 ||
      !Number.isInteger(dayOfWeek) ||
      dayOfWeek < 0 ||
      dayOfWeek > 6
    ) {
      return response.status(400).json({ message: "Invalid doctor or day." });
    }

    const blocks = parseBlocks(request.body?.blocks);

    if (typeof blocks === "string") {
      return response.status(400).json({ message: blocks });
    }

    const hasBookedHours = blocks.some((block) => block.block_type === "scheduled");
    const capacity = Number(request.body?.scheduled_patient_capacity ?? 0);
    const interval = Number(request.body?.booking_interval_minutes ?? 15);

    if (!Number.isInteger(capacity) || capacity < 0 || capacity > 200) {
      return response.status(400).json({
        message: "Booked patients per day must be a whole number from 0 to 200.",
      });
    }

    if (!BOOKING_INTERVALS.includes(interval)) {
      return response.status(400).json({
        message: `Booking times must be every ${BOOKING_INTERVALS.join(", ")} minutes.`,
      });
    }

    const rawLongLimit = request.body?.max_long_visits_per_day;
    const longLimit =
      rawLongLimit === null || rawLongLimit === undefined || rawLongLimit === ""
        ? null
        : Number(rawLongLimit);

    if (longLimit !== null && (!Number.isInteger(longLimit) || longLimit < 0 || longLimit > 50)) {
      return response.status(400).json({
        message: "Long visits per day must be a whole number from 0 to 50, or empty for no limit.",
      });
    }

    if (hasBookedHours && capacity === 0) {
      return response.status(400).json({
        message:
          "This day has booked-appointment hours, so set how many booked patients the doctor takes.",
      });
    }

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      // One schedule edit per doctor at a time.
      await client.query("SELECT pg_advisory_xact_lock(-2, $1::integer)", [doctorId]);

      const doctor = await client.query(
        "SELECT 1 FROM doctors WHERE doctor_id = $1 AND is_active = TRUE",
        [doctorId],
      );

      if (doctor.rows.length === 0) {
        await client.query("ROLLBACK");
        return response.status(404).json({ message: "Active doctor not found." });
      }

      // The weekly template is configuration: replace it.
      await client.query(
        "DELETE FROM doctor_schedule_blocks WHERE doctor_id = $1 AND day_of_week = $2",
        [doctorId, dayOfWeek],
      );

      for (const block of blocks) {
        await client.query(
          `
            INSERT INTO doctor_schedule_blocks
              (doctor_id, day_of_week, start_time, end_time, block_type, block_reason, is_active)
            VALUES ($1, $2, $3, $4, $5, $6, TRUE)
          `,
          [
            doctorId,
            dayOfWeek,
            block.start_time,
            block.end_time,
            block.block_type,
            block.block_reason,
          ],
        );
      }

      await client.query(
        `
          INSERT INTO doctor_schedule_settings
            (doctor_id, day_of_week, scheduled_patient_capacity, booking_interval_minutes, max_long_visits_per_day, is_active)
          VALUES ($1, $2, $3, $4, $5, TRUE)
          ON CONFLICT (doctor_id, day_of_week)
          DO UPDATE SET
            scheduled_patient_capacity = EXCLUDED.scheduled_patient_capacity,
            booking_interval_minutes = EXCLUDED.booking_interval_minutes,
            max_long_visits_per_day = EXCLUDED.max_long_visits_per_day,
            is_active = TRUE,
            updated_at = CURRENT_TIMESTAMP
        `,
        [doctorId, dayOfWeek, capacity, interval, longLimit],
      );

      // Next 6 months of bookings on this weekday.
      const today = clinicToday();
      const inSixMonths = new Date(Date.now() + 183 * 86_400_000)
        .toISOString()
        .slice(0, 10);

      const affected = (
        await bookingsOutsideHours(client, {
          doctorId,
          fromDate: today,
          toDate: inSixMonths,
        })
      ).filter(
        (booking) =>
          new Date(`${booking.appointment_date}T12:00:00Z`).getUTCDay() === dayOfWeek,
      );

      await client.query("COMMIT");

      emitClinicUpdate({ type: "schedule_changed", doctorId });

      return response.json({ message: "Schedule saved.", affected_bookings: affected });
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      console.error("Error saving schedule:", error);
      return response.status(500).json({ message: "Unable to save the schedule." });
    } finally {
      client.release();
    }
  },
);

/*
 * GET /api/schedule/time-off?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Time off overlapping the range (default: today onwards).
 */
router.get("/time-off", requireStaffAuth, async (request, response) => {
  const from =
    typeof request.query.from === "string" ? request.query.from : clinicToday();
  const to = typeof request.query.to === "string" ? request.query.to : "9999-12-31";

  if (!isRealDate(from) || !isRealDate(to)) {
    return response.status(400).json({ message: "Invalid date range." });
  }

  try {
    const result = await pool.query(
      `
        SELECT
          t.time_off_id,
          t.doctor_id,
          CASE WHEN d.doctor_id IS NULL THEN NULL
               ELSE CONCAT('Dr. ', d.first_name, ' ', d.last_name)
          END AS doctor_name,
          t.start_date::text AS start_date,
          t.end_date::text AS end_date,
          to_char(t.start_time, 'HH24:MI') AS start_time,
          to_char(t.end_time, 'HH24:MI') AS end_time,
          t.reason
        FROM doctor_time_off AS t
        LEFT JOIN doctors AS d ON d.doctor_id = t.doctor_id
        WHERE t.end_date >= $1::date AND t.start_date <= $2::date
        ORDER BY t.start_date, t.doctor_id NULLS FIRST
        LIMIT 500
      `,
      [from, to],
    );

    return response.json(result.rows);
  } catch (error) {
    console.error("Error loading time off:", error);
    return response.status(500).json({ message: "Unable to load time off." });
  }
});

/*
 * POST /api/schedule/time-off
 * body: { doctor_id (null = whole clinic), start_date,
 *         end_date, start_time?, end_time?, reason? }
 */
router.post(
  "/time-off",
  requireStaffAuth,
  requireRole("admin"),
  async (request: AuthenticatedRequest, response) => {
    const body = request.body ?? {};
    const doctorId =
      body.doctor_id === null || body.doctor_id === undefined || body.doctor_id === ""
        ? null
        : Number(body.doctor_id);
    const startDate = String(body.start_date ?? "");
    const endDate = String(body.end_date ?? body.start_date ?? "");
    const allDay = !body.start_time && !body.end_time;
    const startTime = allDay ? null : String(body.start_time ?? "");
    const endTime = allDay ? null : String(body.end_time ?? "");
    const reason =
      typeof body.reason === "string" ? body.reason.trim().slice(0, 200) || null : null;

    if (doctorId !== null && (!Number.isInteger(doctorId) || doctorId <= 0)) {
      return response.status(400).json({ message: "Invalid doctor." });
    }

    if (!isRealDate(startDate) || !isRealDate(endDate) || endDate < startDate) {
      return response.status(400).json({
        message: "Choose a start date and an end date on or after it.",
      });
    }

    if (
      !allDay &&
      (!startTime ||
        !endTime ||
        !isRealTime(startTime) ||
        !isRealTime(endTime) ||
        toMinutes(endTime) <= toMinutes(startTime))
    ) {
      return response.status(400).json({
        message: "For part of a day, choose a start time and a later end time.",
      });
    }

    if (endDate < clinicToday()) {
      return response.status(400).json({ message: "Time off can't be entirely in the past." });
    }

    try {
      if (doctorId !== null) {
        const doctor = await pool.query(
          "SELECT 1 FROM doctors WHERE doctor_id = $1 AND is_active = TRUE",
          [doctorId],
        );

        if (doctor.rows.length === 0) {
          return response.status(404).json({ message: "Active doctor not found." });
        }
      }

      const result = await pool.query(
        `
          INSERT INTO doctor_time_off
            (doctor_id, start_date, end_date, start_time, end_time, reason, created_by_staff_user_id)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          RETURNING time_off_id
        `,
        [
          doctorId,
          startDate,
          endDate,
          startTime,
          endTime,
          reason,
          request.staff?.staffUserId ?? null,
        ],
      );

      const affected = await bookingsOutsideHours(pool, {
        doctorId,
        fromDate: startDate,
        toDate: endDate,
      });

      emitClinicUpdate({ type: "schedule_changed", doctorId });

      return response.status(201).json({
        time_off_id: result.rows[0].time_off_id,
        affected_bookings: affected,
      });
    } catch (error) {
      console.error("Error adding time off:", error);
      return response.status(500).json({ message: "Unable to add the time off." });
    }
  },
);

/*
 * DELETE /api/schedule/time-off/:timeOffId
 */
router.delete(
  "/time-off/:timeOffId",
  requireStaffAuth,
  requireRole("admin"),
  async (request, response) => {
    const timeOffId = Number(request.params.timeOffId);

    if (!Number.isInteger(timeOffId) || timeOffId <= 0) {
      return response.status(400).json({ message: "Invalid time off." });
    }

    try {
      const result = await pool.query(
        "DELETE FROM doctor_time_off WHERE time_off_id = $1 RETURNING doctor_id",
        [timeOffId],
      );

      if (result.rows.length === 0) {
        return response.status(404).json({ message: "Time off not found." });
      }

      emitClinicUpdate({
        type: "schedule_changed",
        doctorId: result.rows[0].doctor_id,
      });

      return response.json({ message: "Time off removed." });
    } catch (error) {
      console.error("Error removing time off:", error);
      return response.status(500).json({ message: "Unable to remove the time off." });
    }
  },
);

/*
 * GET /api/schedule/bookings-outside-hours?days=90
 *
 * Upcoming bookings that no longer fit the doctors' hours.
 */
router.get(
  "/bookings-outside-hours",
  requireStaffAuth,
  async (request, response) => {
    const days = Math.min(Math.max(Number(request.query.days) || 90, 1), 365);
    const today = clinicToday();
    const toDate = new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

    try {
      return response.json(
        await bookingsOutsideHours(pool, { doctorId: null, fromDate: today, toDate }),
      );
    } catch (error) {
      console.error("Error checking bookings outside hours:", error);
      return response.status(500).json({ message: "Unable to check bookings." });
    }
  },
);

export default router;
