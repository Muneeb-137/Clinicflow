import { pool } from "../../db.js";

import type {
  ClinicState,
  ClinicStatePatient,
  ClinicStateProvider,
  DurationStats,
} from "./types.js";

/*
 * Builds a real-time snapshot of the clinic.
 *
 * IMPORTANT:
 * This service does NOT predict wait times.
 * It only describes what is actually happening
 * in the clinic right now.
 *
 * Time zones: appointment dates/times and schedule blocks
 * are clinic-local (Toronto) wall-clock values, and the
 * *_at columns are stored without a time zone in the
 * database session's zone. Everything is converted to
 * absolute instants here, in SQL, so the engine compares
 * plain Dates and stays correct across daylight saving.
 */

const CLINIC_TIME_ZONE = "America/Toronto";

// Stored-without-zone timestamp -> absolute instant.
const instant = (column: string) =>
  `(${column} AT TIME ZONE current_setting('TimeZone'))`;

// Clinic-local "today" for the reference time ($1).
const CLINIC_TODAY = `(($1::timestamptz AT TIME ZONE '${CLINIC_TIME_ZONE}')::date)`;

const PATIENT_COLUMNS = `
  a.appointment_id,
  a.patient_id,
  a.doctor_id,
  a.assignment_mode,
  a.appointment_type_id,

  a.visit_type,
  a.status,

  CASE
    WHEN a.start_time IS NULL THEN NULL
    ELSE (a.appointment_date + a.start_time)
      AT TIME ZONE '${CLINIC_TIME_ZONE}'
  END AS scheduled_start_at,

  a.duration_minutes,

  a.arrived_at,
  ${instant("a.checked_in_at")} AS checked_in_at,
  ${instant("a.roomed_at")} AS roomed_at,
  ${instant("a.consult_started_at")} AS consult_started_at
`;

function toIso(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  const date =
    value instanceof Date
      ? value
      : new Date(String(value));

  return Number.isNaN(date.getTime())
    ? null
    : date.toISOString();
}

function mapPatient(
  row: Record<string, unknown>,
): ClinicStatePatient {
  return {
    appointmentId: row.appointment_id as number,
    patientId: row.patient_id as number,

    doctorId: (row.doctor_id as number | null) ?? null,

    assignmentMode:
      row.assignment_mode === "manual"
        ? "manual"
        : "auto",

    appointmentTypeId:
      (row.appointment_type_id as number | null) ?? null,

    visitType:
      row.visit_type === "walk_in"
        ? "walk_in"
        : "scheduled",

    status: row.status as ClinicStatePatient["status"],

    scheduledStartAt: toIso(row.scheduled_start_at),

    durationMinutes:
      (row.duration_minutes as number | null) ?? null,

    arrivedAt: toIso(row.arrived_at),
    checkedInAt: toIso(row.checked_in_at),
    roomedAt: toIso(row.roomed_at),
    consultStartedAt: toIso(row.consult_started_at),
  };
}

/*
 * ---------------------------------------------------------
 * HISTORICAL CONSULT LENGTHS (cached)
 * ---------------------------------------------------------
 *
 * Learned from completed visits whose consult start and
 * end were both recorded. Visits a doctor forgot to close
 * (hours long) and near-zero clicks are excluded so they
 * cannot distort the estimates.
 */
const DURATION_STATS_TTL_MS = 10 * 60_000;

let durationStatsCache: {
  loadedAt: number;
  stats: Record<number, DurationStats>;
} | null = null;

export async function loadDurationStats(): Promise<
  Record<number, DurationStats>
> {
  if (
    durationStatsCache &&
    Date.now() - durationStatsCache.loadedAt <
      DURATION_STATS_TTL_MS
  ) {
    return durationStatsCache.stats;
  }

  const result = await pool.query<{
    appointment_type_id: number;
    median_minutes: number;
    p25_minutes: number;
    p75_minutes: number;
    sample_size: number;
  }>(`
    WITH consults AS (
      SELECT
        a.appointment_type_id,
        EXTRACT(
          EPOCH FROM (
            a.consult_ended_at - a.consult_started_at
          )
        ) / 60 AS minutes,
        a.duration_minutes
      FROM appointments AS a
      WHERE a.status = 'completed'
        AND a.appointment_type_id IS NOT NULL
        AND a.consult_started_at IS NOT NULL
        AND a.consult_ended_at IS NOT NULL
        AND a.appointment_date >=
          CURRENT_DATE - INTERVAL '120 days'
    )
    SELECT
      appointment_type_id,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY minutes)
        AS median_minutes,
      percentile_cont(0.25) WITHIN GROUP (ORDER BY minutes)
        AS p25_minutes,
      percentile_cont(0.75) WITHIN GROUP (ORDER BY minutes)
        AS p75_minutes,
      COUNT(*)::integer AS sample_size
    FROM consults
    WHERE minutes >= 2
      AND minutes <= LEAST(
        240,
        3 * COALESCE(duration_minutes, 30)
      )
    GROUP BY appointment_type_id;
  `);

  const stats: Record<number, DurationStats> = {};

  for (const row of result.rows) {
    stats[row.appointment_type_id] = {
      medianMinutes: Number(row.median_minutes),
      p25Minutes: Number(row.p25_minutes),
      p75Minutes: Number(row.p75_minutes),
      sampleSize: row.sample_size,
    };
  }

  durationStatsCache = {
    loadedAt: Date.now(),
    stats,
  };

  return stats;
}

/*
 * Typical walk-in arrival -> check-in minutes (forms),
 * from the last 60 days. Cached like the duration stats.
 * Returns undefined until there are enough samples, so
 * the simulator uses its default.
 */
const MIN_CHECK_IN_SAMPLES = 8;

let checkInMinutesCache: {
  loadedAt: number;
  minutes: number | undefined;
} | null = null;

export async function loadCheckInMinutes(): Promise<
  number | undefined
> {
  if (
    checkInMinutesCache &&
    Date.now() - checkInMinutesCache.loadedAt <
      DURATION_STATS_TTL_MS
  ) {
    return checkInMinutesCache.minutes;
  }

  const result = await pool.query<{
    median_minutes: number | null;
    sample_size: number;
  }>(`
    WITH samples AS (
      SELECT
        EXTRACT(
          EPOCH FROM (
            ${instant("a.checked_in_at")} - a.arrived_at
          )
        ) / 60 AS minutes
      FROM appointments AS a
      WHERE a.visit_type = 'walk_in'
        AND a.arrived_at IS NOT NULL
        AND a.checked_in_at IS NOT NULL
        AND a.appointment_date >=
          CURRENT_DATE - INTERVAL '60 days'
    )
    SELECT
      percentile_cont(0.5) WITHIN GROUP (ORDER BY minutes)
        AS median_minutes,
      COUNT(*)::integer AS sample_size
    FROM samples
    WHERE minutes BETWEEN 0 AND 60;
  `);

  const row = result.rows[0];

  const minutes =
    row && row.sample_size >= MIN_CHECK_IN_SAMPLES
      ? Number(row.median_minutes)
      : undefined;

  checkInMinutesCache = {
    loadedAt: Date.now(),
    minutes,
  };

  return minutes;
}

export async function buildClinicState(
  asOf?: Date,
): Promise<ClinicState> {
  const referenceTime = asOf ?? new Date();
  const reference = referenceTime.toISOString();

  /*
   * The four reads are independent, so run them in
   * parallel.
   */
  const [
    providersResult,
    patientsResult,
    upcomingScheduledResult,
    durationStats,
    checkInMinutes,
  ] = await Promise.all([
    /*
     * 1. ACTIVE PROVIDERS
     *
     * Operational status, current appointment, today's
     * room, and the walk-in block they are inside now
     * (with its end as an absolute instant).
     */
    pool.query(
      `
        SELECT
          d.doctor_id,
          d.first_name,
          d.last_name,

          COALESCE(
            ps.current_status,
            'unavailable'
          ) AS current_status,

          ps.status_reason,
          ps.current_appointment_id,

          ${instant("ps.estimated_ready_at")}
            AS estimated_ready_at,
          ps.readiness_estimate_minutes,
          ${instant("ps.readiness_estimate_updated_at")}
            AS readiness_estimate_updated_at,

          dra.room_name,

          walk_in_block.ends_at
            AS walk_in_block_ends_at,

          COALESCE(today_blocks.blocks, '[]'::json)
            AS today_blocks

        FROM doctors AS d

        LEFT JOIN provider_status AS ps
          ON ps.doctor_id = d.doctor_id

        LEFT JOIN doctor_room_assignments AS dra
          ON dra.doctor_id = d.doctor_id
          AND dra.assignment_date = ${CLINIC_TODAY}

        LEFT JOIN LATERAL (
          SELECT
            (${CLINIC_TODAY} + dsb.end_time)
              AT TIME ZONE '${CLINIC_TIME_ZONE}'
              AS ends_at

          FROM effective_schedule_blocks((( $1::timestamptz AT TIME ZONE '${CLINIC_TIME_ZONE}' ))::date) AS dsb

          WHERE dsb.doctor_id = d.doctor_id
            AND dsb.is_active = TRUE
            AND dsb.block_type = 'walk_in'

            

            AND (
              $1::timestamptz AT TIME ZONE '${CLINIC_TIME_ZONE}'
            )::time >= dsb.start_time

            AND (
              $1::timestamptz AT TIME ZONE '${CLINIC_TIME_ZONE}'
            )::time < dsb.end_time

          ORDER BY dsb.end_time ASC
          LIMIT 1
        ) AS walk_in_block ON TRUE

        LEFT JOIN LATERAL (
          SELECT json_agg(
            json_build_object(
              'blockType', dsb.block_type,
              'startAt',
                (${CLINIC_TODAY} + dsb.start_time)
                AT TIME ZONE '${CLINIC_TIME_ZONE}',
              'endAt',
                (${CLINIC_TODAY} + dsb.end_time)
                AT TIME ZONE '${CLINIC_TIME_ZONE}'
            )
            ORDER BY dsb.start_time
          ) AS blocks

          FROM effective_schedule_blocks((( $1::timestamptz AT TIME ZONE '${CLINIC_TIME_ZONE}' ))::date) AS dsb

          WHERE dsb.doctor_id = d.doctor_id
            AND dsb.is_active = TRUE
            
        ) AS today_blocks ON TRUE

        WHERE d.is_active = TRUE

        ORDER BY
          d.last_name,
          d.first_name;
      `,
      [reference],
    ),

    /*
     * 2. TODAY'S ACTIVE PATIENT FLOW
     *
     * checked_in = waiting
     * roomed     = with the doctor
     * scheduled walk-in = arrived, not checked in yet
     */
    pool.query(
      `
        SELECT ${PATIENT_COLUMNS}

        FROM appointments AS a

        WHERE a.appointment_date = ${CLINIC_TODAY}
          AND (
            a.status IN ('checked_in', 'roomed')
            OR (
              a.status = 'scheduled'
              AND a.visit_type = 'walk_in'
            )
          )

        ORDER BY
          a.checked_in_at ASC NULLS LAST,
          a.arrived_at ASC NULLS LAST,
          a.start_time ASC;
      `,
      [reference],
    ),

    /*
     * 3. BOOKED APPOINTMENTS STILL TO COME TODAY
     *
     * Patient not arrived yet. Used to protect scheduled
     * capacity from walk-ins.
     */
    pool.query(
      `
        SELECT ${PATIENT_COLUMNS}

        FROM appointments AS a

        WHERE a.appointment_date = ${CLINIC_TODAY}
          AND a.visit_type = 'scheduled'
          AND a.status = 'scheduled'
          -- Booking window not over yet (late patients
          -- are still expected until marked missed).
          AND (
            a.appointment_date + a.start_time
            + make_interval(
                mins => COALESCE(a.duration_minutes, 0)
              )
          )
            AT TIME ZONE '${CLINIC_TIME_ZONE}'
            > $1::timestamptz

        ORDER BY a.start_time ASC;
      `,
      [reference],
    ),

    loadDurationStats(),
    loadCheckInMinutes(),
  ]);

  const providers: ClinicStateProvider[] =
    providersResult.rows.map((row) => ({
      doctorId: row.doctor_id,

      firstName: row.first_name,
      lastName: row.last_name,

      status: row.current_status,
      statusReason: row.status_reason,

      currentAppointmentId:
        row.current_appointment_id,

      estimatedReadyAt: toIso(
        row.estimated_ready_at,
      ),

      readinessEstimateMinutes:
        row.readiness_estimate_minutes ?? null,

      readinessEstimateUpdatedAt: toIso(
        row.readiness_estimate_updated_at,
      ),

      roomName: row.room_name,

      walkInEligibleNow:
        row.walk_in_block_ends_at !== null,

      walkInBlockEndsAt: toIso(
        row.walk_in_block_ends_at,
      ),

      todayBlocks: (
        row.today_blocks as {
          blockType: string;
          startAt: string;
          endAt: string;
        }[]
      ).map((block) => ({
        blockType: block.blockType,
        startAt: toIso(block.startAt) as string,
        endAt: toIso(block.endAt) as string,
      })),
    }));

  const patients =
    patientsResult.rows.map(mapPatient);

  return {
    generatedAt: reference,

    providers,

    scheduledQueue: patients.filter(
      (patient) =>
        patient.status === "checked_in" &&
        patient.visitType === "scheduled",
    ),

    walkInQueue: patients.filter(
      (patient) =>
        patient.status === "checked_in" &&
        patient.visitType === "walk_in",
    ),

    pendingWalkIns: patients.filter(
      (patient) =>
        patient.status === "scheduled" &&
        patient.visitType === "walk_in",
    ),

    activeVisits: patients.filter(
      (patient) => patient.status === "roomed",
    ),

    upcomingScheduledAppointments:
      upcomingScheduledResult.rows.map(mapPatient),

    durationStats,

    checkInMinutes,
  };
}
