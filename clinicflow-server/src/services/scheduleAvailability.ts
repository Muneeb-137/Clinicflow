import { pool } from "../db.js";

/*
 * =========================================================
 * DAY AVAILABILITY FROM THE REAL SCHEDULE
 * =========================================================
 *
 * Built from what booking actually uses:
 * - doctor_schedule_blocks: scheduled / walk-in / blocked
 *   hours for that weekday;
 * - doctor_schedule_settings: daily booking capacity and the
 *   booking grid (e.g. every 15 minutes);
 * - appointments and active holds on that date.
 *
 * (The old appointment_slots table is no longer read; its
 * numbers had drifted far from the real bookings.)
 */

export type DaySlot = {
  slot_id: number;
  doctor_id: number;
  slot_date: string;
  start_time: string;
  end_time: string;
  slot_type: "scheduled" | "walk_in";
  // past: already over (nothing to book). full: the day's
  // booking capacity is used up. blocked: blocked hours
  // (lunch, meetings...), see blocked_reason.
  slot_status: "available" | "booked" | "blocked" | "past" | "full";
  blocked_reason: string | null;
};

/*
 * Every grid time in the doctor's day, with whether it is
 * open for booking. Booked = overlaps a booking or an active
 * hold; past = already over; full = the day's booking
 * capacity is used up; blocked = blocked hours.
 */
export async function getDoctorDaySlots(
  doctorId: number,
  date: string,
): Promise<DaySlot[]> {
  const result = await pool.query<DaySlot>(
    `
      WITH settings AS (
        SELECT
          COALESCE(dss.booking_interval_minutes, 15) AS step,
          dss.scheduled_patient_capacity AS capacity
        FROM (SELECT 1) AS one
        LEFT JOIN doctor_schedule_settings AS dss
          ON dss.doctor_id = $1
          AND dss.is_active = TRUE
          AND dss.day_of_week = EXTRACT(DOW FROM $2::date)::integer
      ),
      booked_count AS (
        SELECT COUNT(*)::integer AS n
        FROM appointments AS a
        WHERE a.doctor_id = $1
          AND a.appointment_date = $2::date
          AND a.visit_type = 'scheduled'
          AND a.status NOT IN ('cancelled', 'missed')
      ),
      grid AS (
        SELECT
          b.block_type,
          b.block_reason,
          gs AS starts_at,
          gs + make_interval(mins => s.step) AS ends_at
        FROM effective_schedule_blocks(($2::date)::date) AS b
        CROSS JOIN settings AS s
        CROSS JOIN LATERAL generate_series(
          $2::date + b.start_time,
          $2::date + b.end_time - make_interval(mins => s.step),
          make_interval(mins => s.step)
        ) AS gs
        WHERE b.doctor_id = $1
          AND b.is_active = TRUE
          
      )
      SELECT
        ROW_NUMBER() OVER (ORDER BY g.starts_at)::integer AS slot_id,
        $1::integer AS doctor_id,
        $2::text AS slot_date,
        to_char(g.starts_at, 'HH24:MI:SS') AS start_time,
        to_char(g.ends_at, 'HH24:MI:SS') AS end_time,
        CASE
          WHEN g.block_type = 'walk_in' THEN 'walk_in'
          ELSE 'scheduled'
        END AS slot_type,
        CASE
          WHEN g.block_type = 'blocked' THEN 'blocked'
          WHEN g.block_type = 'scheduled' AND (EXISTS (
            SELECT 1
            FROM appointments AS a
            WHERE a.doctor_id = $1
              AND a.appointment_date = $2::date
              AND a.visit_type = 'scheduled'
              AND a.status IN ('scheduled', 'checked_in', 'roomed', 'completed')
              AND a.start_time IS NOT NULL
              AND tsrange(g.starts_at, g.ends_at) && tsrange(
                $2::date + a.start_time,
                $2::date + a.start_time
                  + make_interval(mins => COALESCE(a.duration_minutes, 1))
              )
          ) OR EXISTS (
            SELECT 1
            FROM appointment_holds AS h
            WHERE h.doctor_id = $1
              AND h.appointment_date = $2::date
              AND h.status = 'active'
              AND h.expires_at > clock_timestamp()
              AND tsrange(g.starts_at, g.ends_at) && tsrange(
                $2::date + h.start_time,
                $2::date + h.start_time
                  + make_interval(mins => h.duration_minutes)
              )
          )) THEN 'booked'
          WHEN g.starts_at <= (CURRENT_TIMESTAMP AT TIME ZONE 'America/Toronto')
            THEN 'past'
          WHEN g.block_type = 'walk_in' THEN 'available'
          WHEN s.capacity IS NOT NULL AND bc.n >= s.capacity
            THEN 'full'
          ELSE 'available'
        END AS slot_status,
        CASE
          WHEN g.block_type = 'blocked' THEN g.block_reason
        END AS blocked_reason
      FROM grid AS g
      CROSS JOIN settings AS s
      CROSS JOIN booked_count AS bc
      ORDER BY g.starts_at;
    `,
    [doctorId, date],
  );

  return result.rows;
}

export type DoctorDaySummary = {
  doctor_id: number;
  first_name: string;
  last_name: string;
  specialty: string | null;
  // Bookings still possible today (capacity left, and at
  // least one open time).
  patient_booking_slots: number;
  booked_slots: number;
  blocked_slots: number;
  walk_in_slots: number;
  next_available: string | null;
  walk_in_schedule: { start_time: string; end_time: string }[] | null;
};

/*
 * Per-doctor summary for the booking wizard's doctor cards.
 */
export async function getDoctorsDaySummary(
  date: string,
): Promise<DoctorDaySummary[]> {
  const doctors = await pool.query<{
    doctor_id: number;
    first_name: string;
    last_name: string;
    specialty: string | null;
    capacity: number | null;
    booked: number;
    walk_in_schedule: { start_time: string; end_time: string }[] | null;
  }>(
    `
      SELECT
        d.doctor_id,
        d.first_name,
        d.last_name,
        d.specialty,
        dss.scheduled_patient_capacity AS capacity,
        (
          SELECT COUNT(*)::integer
          FROM appointments AS a
          WHERE a.doctor_id = d.doctor_id
            AND a.appointment_date = $1::date
            AND a.visit_type = 'scheduled'
            AND a.status NOT IN ('cancelled', 'missed')
        ) AS booked,
        (
          SELECT json_agg(
            json_build_object(
              'start_time', dsb.start_time,
              'end_time', dsb.end_time
            )
            ORDER BY dsb.start_time
          )
          FROM effective_schedule_blocks(($1::date)::date) AS dsb
          WHERE dsb.doctor_id = d.doctor_id
            AND dsb.is_active = TRUE
            AND dsb.block_type = 'walk_in'
            
        ) AS walk_in_schedule
      FROM doctors AS d
      LEFT JOIN doctor_schedule_settings AS dss
        ON dss.doctor_id = d.doctor_id
        AND dss.is_active = TRUE
        AND dss.day_of_week = EXTRACT(DOW FROM $1::date)::integer
      WHERE d.is_active = TRUE
      ORDER BY d.doctor_id;
    `,
    [date],
  );

  return Promise.all(
    doctors.rows.map(async (doctor) => {
      const slots = await getDoctorDaySlots(doctor.doctor_id, date);

      const openTimes = slots.filter(
        (slot) =>
          slot.slot_type === "scheduled" &&
          slot.slot_status === "available",
      );

      const capacityLeft =
        doctor.capacity === null
          ? openTimes.length
          : Math.max(doctor.capacity - doctor.booked, 0);

      return {
        doctor_id: doctor.doctor_id,
        first_name: doctor.first_name,
        last_name: doctor.last_name,
        specialty: doctor.specialty,
        patient_booking_slots:
          openTimes.length === 0 ? 0 : capacityLeft,
        booked_slots: doctor.booked,
        blocked_slots: slots.filter(
          (slot) => slot.slot_status === "blocked",
        ).length,
        walk_in_slots: slots.filter(
          (slot) => slot.slot_type === "walk_in",
        ).length,
        next_available:
          capacityLeft > 0 ? (openTimes[0]?.start_time ?? null) : null,
        walk_in_schedule: doctor.walk_in_schedule,
      };
    }),
  );
}
