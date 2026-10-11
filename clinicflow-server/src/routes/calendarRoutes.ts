import express from "express";
import { pool } from "../db.js";
import { requireStaffAuth } from "../middleware/authMiddleware.js";

const router = express.Router();

/*
 * GET /api/calendar/summary
 *
 * Example:
 * /api/calendar/summary?startDate=2026-08-03&endDate=2026-08-09
 */
router.get("/summary", requireStaffAuth, async (request, response) => {
  try {
    const startDate =
      typeof request.query.startDate === "string"
        ? request.query.startDate
        : null;

    const endDate =
      typeof request.query.endDate === "string"
        ? request.query.endDate
        : null;

    if (!startDate || !endDate) {
      return response.status(400).json({
        message: "startDate and endDate are required.",
      });
    }

    // Bound the range so one request cannot make the
    // database generate years of calendar rows.
    const MAX_RANGE_DAYS = 62;

    const datePattern = /^\d{4}-\d{2}-\d{2}$/;

    const rangeDays =
      (Date.parse(endDate) - Date.parse(startDate)) /
      86_400_000;

    if (
      !datePattern.test(startDate) ||
      !datePattern.test(endDate) ||
      Number.isNaN(rangeDays) ||
      rangeDays < 0 ||
      rangeDays > MAX_RANGE_DAYS
    ) {
      return response.status(400).json({
        message: `Provide a valid date range of at most ${MAX_RANGE_DAYS} days.`,
      });
    }

    const result = await pool.query(
      `
        WITH calendar_days AS (
          SELECT generate_series(
            $1::date,
            $2::date,
            INTERVAL '1 day'
          )::date AS calendar_date
        ),

        active_doctors AS (
          SELECT
            doctor_id,
            first_name,
            last_name,
            specialty
          FROM doctors
          WHERE is_active = TRUE
        ),

        appointment_counts AS (
          SELECT
            a.doctor_id,
            a.appointment_date,

            COUNT(*) FILTER (
              WHERE
                a.visit_type = 'scheduled'
                AND a.status NOT IN (
                  'cancelled',
                  'missed'
                )
            )::INTEGER AS booked_slots

          FROM appointments AS a

          WHERE
            a.appointment_date
              BETWEEN $1::date AND $2::date

          GROUP BY
            a.doctor_id,
            a.appointment_date
        ),

        schedule_settings AS (
          SELECT
            d.doctor_id,
            days.calendar_date,

            dss.scheduled_patient_capacity

          FROM active_doctors AS d

          CROSS JOIN calendar_days AS days

          LEFT JOIN doctor_schedule_settings AS dss
            ON dss.doctor_id = d.doctor_id
            AND dss.is_active = TRUE
            AND dss.day_of_week =
              EXTRACT(
                DOW FROM days.calendar_date
              )::INTEGER
        ),

        walk_in_blocks AS (
          SELECT
            d.doctor_id,
            days.calendar_date,

            MIN(dsb.start_time)
              AS walk_in_start_time,

            MAX(dsb.end_time)
              AS walk_in_end_time

          FROM active_doctors AS d

          CROSS JOIN calendar_days AS days

          LEFT JOIN LATERAL effective_schedule_blocks((days.calendar_date)::date) AS dsb
            ON dsb.doctor_id = d.doctor_id
            AND dsb.is_active = TRUE
            AND dsb.block_type = 'walk_in'
            

          GROUP BY
            d.doctor_id,
            days.calendar_date
        )

        SELECT
          d.doctor_id,
          d.first_name,
          d.last_name,
          d.specialty,

          days.calendar_date AS slot_date,

          COALESCE(
            ac.booked_slots,
            0
          )::INTEGER AS booked_slots,

          COALESCE(
            ss.scheduled_patient_capacity,
            0
          )::INTEGER AS total_slots,

          GREATEST(
            COALESCE(
              ss.scheduled_patient_capacity,
              0
            )
            -
            COALESCE(
              ac.booked_slots,
              0
            ),
            0
          )::INTEGER AS patient_booking_slots,

          wb.walk_in_start_time,
          wb.walk_in_end_time

        FROM active_doctors AS d

        CROSS JOIN calendar_days AS days

        LEFT JOIN appointment_counts AS ac
          ON ac.doctor_id = d.doctor_id
          AND ac.appointment_date =
            days.calendar_date

        LEFT JOIN schedule_settings AS ss
          ON ss.doctor_id = d.doctor_id
          AND ss.calendar_date =
            days.calendar_date

        LEFT JOIN walk_in_blocks AS wb
          ON wb.doctor_id = d.doctor_id
          AND wb.calendar_date =
            days.calendar_date

        ORDER BY
          days.calendar_date,
          d.doctor_id;
      `,
      [startDate, endDate],
    );

    return response.json(result.rows);
  } catch (error) {
    console.error(
      "Error loading calendar summary:",
      error,
    );

    return response.status(500).json({
      message: "Unable to load calendar summary.",
    });
  }
});

/*
 * GET /api/calendar/next-available
 *
 * Returns the next scheduled opening for every active physician.
 *
 * This is a calendar-level availability preview.
 * The booking flow still performs the final duration-specific
 * availability check after an appointment reason is selected.
 */
router.get("/next-available", requireStaffAuth, async (request, response) => {
  try {

    const selectedDate =
      typeof request.query.date === "string"
        ? request.query.date
        : null;

    if (!selectedDate) {
      return response.status(400).json({
        message: "date is required.",
      });
    }
    const result = await pool.query(
      `
        WITH search_dates AS (
          SELECT
            $1::date AS calendar_date
        ),

        doctor_days AS (
          SELECT
            d.doctor_id,
            d.first_name,
            d.last_name,
            d.specialty,
            sd.calendar_date,

            dss.scheduled_patient_capacity,
            dss.booking_interval_minutes

          FROM doctors AS d

          CROSS JOIN search_dates AS sd

          INNER JOIN doctor_schedule_settings AS dss
            ON dss.doctor_id = d.doctor_id
            AND dss.is_active = TRUE
            AND dss.day_of_week =
              EXTRACT(
                DOW FROM sd.calendar_date
              )::INTEGER

          WHERE d.is_active = TRUE
        ),

        scheduled_blocks AS (
          SELECT
            dd.doctor_id,
            dd.first_name,
            dd.last_name,
            dd.specialty,
            dd.calendar_date,
            dd.scheduled_patient_capacity,
            dd.booking_interval_minutes,
            dsb.start_time,
            dsb.end_time

          FROM doctor_days AS dd

          INNER JOIN LATERAL effective_schedule_blocks((dd.calendar_date)::date) AS dsb
            ON dsb.doctor_id = dd.doctor_id
            AND dsb.is_active = TRUE
            AND dsb.block_type = 'scheduled'
            
        ),

        candidate_times AS (
          SELECT
            sb.doctor_id,
            sb.first_name,
            sb.last_name,
            sb.specialty,
            sb.calendar_date,
            sb.scheduled_patient_capacity,

            generated_time::time AS start_time

          FROM scheduled_blocks AS sb

          CROSS JOIN LATERAL generate_series(
            sb.calendar_date + sb.start_time,
            sb.calendar_date + sb.end_time
              - make_interval(
                  mins => sb.booking_interval_minutes
                ),
            make_interval(
              mins => sb.booking_interval_minutes
            )
          ) AS generated_time
        ),

        valid_candidates AS (
  SELECT
    ct.*

  FROM candidate_times AS ct

  WHERE
    (
      ct.calendar_date >
        (
          CURRENT_TIMESTAMP
          AT TIME ZONE 'America/Toronto'
        )::date

      OR

      (
        ct.calendar_date =
          (
            CURRENT_TIMESTAMP
            AT TIME ZONE 'America/Toronto'
          )::date

        AND ct.start_time >
          (
            CURRENT_TIMESTAMP
            AT TIME ZONE 'America/Toronto'
          )::time
      )
    )

    /*
     * Daily scheduled-patient capacity
     * must not already be full.
     */
    AND (
      SELECT COUNT(*)
      FROM appointments AS a
      WHERE
        a.doctor_id = ct.doctor_id
        AND a.appointment_date =
          ct.calendar_date
        AND a.visit_type = 'scheduled'
        AND a.status NOT IN (
          'cancelled',
          'missed'
        )
    ) < ct.scheduled_patient_capacity

    /*
     * Candidate must not already be occupied
     * by a scheduled appointment.
     */
    AND NOT EXISTS (
      SELECT 1
      FROM appointments AS a
      WHERE
        a.doctor_id = ct.doctor_id
        AND a.appointment_date =
          ct.calendar_date
        AND a.visit_type = 'scheduled'
        AND a.status NOT IN (
          'cancelled',
          'missed'
        )
        AND ct.start_time >= a.start_time
        AND ct.start_time <
          (
            a.start_time
            + make_interval(
                mins => a.duration_minutes
              )
          )
    )

    /*
     * Active holds temporarily make the
     * candidate unavailable.
     */
    AND NOT EXISTS (
      SELECT 1
      FROM appointment_holds AS h
      WHERE
        h.doctor_id = ct.doctor_id
        AND h.appointment_date =
          ct.calendar_date
        AND h.status = 'active'
        AND h.expires_at >
          CURRENT_TIMESTAMP
        AND ct.start_time >= h.start_time
        AND ct.start_time <
          (
            h.start_time
            + make_interval(
                mins => h.duration_minutes
              )
          )
    )
),

        ranked_candidates AS (
          SELECT
            vc.*,

            ROW_NUMBER() OVER (
              PARTITION BY vc.doctor_id
              ORDER BY
                vc.calendar_date,
                vc.start_time
            ) AS position

          FROM valid_candidates AS vc
        )

        SELECT
          d.doctor_id,
          d.first_name,
          d.last_name,
          d.specialty,

          TO_CHAR(
            rc.calendar_date,
            'YYYY-MM-DD'
          ) AS next_available_date,

          rc.start_time
            AS next_available_time

        FROM doctors AS d

        LEFT JOIN ranked_candidates AS rc
          ON rc.doctor_id = d.doctor_id
          AND rc.position = 1

        WHERE d.is_active = TRUE

        ORDER BY
          d.last_name,
          d.first_name;
           `,
      [selectedDate],
    );

    return response.status(200).json(
      result.rows,
    );
  } catch (error) {
    console.error(
      "Error loading next calendar availability:",
      error,
    );

    return response.status(500).json({
      message:
        "Unable to load next physician availability.",
    });
  }
});

router.get("/walk-in-schedule", requireStaffAuth, async (request, response) => {
  try {
    const selectedDate =
      typeof request.query.date === "string"
        ? request.query.date
        : null;

    if (!selectedDate) {
      return response.status(400).json({
        message: "date is required.",
      });
    }

    const result = await pool.query(
      `
        SELECT
          d.doctor_id,
          d.first_name,
          d.last_name,
          d.specialty,

          TO_CHAR(
            $1::date,
            'YYYY-MM-DD'
          ) AS schedule_date,

          MIN(dsb.start_time)
            AS walk_in_start_time,

          MAX(dsb.end_time)
            AS walk_in_end_time

        FROM doctors AS d

        LEFT JOIN LATERAL effective_schedule_blocks(($1::date)::date) AS dsb
          ON dsb.doctor_id = d.doctor_id
          AND dsb.is_active = TRUE
          AND dsb.block_type = 'walk_in'
          

        WHERE d.is_active = TRUE

        GROUP BY
          d.doctor_id,
          d.first_name,
          d.last_name,
          d.specialty

        ORDER BY
          d.last_name,
          d.first_name;
      `,
      [selectedDate],
    );

    return response.status(200).json(
      result.rows,
    );
  } catch (error) {
    console.error(
      "Error loading walk-in schedule:",
      error,
    );

    return response.status(500).json({
      message:
        "Unable to load physician walk-in schedule.",
    });
  }
});

export default router;