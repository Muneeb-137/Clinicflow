import { pool } from "../../db.js";

/*
 * =========================================================
 * WAIT-TIME ANALYTICS
 * =========================================================
 *
 * Definitions (used everywhere, so numbers agree):
 *
 * - Wait: check-in -> roomed (time in the waiting room).
 *   For both visit types this is the patient-facing wait.
 * - Walk-in arrival -> check-in: registration/forms time.
 * - Scheduled delay: roomed vs the booked appointment
 *   time (negative = seen early).
 *
 * Waits outside 0-12 hours are treated as data errors
 * (e.g. a visit left open overnight) and excluded.
 *
 * Time zones: *_at columns are stored without a zone in
 * the database session's zone; they are converted to
 * absolute instants, and to clinic (Toronto) time for
 * grouping by day/hour.
 */

const CLINIC_TIME_ZONE = "America/Toronto";

const instant = (column: string) =>
  `(${column} AT TIME ZONE current_setting('TimeZone'))`;

const MAX_VALID_WAIT_MINUTES = 12 * 60;

export type VisitTypeFilter =
  | "walk_in"
  | "scheduled"
  | null;

// pg returns numeric/bigint as strings.
function toNumber(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  const number = Number(value);

  return Number.isFinite(number) ? number : null;
}

function normalizeRows<T>(
  rows: Record<string, unknown>[],
  textColumns: string[] = [],
): T[] {
  return rows.map((row) => {
    const normalized: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(row)) {
      normalized[key] =
        textColumns.includes(key) ||
        value === null ||
        typeof value !== "string" ||
        value === ""
          ? value
          : (toNumber(value) ?? value);
    }

    return normalized as T;
  });
}

/*
 * ---------------------------------------------------------
 * TODAY'S SUMMARY (dashboard + live queues)
 * ---------------------------------------------------------
 */
export type VisitTypeSummary = {
  visitType: "walk_in" | "scheduled";

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
};

export async function getTodayWaitSummary(): Promise<
  VisitTypeSummary[]
> {
  const result = await pool.query(`
    WITH today AS (
      SELECT (
        CURRENT_TIMESTAMP
        AT TIME ZONE '${CLINIC_TIME_ZONE}'
      )::date AS day
    ),

    visits AS (
      SELECT
        a.visit_type,
        a.status,
        a.appointment_date,

        EXTRACT(
          EPOCH FROM (a.roomed_at - a.checked_in_at)
        ) / 60 AS wait_minutes,

        EXTRACT(
          EPOCH FROM (
            CURRENT_TIMESTAMP -
            ${instant("a.checked_in_at")}
          )
        ) / 60 AS current_wait_minutes

      FROM appointments AS a, today

      WHERE a.appointment_date
        BETWEEN today.day - 28 AND today.day
    ),

    types AS (
      SELECT unnest(
        ARRAY['walk_in', 'scheduled']
      ) AS visit_type
    )

    SELECT
      types.visit_type,

      COUNT(*) FILTER (
        WHERE v.appointment_date = today.day
          AND v.wait_minutes BETWEEN 0 AND ${MAX_VALID_WAIT_MINUTES}
      )::integer AS seen_count,

      ROUND(AVG(v.wait_minutes) FILTER (
        WHERE v.appointment_date = today.day
          AND v.wait_minutes BETWEEN 0 AND ${MAX_VALID_WAIT_MINUTES}
      )::numeric, 1) AS average_wait_minutes,

      ROUND((percentile_cont(0.5) WITHIN GROUP (
        ORDER BY v.wait_minutes
      ) FILTER (
        WHERE v.appointment_date = today.day
          AND v.wait_minutes BETWEEN 0 AND ${MAX_VALID_WAIT_MINUTES}
      ))::numeric, 1) AS median_wait_minutes,

      COUNT(*) FILTER (
        WHERE v.appointment_date = today.day
          AND v.status = 'checked_in'
      )::integer AS waiting_count,

      ROUND(AVG(v.current_wait_minutes) FILTER (
        WHERE v.appointment_date = today.day
          AND v.status = 'checked_in'
      )::numeric, 1) AS average_current_wait_minutes,

      ROUND(MAX(v.current_wait_minutes) FILTER (
        WHERE v.appointment_date = today.day
          AND v.status = 'checked_in'
      )::numeric, 1) AS longest_current_wait_minutes,

      ROUND(AVG(v.wait_minutes) FILTER (
        WHERE v.appointment_date < today.day
          AND v.wait_minutes BETWEEN 0 AND ${MAX_VALID_WAIT_MINUTES}
      )::numeric, 1) AS baseline_average_wait_minutes,

      COUNT(*) FILTER (
        WHERE v.appointment_date < today.day
          AND v.wait_minutes BETWEEN 0 AND ${MAX_VALID_WAIT_MINUTES}
      )::integer AS baseline_sample_size

    FROM types
    CROSS JOIN today
    LEFT JOIN visits AS v
      ON v.visit_type = types.visit_type

    GROUP BY types.visit_type
    ORDER BY types.visit_type DESC;
  `);

  return normalizeRows<Record<string, unknown>>(
    result.rows,
    ["visit_type"],
  ).map((row) => ({
    visitType: row.visit_type as
      | "walk_in"
      | "scheduled",
    seenCount: (row.seen_count as number) ?? 0,
    averageWaitMinutes:
      row.average_wait_minutes as number | null,
    medianWaitMinutes:
      row.median_wait_minutes as number | null,
    waitingCount: (row.waiting_count as number) ?? 0,
    averageCurrentWaitMinutes:
      row.average_current_wait_minutes as
        | number
        | null,
    longestCurrentWaitMinutes:
      row.longest_current_wait_minutes as
        | number
        | null,
    baselineAverageWaitMinutes:
      row.baseline_average_wait_minutes as
        | number
        | null,
    baselineSampleSize:
      (row.baseline_sample_size as number) ?? 0,
  }));
}

/*
 * ---------------------------------------------------------
 * DETAILED ANALYTICS (Wait Time Analytics page)
 * ---------------------------------------------------------
 */
export type AnalyticsFilters = {
  startDate: string;
  endDate: string;
  visitType: VisitTypeFilter;
  doctorId: number | null;
};

const VISITS_CTE = `
  WITH visits AS (
    SELECT
      a.appointment_id,
      a.visit_type,
      a.status,
      a.appointment_date,
      a.doctor_id,
      a.appointment_type_id,
      a.duration_minutes,
      a.missed_reason,

      d.first_name AS doctor_first_name,
      d.last_name AS doctor_last_name,
      at.name AS appointment_type_name,

      (
        ${instant("a.checked_in_at")}
        AT TIME ZONE '${CLINIC_TIME_ZONE}'
      ) AS local_checked_in_at,

      EXTRACT(
        EPOCH FROM (a.roomed_at - a.checked_in_at)
      ) / 60 AS wait_minutes,

      EXTRACT(
        EPOCH FROM (
          ${instant("a.checked_in_at")} - a.arrived_at
        )
      ) / 60 AS arrival_to_checkin_minutes,

      EXTRACT(
        EPOCH FROM (
          ${instant("a.roomed_at")} - a.arrived_at
        )
      ) / 60 AS arrival_to_room_minutes,

      CASE
        WHEN a.start_time IS NULL THEN NULL
        ELSE EXTRACT(
          EPOCH FROM (
            ${instant("a.roomed_at")} -
            (
              (a.appointment_date + a.start_time)
              AT TIME ZONE '${CLINIC_TIME_ZONE}'
            )
          )
        ) / 60
      END AS scheduled_delay_minutes,

      EXTRACT(
        EPOCH FROM (
          a.consult_ended_at - a.consult_started_at
        )
      ) / 60 AS consult_minutes

    FROM appointments AS a

    LEFT JOIN doctors AS d
      ON d.doctor_id = a.doctor_id

    LEFT JOIN appointment_types AS at
      ON at.appointment_type_id = a.appointment_type_id

    WHERE a.appointment_date BETWEEN $1::date AND $2::date
      AND ($3::text IS NULL OR a.visit_type = $3::text)
      AND ($4::integer IS NULL OR a.doctor_id = $4::integer)
  ),

  waits AS (
    SELECT *
    FROM visits
    WHERE wait_minutes BETWEEN 0 AND ${MAX_VALID_WAIT_MINUTES}
  )
`;

// Shared aggregate columns over "waits".
const WAIT_STATS = `
  COUNT(*)::integer AS visits,
  ROUND(AVG(wait_minutes)::numeric, 1)
    AS average_wait,
  ROUND((percentile_cont(0.5) WITHIN GROUP (
    ORDER BY wait_minutes
  ))::numeric, 1) AS median_wait
`;

export async function getWaitTimeAnalytics(
  filters: AnalyticsFilters,
) {
  const params = [
    filters.startDate,
    filters.endDate,
    filters.visitType,
    filters.doctorId,
  ];

  const query = (sql: string) =>
    pool.query(`${VISITS_CTE} ${sql}`, params);

  const [
    kpis,
    daily,
    byHour,
    byWeekday,
    byDoctor,
    byAppointmentType,
    distribution,
    flow,
    consultAccuracy,
  ] = await Promise.all([
    query(`
      SELECT
        COALESCE(visit_type, 'all') AS visit_type,
        ${WAIT_STATS},
        ROUND((percentile_cont(0.9) WITHIN GROUP (
          ORDER BY wait_minutes
        ))::numeric, 1) AS p90_wait,
        ROUND(MAX(wait_minutes)::numeric, 1)
          AS max_wait,
        ROUND(
          100.0 * COUNT(*) FILTER (WHERE wait_minutes <= 15)
          / NULLIF(COUNT(*), 0),
          1
        ) AS pct_within_15,
        ROUND(
          100.0 * COUNT(*) FILTER (WHERE wait_minutes <= 30)
          / NULLIF(COUNT(*), 0),
          1
        ) AS pct_within_30
      FROM waits
      GROUP BY GROUPING SETS ((visit_type), ())
      ORDER BY visit_type NULLS FIRST;
    `),

    query(`
      SELECT
        appointment_date::text AS date,
        visit_type,
        ${WAIT_STATS}
      FROM waits
      GROUP BY appointment_date, visit_type
      ORDER BY appointment_date, visit_type;
    `),

    query(`
      SELECT
        EXTRACT(HOUR FROM local_checked_in_at)::integer
          AS hour,
        visit_type,
        ${WAIT_STATS}
      FROM waits
      GROUP BY 1, visit_type
      ORDER BY 1, visit_type;
    `),

    query(`
      SELECT
        EXTRACT(DOW FROM local_checked_in_at)::integer
          AS weekday,
        visit_type,
        ${WAIT_STATS}
      FROM waits
      GROUP BY 1, visit_type
      ORDER BY 1, visit_type;
    `),

    query(`
      SELECT
        doctor_id,
        CONCAT_WS(' ', doctor_first_name, doctor_last_name)
          AS doctor_name,
        visit_type,
        ${WAIT_STATS}
      FROM waits
      WHERE doctor_id IS NOT NULL
      GROUP BY doctor_id, doctor_first_name,
        doctor_last_name, visit_type
      ORDER BY average_wait DESC NULLS LAST;
    `),

    query(`
      SELECT
        COALESCE(appointment_type_name, 'Unknown')
          AS appointment_type,
        visit_type,
        ${WAIT_STATS}
      FROM waits
      GROUP BY appointment_type_name, visit_type
      ORDER BY average_wait DESC NULLS LAST;
    `),

    query(`
      SELECT
        visit_type,
        CASE
          WHEN wait_minutes < 10 THEN '0-10'
          WHEN wait_minutes < 20 THEN '10-20'
          WHEN wait_minutes < 30 THEN '20-30'
          WHEN wait_minutes < 45 THEN '30-45'
          WHEN wait_minutes < 60 THEN '45-60'
          ELSE '60+'
        END AS bucket,
        COUNT(*)::integer AS visits
      FROM waits
      GROUP BY visit_type, bucket;
    `),

    query(`
      SELECT
        visit_type,
        COUNT(*)::integer AS total_visits,
        COUNT(*) FILTER (
          WHERE status = 'completed'
        )::integer AS completed,
        COUNT(*) FILTER (
          WHERE status = 'cancelled'
        )::integer AS cancelled,
        COUNT(*) FILTER (
          WHERE status = 'missed'
            AND missed_reason = 'Left without being seen'
        )::integer AS left_without_being_seen,
        COUNT(*) FILTER (
          WHERE status = 'missed'
            AND missed_reason IS DISTINCT FROM
              'Left without being seen'
        )::integer AS no_shows,

        ROUND(AVG(arrival_to_checkin_minutes) FILTER (
          WHERE arrival_to_checkin_minutes
            BETWEEN 0 AND ${MAX_VALID_WAIT_MINUTES}
        )::numeric, 1) AS average_arrival_to_checkin,

        ROUND(AVG(arrival_to_room_minutes) FILTER (
          WHERE arrival_to_room_minutes
            BETWEEN 0 AND ${MAX_VALID_WAIT_MINUTES}
        )::numeric, 1) AS average_arrival_to_room,

        ROUND(AVG(GREATEST(scheduled_delay_minutes, 0)) FILTER (
          WHERE scheduled_delay_minutes
            BETWEEN -${MAX_VALID_WAIT_MINUTES} AND ${MAX_VALID_WAIT_MINUTES}
        )::numeric, 1) AS average_delay_past_appointment,

        ROUND(
          100.0 * COUNT(*) FILTER (
            WHERE scheduled_delay_minutes <= 10
          ) / NULLIF(COUNT(*) FILTER (
            WHERE scheduled_delay_minutes
              BETWEEN -${MAX_VALID_WAIT_MINUTES} AND ${MAX_VALID_WAIT_MINUTES}
          ), 0),
          1
        ) AS pct_seen_within_10_of_appointment

      FROM visits
      GROUP BY visit_type
      ORDER BY visit_type DESC;
    `),

    /*
     * Every active appointment type, even with no
     * completed consults yet, so the table always lists
     * all visit types. Actual length is split by walk-in
     * and scheduled. Consults shorter than 2 min or longer
     * than 3x the booked length (or 4 h) are treated as
     * data errors (visits clicked through or left open).
     */
    query(`
      , consults AS (
        SELECT
          appointment_type_id,
          visit_type,
          duration_minutes,
          consult_minutes
        FROM visits
        WHERE status = 'completed'
          AND consult_minutes >= 2
          AND consult_minutes <= LEAST(
            240,
            3 * COALESCE(duration_minutes, 30)
          )
      )
      SELECT
        at.name AS appointment_type,

        -- Booked length: what these visits were booked
        -- for, or the type's configured length if none.
        ROUND(
          COALESCE(
            AVG(c.duration_minutes),
            at.default_duration_minutes
          )::numeric,
          1
        ) AS booked_minutes,

        ROUND((percentile_cont(0.5) WITHIN GROUP (
          ORDER BY c.consult_minutes
        ))::numeric, 1) AS median_actual_minutes,

        ROUND((percentile_cont(0.5) WITHIN GROUP (
          ORDER BY c.consult_minutes
        ) FILTER (
          WHERE c.visit_type = 'walk_in'
        ))::numeric, 1) AS walk_in_median_minutes,

        ROUND((percentile_cont(0.5) WITHIN GROUP (
          ORDER BY c.consult_minutes
        ) FILTER (
          WHERE c.visit_type = 'scheduled'
        ))::numeric, 1) AS scheduled_median_minutes,

        COUNT(c.consult_minutes)::integer AS visits,

        COUNT(c.consult_minutes) FILTER (
          WHERE c.visit_type = 'walk_in'
        )::integer AS walk_in_visits,

        COUNT(c.consult_minutes) FILTER (
          WHERE c.visit_type = 'scheduled'
        )::integer AS scheduled_visits

      FROM appointment_types AS at

      LEFT JOIN consults AS c
        ON c.appointment_type_id =
           at.appointment_type_id

      WHERE at.is_active = TRUE

      GROUP BY
        at.appointment_type_id,
        at.name,
        at.default_duration_minutes

      ORDER BY
        visits DESC,
        at.name;
    `),
  ]);

  const text = (...columns: string[]) => [
    "visit_type",
    "date",
    "bucket",
    ...columns,
  ];

  return {
    filters,
    definitions: {
      wait: "Check-in to roomed (time in the waiting room).",
      arrivalToCheckin:
        "Walk-in arrival to check-in (registration and forms).",
      scheduledDelay:
        "Roomed time compared with the booked appointment time.",
      excluded: `Waits outside 0-${MAX_VALID_WAIT_MINUTES / 60} hours are excluded as data errors.`,
    },
    kpis: normalizeRows(kpis.rows, text()),
    daily: normalizeRows(daily.rows, text()),
    byHour: normalizeRows(byHour.rows, text()),
    byWeekday: normalizeRows(byWeekday.rows, text()),
    byDoctor: normalizeRows(
      byDoctor.rows,
      text("doctor_name"),
    ),
    byAppointmentType: normalizeRows(
      byAppointmentType.rows,
      text("appointment_type"),
    ),
    distribution: normalizeRows(
      distribution.rows,
      text(),
    ),
    flow: normalizeRows(flow.rows, text()),
    consultAccuracy: normalizeRows(
      consultAccuracy.rows,
      text("appointment_type"),
    ),
  };
}
