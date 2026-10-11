import express from "express";
import { isLongVisit, LONG_VISIT_MINUTES } from "../services/longVisits.js";
import { notifyBookingChange } from "../services/patientNotifications.js";
import { pool } from "../db.js";
import { emitClinicUpdate } from "../socket.js";
import {
  buildClinicState,
} from "../services/waittime/ClinicStateBuilder.js";

import { evaluateWalkInAdmission } from "../services/waittime/WalkInAdmission.js";
import { walkInNextStepOptions } from "../services/waittime/PredictionEngine.js";
import {
  simulateWalkInQueue,
} from "../services/waittime/QueueSimulator.js";
import {
  type AuthenticatedRequest,
  requireAnyAuth,
  requireStaffAuth,
} from "../middleware/authMiddleware.js";
import {
  requireOwnAppointmentIfDoctor,
  requireRole,
} from "../middleware/requireRole.js";
import type {
  NextFunction,
  Response,
} from "express";


const router = express.Router();

// Advisory lock key serialising walk-in admissions.
const WALK_IN_ADMISSION_LOCK = 734001;

// A patient may hold only a few slots at a time, so one
// account cannot block a doctor's whole day.
const MAX_ACTIVE_HOLDS_PER_PATIENT = 3;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/*
 * Rejects malformed hold tokens before they reach a
 * ::uuid cast in SQL (which would otherwise throw a 500).
 */
function requireValidHoldToken(
  request: AuthenticatedRequest,
  response: Response,
  next: NextFunction,
) {
  const holdToken =
    request.params.holdToken ??
    request.body?.hold_token;

  if (
    holdToken != null &&
    (typeof holdToken !== "string" ||
      !UUID_PATTERN.test(holdToken))
  ) {
    return response.status(400).json({
      message: "Invalid appointment hold.",
    });
  }

  next();
}

/*
 * Patients can only create holds for themselves, no matter
 * what patient_id the request body contains. Their limit on
 * active holds is checked inside the hold transaction.
 */
function scopeHoldToCaller(
  request: AuthenticatedRequest,
  _response: Response,
  next: NextFunction,
) {
  if (request.patientAuth) {
    request.body = {
      ...(request.body ?? {}),
      patient_id: request.patientAuth.patientId,
    };
  }

  next();
}

/*
GET /api/appointments/today

Returns all appointments scheduled for today's date.

The query joins:
- appointments
- patients
- doctors
- appointment_types
*/

const allowedStatuses = [
  "scheduled",
  "checked_in",
  "roomed",
  "completed",
  "cancelled",
  "missed",
] as const;

type AppointmentStatus = (typeof allowedStatuses)[number];
type CreateAppointmentBody = {
  patient_id: number;
  doctor_id: number;
  appointment_date: string;
  start_time: string;

  /*
   * Temporary reservation token used when
   * confirming a held appointment time.
   */
  hold_token?: string | null;

  reason_for_visit?:
    | string
    | null;

  notes?:
    | string
    | null;

  slot_id?:
    | number
    | null;

  visit_type?:
    | "scheduled"
    | "walk_in";

  booking_channel?:
    | "patient_portal"
    | "front_desk"
    | "phone";

  rebooked_from_appointment_id?:
    | number
    | null;
};

type CreateWalkInBody = {
  patient_id: number;
  doctor_id: number | null;
  appointment_type_id: number;

  reason_for_visit?: string | null;
  notes?: string | null;
  assignment_mode?: "auto" | "manual";

  // Staff chose "Add anyway" although the visit is
  // expected to run past the end of walk-in hours.
  capacity_override?: boolean;
};

type CreateAppointmentHoldBody = {
  patient_id?: number | null;
  doctor_id: number;
  appointment_reason_id: number;
  appointment_date: string;
  start_time: string;
};

/*
 * Schedule the real-time expiration of an appointment hold.
 *
 * PostgreSQL's expires_at remains the source of truth.
 * This timer exists so connected ClinicFlow clients are
 * notified immediately when availability changes.
 */
function scheduleAppointmentHoldExpiration(
  holdId: number,
  doctorId: number,
  appointmentDate: string,
  expiresAt: string,
) {
  const expirationDelay =
    new Date(expiresAt).getTime() - Date.now();

  const expireHold = async () => {
    try {
      const result = await pool.query(
        `
          UPDATE appointment_holds
          SET status = 'expired'
          WHERE hold_id = $1
            AND status = 'active'
            AND expires_at <= CURRENT_TIMESTAMP
          RETURNING hold_id;
        `,
        [holdId],
      );

      /*
       * If nothing was updated, the hold was already
       * converted, released, or expired.
       */
      if (result.rows.length === 0) {
        return;
      }

      emitClinicUpdate({
          type:
            "appointment_availability_changed",

          doctorId,

          appointmentDate,
        },
      );
    } catch (error) {
      console.error(
        "Error expiring appointment hold:",
        error,
      );
    }
  };

  const delay = Math.max(
    expirationDelay,
    0,
  );

  setTimeout(() => {
    void expireHold();
  }, delay);
}

  

async function markExpiredAppointmentsAsMissed() {
  const result = await pool.query<{
    appointment_id: number;
    doctor_id: number;
  }>(`
    UPDATE appointments
    SET
      status = 'missed',

      missed_at =
        appointment_date
        + start_time
        + make_interval(
            mins => duration_minutes
          ),

      missed_reason =
        'Patient did not check in before appointment window ended',

      follow_up_status = 'pending',
      follow_up_reason = NULL,
      follow_up_notes = NULL,
      followed_up_at = NULL,

      updated_at =
        CURRENT_TIMESTAMP

   WHERE status = 'scheduled'
    AND visit_type = 'scheduled'

    -- Today and any earlier day, so appointments from
    -- days the server was not running are caught too.
    AND appointment_date <=
      (
        CURRENT_TIMESTAMP
        AT TIME ZONE 'America/Toronto'
      )::date

    AND (
      appointment_date
      + start_time
      + make_interval(
          mins => duration_minutes
        )
    ) <= (
      CURRENT_TIMESTAMP
      AT TIME ZONE 'America/Toronto'
    )

    RETURNING
      appointment_id,
      doctor_id;
  `);

  for (const appointment of result.rows) {
    emitClinicUpdate({
        type:
          "appointment_status_changed",

        appointmentId:
          appointment.appointment_id,

        status:
          "missed",

        doctorId:
          appointment.doctor_id,
      },
    );
  }

  await closeVisitsFromPreviousDays();

  return result.rows;
}

/*
 * End-of-day cleanup for visits left open on earlier days.
 *
 * - Patients who arrived but were never roomed (walk-ins
 *   never checked in, or anyone still checked in) are
 *   marked missed: "Left without being seen". They show
 *   in Missed/Cancelled for front-desk follow-up.
 * - Visits still roomed (the doctor never clicked
 *   Complete) are marked completed at the end of their
 *   day. consult_ended_at is left NULL so reports can
 *   tell the real end time was not recorded.
 * - Doctors still attached to one of those visits are
 *   released so they can see patients again.
 */
async function closeVisitsFromPreviousDays() {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const unseenResult = await client.query(
      `
        UPDATE appointments
        SET
          status = 'missed',

          missed_at =
            appointment_date
            + TIME '23:59:59',

          missed_reason =
            'Left without being seen',

          follow_up_status = 'pending',
          follow_up_reason = NULL,
          follow_up_notes = NULL,
          followed_up_at = NULL,

          updated_at = CURRENT_TIMESTAMP

        WHERE appointment_date < (
            CURRENT_TIMESTAMP
            AT TIME ZONE 'America/Toronto'
          )::date
          AND (
            status = 'checked_in'
            OR (
              status = 'scheduled'
              AND visit_type = 'walk_in'
            )
          )

        RETURNING appointment_id;
      `,
    );

    const roomedResult = await client.query<{
      appointment_id: number;
    }>(
      `
        UPDATE appointments
        SET
          status = 'completed',

          -- End of the visit's day (same convention
          -- as missed_at).
          completed_at =
            appointment_date
            + TIME '23:59:59',

          updated_at = CURRENT_TIMESTAMP

        WHERE appointment_date < (
            CURRENT_TIMESTAMP
            AT TIME ZONE 'America/Toronto'
          )::date
          AND status = 'roomed'

        RETURNING appointment_id;
      `,
    );

    if (roomedResult.rows.length > 0) {
      await client.query(
        `
          UPDATE provider_status
          SET
            current_status = 'available',
            status_reason = NULL,
            current_appointment_id = NULL,
            estimated_ready_at = NULL,
            readiness_estimate_minutes = NULL,
            readiness_estimate_updated_at = NULL,
            status_updated_at = CURRENT_TIMESTAMP
          WHERE current_appointment_id = ANY($1::int[]);
        `,
        [
          roomedResult.rows.map(
            (row) => row.appointment_id,
          ),
        ],
      );
    }

    await client.query("COMMIT");

    const closedCount =
      unseenResult.rows.length +
      roomedResult.rows.length;

    if (closedCount > 0) {
      console.log(
        `Closed ${closedCount} visit(s) left open from previous days.`,
      );

      // One event is enough; screens just reload.
      emitClinicUpdate({
        type: "appointment_status_changed",
      });
    }
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});

    throw error;
  } finally {
    client.release();
  }
}

/*
 * Page loads need missed appointments to be up to date,
 * but with many screens open they all load at once. They
 * share one sweep: a sweep already running is joined, and
 * one that finished in the last few seconds is reused.
 */
const SWEEP_REUSE_MS = 5_000;

let lastSweep: {
  startedAt: number;
  promise: Promise<unknown>;
} | null = null;

function sweepExpiredAppointments() {
  if (
    lastSweep &&
    Date.now() - lastSweep.startedAt < SWEEP_REUSE_MS
  ) {
    return lastSweep.promise;
  }

  const promise = markExpiredAppointmentsAsMissed();

  lastSweep = { startedAt: Date.now(), promise };

  promise.catch(() => {
    lastSweep = null;
  });

  return promise;
}

export async function processExpiredAppointments() {
  try {
    return await sweepExpiredAppointments();
  } catch (error) {
    console.error(
      "Error processing expired appointments:",
      error,
    );

    return [];
  }
}

router.get("/today", requireStaffAuth, async (_request, response) => {
  try {
    await sweepExpiredAppointments();
    const result = await pool.query(`
      SELECT
        a.appointment_id,
        a.appointment_date,
        a.start_time,
        a.duration_minutes,
        a.status,
        a.reason_for_visit,

        a.arrived_at,

        a.visit_type,
        a.walk_in_capacity_override,
        a.booking_channel,
        a.forms_status,

        CASE
          WHEN a.forms_status = 'completed'
            THEN 'ready'
          ELSE 'pending'
        END AS readiness_status,

        p.patient_id,
        p.first_name AS patient_first_name,
        p.last_name AS patient_last_name,
        p.phone AS patient_phone,

        d.doctor_id,
        d.first_name AS doctor_first_name,
        d.last_name AS doctor_last_name,

        at.appointment_type_id,
        at.name AS appointment_type,

        ps.current_status AS provider_status,
        ps.status_reason,

        dra.room_name AS provider_room_name,
        a.assigned_room_name,

        CASE
            WHEN a.status IN ('roomed', 'completed')
                THEN a.assigned_room_name
            ELSE dra.room_name
        END AS room_name

      FROM appointments AS a

      JOIN patients AS p
        ON a.patient_id = p.patient_id

      LEFT JOIN doctors AS d
        ON a.doctor_id = d.doctor_id

      JOIN appointment_types AS at
        ON a.appointment_type_id = at.appointment_type_id

      LEFT JOIN provider_status AS ps
        ON ps.doctor_id = a.doctor_id

      LEFT JOIN doctor_room_assignments AS dra
          ON dra.doctor_id = a.doctor_id
        AND dra.assignment_date = a.appointment_date

      WHERE a.appointment_date =
        (
          CURRENT_TIMESTAMP
          AT TIME ZONE 'America/Toronto'
        )::date

        AND a.status IN (
          'scheduled',
          'checked_in',
          'roomed',
          'completed',
          'cancelled',
          'missed'
        )

      ORDER BY a.start_time ASC;
    `);

    response.status(200).json(result.rows);
  } catch (error) {
    console.error("Error getting today's appointments:", error);

    response.status(500).json({
      message: "Unable to get today's appointments",
    });
  }
});

/*
GET /api/appointments/check-in

Returns today's appointments that are still scheduled.
These are the patients staff can check in.
*/
router.get("/check-in", requireStaffAuth, async (_request, response) => {
  try {
    await sweepExpiredAppointments();
    const result = await pool.query(`
      SELECT
        a.appointment_id,
        a.appointment_date,
        a.start_time,
        a.duration_minutes,
        a.status,
        a.reason_for_visit,

        p.patient_id,
        p.first_name AS patient_first_name,
        p.last_name AS patient_last_name,
        p.phone AS patient_phone,

        d.doctor_id,
        d.first_name AS doctor_first_name,
        d.last_name AS doctor_last_name,

        at.appointment_type_id,
        at.name AS appointment_type

      FROM appointments AS a

      JOIN patients AS p
        ON a.patient_id = p.patient_id

      LEFT JOIN doctors AS d
        ON a.doctor_id = d.doctor_id

      JOIN appointment_types AS at
        ON a.appointment_type_id = at.appointment_type_id

      WHERE a.appointment_date = (CURRENT_TIMESTAMP AT TIME ZONE 'America/Toronto')::date
        AND a.status = 'scheduled'

      ORDER BY a.start_time ASC;
    `);

    return response.status(200).json(result.rows);
  } catch (error) {
    console.error("Error getting check-in appointments:", error);

    return response.status(500).json({
      message: "Unable to get appointments available for check-in.",
    });
  }
});

/*
GET /api/appointments/queue/current

Returns checked-in patients who are waiting to be roomed.
*/
router.get("/queue/current", requireStaffAuth, async (_request, response) => {
  try {
    const result = await pool.query(`
      SELECT
        a.appointment_id,
        a.appointment_date,
        a.start_time,
        a.duration_minutes,
        a.status,
        a.reason_for_visit,
        a.checked_in_at,

        p.patient_id,
        p.first_name AS patient_first_name,
        p.last_name AS patient_last_name,
        p.phone AS patient_phone,

        d.doctor_id,
        d.first_name AS doctor_first_name,
        d.last_name AS doctor_last_name,

        at.appointment_type_id,
        at.name AS appointment_type,

        FLOOR(
          EXTRACT(
            EPOCH FROM (
              CURRENT_TIMESTAMP - a.checked_in_at
            )
          ) / 60
        ) AS waiting_minutes

      FROM appointments AS a

      JOIN patients AS p
        ON a.patient_id = p.patient_id

      LEFT JOIN doctors AS d
        ON a.doctor_id = d.doctor_id

      JOIN appointment_types AS at
        ON a.appointment_type_id = at.appointment_type_id

      WHERE a.appointment_date = (CURRENT_TIMESTAMP AT TIME ZONE 'America/Toronto')::date
        AND a.status = 'checked_in'

      ORDER BY
        a.checked_in_at ASC,
        a.start_time ASC;
    `);

    return response.status(200).json(result.rows);
  } catch (error) {
    console.error("Error getting current queue:", error);

    return response.status(500).json({
      message: "Unable to get the current queue.",
    });
  }
});

/*
GET /api/appointments/flow/today

Returns today's active patient flow:
- scheduled
- checked_in
- roomed
*/
router.get("/flow/today", requireStaffAuth, async (_request, response) => {
  try {
    await sweepExpiredAppointments();
    const result =
  await pool.query(`
    SELECT
      a.appointment_id,
      a.appointment_date,
      a.start_time,
      a.duration_minutes,

      a.status,
      a.reason_for_visit,

      a.arrived_at,
      a.checked_in_at,
      a.roomed_at,
      a.completed_at,

      a.visit_type,
      a.walk_in_capacity_override,
      a.assignment_mode,
      a.booking_channel,
      a.forms_status,

      CASE
        WHEN
          a.forms_status =
            'completed'
        THEN 'ready'

        ELSE 'pending'
      END AS readiness_status,

      p.patient_id,

      p.first_name
        AS patient_first_name,

      p.last_name
        AS patient_last_name,

      p.phone
        AS patient_phone,

      d.doctor_id,

      d.first_name
        AS doctor_first_name,

      d.last_name
        AS doctor_last_name,

      at.appointment_type_id,

      at.name
        AS appointment_type,

      ps.current_status
        AS provider_status,

      ps.status_reason
        AS provider_status_reason,

      dra.room_name
        AS provider_room_name,

      a.assigned_room_name,

      CASE
        WHEN a.status IN (
          'roomed',
          'completed'
        )
        THEN
          a.assigned_room_name

        ELSE
          dra.room_name
      END AS room_name,

      CASE
        WHEN
          a.status =
            'checked_in'

          AND
          a.checked_in_at
            IS NOT NULL

        THEN FLOOR(
          EXTRACT(
            EPOCH FROM (
              CURRENT_TIMESTAMP -
              a.checked_in_at
            )
          ) / 60
        )

        ELSE 0
      END AS waiting_minutes

    FROM appointments AS a

    JOIN patients AS p
      ON p.patient_id =
         a.patient_id

    LEFT JOIN doctors AS d
      ON d.doctor_id =
        a.doctor_id

    JOIN appointment_types AS at
      ON at.appointment_type_id =
         a.appointment_type_id

    LEFT JOIN provider_status AS ps
      ON ps.doctor_id =
         a.doctor_id

    LEFT JOIN
      doctor_room_assignments
        AS dra

      ON dra.doctor_id =
         a.doctor_id

      AND
        dra.assignment_date =
        a.appointment_date

    WHERE
      a.appointment_date =
        (CURRENT_TIMESTAMP AT TIME ZONE 'America/Toronto')::date

      AND a.status IN (
        'scheduled',
        'checked_in',
        'roomed'
      )

    ORDER BY

      CASE a.status
        WHEN 'checked_in'
          THEN 1

        WHEN 'scheduled'
          THEN 2

        WHEN 'roomed'
          THEN 3

        ELSE 4
      END,

      a.checked_in_at
        ASC NULLS LAST,

      a.start_time ASC;
  `);
    return response.status(200).json(result.rows);
  } catch (error) {
    console.error(
      "Error getting today's patient flow:",
      error,
    );

    return response.status(500).json({
      message: "Unable to get today's patient flow.",
    });
  }
});

/*
GET /api/appointments/queue/summary

Returns today's queue statistics.

- waiting_now:
  Patients currently checked in and still waiting.

- average_wait_minutes:
  Average completed wait for patients already moved into a room today.

- longest_current_wait_minutes:
  Longest wait among patients still checked in.

- patients_roomed_today:
  Number of patients included in today's completed wait average.
*/
router.get("/queue/summary", requireStaffAuth, async (_request, response) => {
  try {
    const result = await pool.query(`
      SELECT
        COUNT(*) FILTER (
          WHERE status = 'checked_in'
        )::integer AS waiting_now,

        COALESCE(
          ROUND(
            AVG(
              EXTRACT(
                EPOCH FROM (
                  roomed_at - checked_in_at
                )
              ) / 60
            ) FILTER (
              WHERE status IN ('roomed', 'completed')
                AND checked_in_at IS NOT NULL
                AND roomed_at IS NOT NULL
            )
          ),
          0
        )::integer AS average_wait_minutes,

        COALESCE(
            FLOOR(
                MAX(
                EXTRACT(
                    EPOCH FROM (
                    roomed_at - checked_in_at
                    )
                ) / 60
                ) FILTER (
                WHERE checked_in_at IS NOT NULL
                    AND roomed_at IS NOT NULL
                )
            ),
            0
            )::integer AS longest_wait_minutes,

        COUNT(*) FILTER (
          WHERE status IN ('roomed', 'completed')
            AND checked_in_at IS NOT NULL
            AND roomed_at IS NOT NULL
        )::integer AS patients_roomed_today

      FROM appointments

      WHERE appointment_date = (CURRENT_TIMESTAMP AT TIME ZONE 'America/Toronto')::date;
    `);

    return response.status(200).json(result.rows[0]);
  } catch (error) {
    console.error("Error getting queue summary:", error);

    return response.status(500).json({
      message: "Unable to get queue statistics.",
    });
  }
});

/*
=========================================================
POST /api/appointments/walk-in

Creates a walk-in encounter.

Walk-ins:
- are already physically at the clinic
- do not have a scheduled start time
- enter the queue immediately
=========================================================
*/

router.post(
  "/walk-in",
  requireStaffAuth,
  requireRole("admin", "receptionist"),
  async (request, response) => {
    const {
      patient_id,
      doctor_id,
      assignment_mode,
      appointment_type_id,
      reason_for_visit,
      notes,
    } = request.body as CreateWalkInBody;

    const normalizedAssignmentMode:
      | "auto"
      | "manual" =
      assignment_mode === "manual"
        ? "manual"
        : "auto";

    /*
 * Validate the patient and appointment type.
 *
 * Auto-assigned walk-ins do not need a doctor yet.
 * Manual assignments must include a doctor.
 */
    if (
      !Number.isInteger(Number(patient_id)) ||
      Number(patient_id) <= 0 ||
      !Number.isInteger(
        Number(appointment_type_id),
      ) ||
      Number(appointment_type_id) <= 0
    ) {
      return response.status(400).json({
        message:
          "Patient and appointment type are required.",
      });
    }

    /*
    * A physician is only required when staff
    * manually assigns the walk-in.
    */
    if (
      normalizedAssignmentMode === "manual" &&
      (
        !Number.isInteger(Number(doctor_id)) ||
        Number(doctor_id) <= 0
      )
    ) {
      return response.status(400).json({
        message:
          "A physician is required for manual assignment.",
      });
    }

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      /*
       * One walk-in admission at a time: two front-desk
       * staff cannot both take the last walk-in spot. The
       * lock is held until this transaction ends.
       */
      await client.query(
        "SELECT pg_advisory_xact_lock($1)",
        [WALK_IN_ADMISSION_LOCK],
      );

      /*
       * Walk-in capacity (checked again here, not only in
       * the Add Walk-In preview, so a stale screen cannot
       * slip one through):
       * - fits: added
       * - full / not_started: fits in a LATER walk-in
       *   block today; added (seen in those hours)
       * - runs_over: expected to run past the end of walk-in
       *   hours; needs the staff override and is flagged
       *   as a possibly shorter visit
       * - closed: no walk-in time left today; refused, even
       *   with the override (offer a booking instead)
       */
      let capacityOverride = false;

      try {
        const admission = await evaluateWalkInAdmission({
          appointmentTypeId: Number(appointment_type_id),
          assignmentMode: normalizedAssignmentMode,
          doctorId:
            normalizedAssignmentMode === "manual"
              ? Number(doctor_id)
              : null,
        });

        if (admission?.status === "closed") {
          await client.query("ROLLBACK");

          return response.status(409).json({
            code: "WALK_IN_CLOSED",
            message:
              "No walk-in time is left today. Offer the patient a booked appointment instead.",
            admission,
          });
        }

        if (admission?.status === "runs_over") {
          if (request.body?.capacity_override !== true) {
            await client.query("ROLLBACK");

            return response.status(409).json({
              code: "WALK_IN_OVER_CAPACITY",
              message:
                "This visit is expected to run past the end of walk-in hours.",
              admission,
            });
          }

          capacityOverride = true;
        }
      } catch (error) {
        // A failed capacity check must not block the
        // front desk; the walk-in is added normally.
        console.error(
          "Walk-in capacity check failed:",
          error,
        );
      }

      /*
       * Load the patient.
       *
       * We also check whether their initial forms
       * are already on file so the walk-in gets
       * the correct forms status immediately.
       */
      const patientResult =
        await client.query<{
          patient_id: number;
          status: string;
          initial_forms_completed_at:
            | string
            | null;
        }>(
          `
            SELECT
              patient_id,
              status,
              initial_forms_completed_at

            FROM patients

            WHERE patient_id = $1

            LIMIT 1

            -- Lock the patient so a double-click cannot
            -- create two walk-ins at the same moment.
            FOR UPDATE;
          `,
          [patient_id],
        );

      if (patientResult.rows.length === 0) {
        await client.query("ROLLBACK");

        return response.status(404).json({
          message: "Patient not found.",
        });
      }

      const patient = patientResult.rows[0];

      /*
       * Inactive patients should not be added
       * to the live clinic queue.
       */
      if (patient.status !== "active") {
        await client.query("ROLLBACK");

        return response.status(409).json({
          message:
            "Inactive patients cannot be added to the queue.",
        });
      }

      /*
       * A patient can only have one open visit in the
       * clinic at a time: an unchecked walk-in, or anyone
       * already waiting or in a room today.
       */
      const openVisitResult =
        await client.query(
          `
            SELECT appointment_id
            FROM appointments
            WHERE patient_id = $1
              AND appointment_date = (
                CURRENT_TIMESTAMP
                AT TIME ZONE 'America/Toronto'
              )::date
              AND (
                status IN ('checked_in', 'roomed')
                OR (
                  status = 'scheduled'
                  AND visit_type = 'walk_in'
                )
              )
            LIMIT 1;
          `,
          [patient_id],
        );

      if (openVisitResult.rows.length > 0) {
        await client.query("ROLLBACK");

        return response.status(409).json({
          message:
            "This patient already has an open visit today.",
        });
      }

      /*
 * Validate the treating physician AND confirm
 * that they are currently inside an active
 * dedicated walk-in schedule block.
 *
 * This is checked again here even though the
 * Add Walk-In modal only displays eligible
 * physicians. The schedule could change between
 * loading the modal and submitting the patient.
 */
if (normalizedAssignmentMode === "manual") {
  const doctorResult =
  await client.query<{
    doctor_id: number;
  }>(
    `
      SELECT DISTINCT
        d.doctor_id

      FROM doctors AS d

      INNER JOIN LATERAL effective_schedule_blocks((( CURRENT_TIMESTAMP AT TIME ZONE 'America/Toronto' ))::date) AS dsb
        ON dsb.doctor_id = d.doctor_id

        AND dsb.is_active = TRUE
        AND dsb.block_type = 'walk_in'

        -- Today's recurring schedule.
        

        -- Current time must be inside the
        -- dedicated walk-in period.
        AND (
          CURRENT_TIMESTAMP
          AT TIME ZONE 'America/Toronto'
        )::time >= dsb.start_time

        AND (
          CURRENT_TIMESTAMP
          AT TIME ZONE 'America/Toronto'
        )::time < dsb.end_time

      WHERE d.doctor_id = $1
        AND d.is_active = TRUE

      LIMIT 1;
    `,
    [doctor_id],
  );

if (doctorResult.rows.length === 0) {
  await client.query("ROLLBACK");

  return response.status(409).json({
    message:
      "This physician is not currently accepting walk-ins.",
  });
}
}

      /*
       * Get the appointment type from the database.
       *
       * The browser does NOT decide the expected
       * duration. We use the clinic's configured
       * default duration for this visit type.
       */
      const appointmentTypeResult =
        await client.query<{
          appointment_type_id: number;
          default_duration_minutes: number;
        }>(
          `
            SELECT
              appointment_type_id,
              default_duration_minutes

            FROM appointment_types

            WHERE appointment_type_id = $1
              AND is_active = TRUE

            LIMIT 1;
          `,
          [appointment_type_id],
        );

      if (
        appointmentTypeResult.rows.length === 0
      ) {
        await client.query("ROLLBACK");

        return response.status(404).json({
          message:
            "Active appointment type not found.",
        });
      }

      const appointmentType =
        appointmentTypeResult.rows[0];

      /*
       * If the patient's initial forms have
       * already been completed, the walk-in is
       * immediately marked forms-complete.
       */
      const formsStatus:
        | "pending"
        | "completed" =
        patient.initial_forms_completed_at
          ? "completed"
          : "pending";

      /*
       * Create the walk-in encounter.
       *
       * Important:
       * start_time = NULL because this patient
       * does not have a scheduled appointment.
       *
       * arrived_at is set now because the patient is
       * physically present. checked_in_at stays NULL:
       * the front desk checks the walk-in in as a
       * separate step once their forms are done.
       */
      const appointmentResult =
        await client.query(
          `
            INSERT INTO appointments (
              patient_id,
              doctor_id,
              assignment_mode,
              appointment_type_id,

              appointment_date,
              start_time,
              duration_minutes,

              status,
              reason_for_visit,
              notes,

              arrived_at,
              checked_in_at,

              slot_id,
              visit_type,
              booking_channel,
              forms_status,
              walk_in_capacity_override
            )

            VALUES (
              $1,
              $2,
              $3,
              $4,

              (
                CURRENT_TIMESTAMP
                AT TIME ZONE 'America/Toronto'
              )::date,

              NULL,

              $5,

              'scheduled',

              $6,
              $7,

              CURRENT_TIMESTAMP,
              NULL,

              NULL,
              'walk_in',
              'front_desk',
              $8,
              $9
            )

            RETURNING *;
          `,
          [
            patient_id,

            normalizedAssignmentMode === "auto"
              ? null
              : Number(doctor_id),

            normalizedAssignmentMode,

            appointment_type_id,

            appointmentType
              .default_duration_minutes,

            reason_for_visit?.trim() || null,
            notes?.trim() || null,

            formsStatus,

            capacityOverride,
          ],
        );

      const createdWalkIn =
        appointmentResult.rows[0];

      await client.query("COMMIT");

      /*
       * Notify ClinicFlow clients so Live Queue,
       * dashboards, doctor queues, etc. can reload.
       */
      emitClinicUpdate({
          type: "appointment_created",

          appointmentId:
            createdWalkIn.appointment_id,

          doctorId:
            createdWalkIn.doctor_id,

          status: "scheduled",

          visitType: "walk_in",
        },
      );

      return response
        .status(201)
        .json(createdWalkIn);
    } catch (error) {
      await client.query("ROLLBACK");

      console.error(
        "Error creating walk-in:",
        error,
      );

      return response.status(500).json({
        message:
          "Unable to add walk-in to the queue.",
      });
    } finally {
      client.release();
    }
  },
);

/*
 * =========================================================
 * POST /api/appointments/holds
 *
 * Temporarily reserves a scheduled appointment time
 * while the patient finishes the booking flow.
 *
 * Holds expire automatically after 5 minutes.
 * =========================================================
 */
router.post("/holds", requireAnyAuth, scopeHoldToCaller, async (request, response) => {
  const {
    patient_id,
    doctor_id,
    appointment_reason_id,
    appointment_date,
    start_time,
  } = request.body as CreateAppointmentHoldBody;

  /*
   * Rescheduling: the visit being moved (the patient's own)
   * doesn't block the new time, so a visit can move a bit
   * later with the same doctor.
   */
  const rescheduleFromId = Number(
    (request.body as { reschedule_from_appointment_id?: unknown })
      ?.reschedule_from_appointment_id,
  );
  const excludeAppointmentId =
    Number.isInteger(rescheduleFromId) && rescheduleFromId > 0 && patient_id != null
      ? rescheduleFromId
      : null;

  /*
   * Basic request validation.
   */
  if (
  !Number.isInteger(Number(doctor_id)) ||
  Number(doctor_id) <= 0 ||
  !Number.isInteger(
    Number(appointment_reason_id),
  ) ||
  Number(appointment_reason_id) <= 0 ||
  !appointment_date ||
  !start_time
) {
  return response.status(400).json({
    message:
      "Doctor, appointment reason, date, and time are required.",
  });
}

  /*
   * patient_id is optional because a hold may be
   * created before the patient step is completed.
   */
  if (
    patient_id != null &&
    (
      !Number.isInteger(Number(patient_id)) ||
      Number(patient_id) <= 0
    )
  ) {
    return response.status(400).json({
      message: "Invalid patient ID.",
    });
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    /*
     * Patient portal: at most MAX_ACTIVE_HOLDS_PER_PATIENT
     * active holds. A per-patient lock (taken before the
     * doctor/date lock, never after) makes the count and
     * the insert atomic, so parallel requests cannot all
     * pass the check.
     */
    if ((request as AuthenticatedRequest).patientAuth) {
      const callerPatientId = Number(patient_id);

      await client.query(
        "SELECT pg_advisory_xact_lock(-1, $1::integer)",
        [callerPatientId],
      );

      const activeHolds = await client.query<{
        count: number;
      }>(
        `
          SELECT COUNT(*)::integer AS count
          FROM appointment_holds
          WHERE patient_id = $1
            AND status = 'active'
            AND expires_at > clock_timestamp()
        `,
        [callerPatientId],
      );

      if (
        activeHolds.rows[0].count >=
        MAX_ACTIVE_HOLDS_PER_PATIENT
      ) {
        await client.query("ROLLBACK");

        return response.status(429).json({
          message:
            "You already have appointment times on hold. Finish or cancel that booking first.",
        });
      }
    }

    /*
     * Use the SAME doctor/date lock as appointment
     * creation.
     *
     * Therefore two people trying to hold the same
     * physician/date cannot both pass validation
     * simultaneously.
     */
    await client.query(
      `
        SELECT pg_advisory_xact_lock(
          $1::integer,
          (
            $2::date - DATE '2000-01-01'
          )::integer
        );
      `,
      [
        doctor_id,
        appointment_date,
      ],
    );

    /*
     * Make sure the requested appointment is still
     * in the future.
     */
    const futureResult =
      await client.query<{
        appointment_is_future: boolean;
      }>(
        `
          SELECT
            (
              $1::date + $2::time
            ) > (
              CURRENT_TIMESTAMP
              AT TIME ZONE 'America/Toronto'
            ) AS appointment_is_future;
        `,
        [
          appointment_date,
          start_time,
        ],
      );

    if (
      !futureResult.rows[0]
        .appointment_is_future
    ) {
      await client.query("ROLLBACK");

      return response.status(400).json({
        message:
          "Appointments cannot be held for a time that has already passed.",
      });
    }

        /*
    * Load the selected appointment reason.
    *
    * The appointment reason determines:
    * - the internal appointment category/type
    * - the duration used by the schedule
    *
    * The browser only sends the reason ID.
    */
    const appointmentReasonResult =
      await client.query<{
        appointment_reason_id: number;
        appointment_type_id: number;
        reason_name: string;
        duration_minutes: number;
        category_name: string;
      }>(
        `
          SELECT
            ar.appointment_reason_id,
            ar.appointment_type_id,
            ar.name AS reason_name,
            ar.duration_minutes,
            at.name AS category_name

          FROM appointment_reasons AS ar

          INNER JOIN appointment_types AS at
            ON at.appointment_type_id =
              ar.appointment_type_id

          WHERE ar.appointment_reason_id = $1
            AND ar.is_active = TRUE
            AND at.is_active = TRUE

          LIMIT 1;
        `,
        [appointment_reason_id],
      );

    if (
      appointmentReasonResult.rows.length === 0
    ) {
      await client.query("ROLLBACK");

      return response.status(404).json({
        message:
          "Active appointment reason not found.",
      });
    }

    const appointmentReason =
      appointmentReasonResult.rows[0];

    /*
    * Category and duration are derived
    * from the selected reason.
    */
    const appointmentTypeId =
      appointmentReason.appointment_type_id;

    const appointmentDuration =
      appointmentReason.duration_minutes;

    /*
     * Find the weekday.
     * PostgreSQL: Sunday = 0 ... Saturday = 6.
     */
    const dayResult =
      await client.query<{
        day_of_week: number;
      }>(
        `
          SELECT
            EXTRACT(
              DOW FROM $1::date
            )::INTEGER AS day_of_week;
        `,
        [appointment_date],
      );

    const dayOfWeek =
      dayResult.rows[0].day_of_week;

    /*
     * Load booking rules for this doctor/day.
     */
    const settingsResult =
      await client.query<{
        scheduled_patient_capacity: number;
        booking_interval_minutes: number;
        max_long_visits_per_day: number | null;
      }>(
        `
          SELECT
            scheduled_patient_capacity,
            booking_interval_minutes,
            max_long_visits_per_day

          FROM doctor_schedule_settings

          WHERE doctor_id = $1
            AND day_of_week = $2
            AND is_active = TRUE

          LIMIT 1;
        `,
        [
          doctor_id,
          dayOfWeek,
        ],
      );

    if (settingsResult.rows.length === 0) {
      await client.query("ROLLBACK");

      return response.status(409).json({
        message:
          "This physician does not have an active booking schedule for this day.",
      });
    }

    const settings =
      settingsResult.rows[0];

    /*
     * Appointment must fit completely inside a
     * published scheduled block.
     */
    const blockResult =
      await client.query(
        `
          SELECT
            schedule_block_id

          FROM effective_schedule_blocks($5::date)

          WHERE doctor_id = $1
            AND day_of_week = $2
            AND is_active = TRUE
            AND block_type = 'scheduled'

            AND $3::time >= start_time

            AND (
              $3::time
              + make_interval(
                  mins => $4::integer
                )
            ) <= end_time

          LIMIT 1;
        `,
        [
          doctor_id,
          dayOfWeek,
          start_time,
          appointmentDuration,
          appointment_date,
        ],
      );

    if (blockResult.rows.length === 0) {
      await client.query("ROLLBACK");

      return response.status(409).json({
        message:
          "This appointment time is outside the physician's available scheduled booking periods.",
      });
    }

    /*
     * Enforce the configured booking interval.
     */
    const gridResult =
      await client.query<{
        is_on_booking_grid: boolean;
      }>(
        `
          SELECT (
            (
              EXTRACT(
                HOUR FROM $1::time
              )::INTEGER * 60
              +
              EXTRACT(
                MINUTE FROM $1::time
              )::INTEGER
            )
            %
            $2::integer
          ) = 0 AS is_on_booking_grid;
        `,
        [
          start_time,
          settings.booking_interval_minutes,
        ],
      );

    if (
      !gridResult.rows[0]
        .is_on_booking_grid
    ) {
      await client.query("ROLLBACK");

      return response.status(409).json({
        message:
          "This appointment time is not on the physician's booking interval.",
      });
    }

    /*
     * Check real appointments first.
     */
    const appointmentOverlapResult =
      await client.query(
        `
          SELECT
            appointment_id

          FROM appointments

          WHERE doctor_id = $1
            AND appointment_date = $2::date
            AND visit_type = 'scheduled'

            AND status NOT IN (
              'cancelled',
              'missed'
            )

            AND start_time IS NOT NULL

            AND $3::time <
              (
                start_time
                + make_interval(
                    mins => duration_minutes
                  )
              )

            AND (
              $3::time
              + make_interval(
                  mins => $4::integer
                )
            ) > start_time

            AND NOT COALESCE(
              appointment_id = $5::integer
              AND patient_id = $6::integer,
              FALSE
            )

          LIMIT 1;
        `,
        [
          doctor_id,
          appointment_date,
          start_time,
          appointmentDuration,
          excludeAppointmentId,
          patient_id ?? null,
        ],
      );

    if (
      appointmentOverlapResult.rows.length > 0
    ) {
      await client.query("ROLLBACK");

      return response.status(409).json({
        message:
          "This appointment time is no longer available.",
      });
    }

    /*
     * Check other ACTIVE and UNEXPIRED holds.
     *
     * Expired holds don't block anything even if
     * their database status has not yet been changed
     * to "expired".
     */
    const holdOverlapResult =
      await client.query(
        `
          SELECT
            hold_id

          FROM appointment_holds

          WHERE doctor_id = $1
            AND appointment_date = $2::date
            AND status = 'active'
            AND expires_at > CURRENT_TIMESTAMP

            AND $3::time <
              (
                start_time
                + make_interval(
                    mins => duration_minutes
                  )
              )

            AND (
              $3::time
              + make_interval(
                  mins => $4::integer
                )
            ) > start_time

          LIMIT 1;
        `,
        [
          doctor_id,
          appointment_date,
          start_time,
          appointmentDuration,
        ],
      );

    if (
      holdOverlapResult.rows.length > 0
    ) {
      await client.query("ROLLBACK");

      return response.status(409).json({
        message:
          "This appointment time is temporarily unavailable.",
      });
    }

    /*
     * Daily capacity.
     *
     * We count both confirmed appointments AND
     * active holds. Otherwise nine confirmed visits
     * plus several pending holds could exceed the
     * doctor's configured ceiling.
     */
    const capacityResult =
      await client.query<{
        booked_patients: number;
        held_patients: number;
      }>(
        `
          SELECT

            (
              SELECT COUNT(*)::INTEGER

              FROM appointments

              WHERE doctor_id = $1
                AND appointment_date = $2::date
                AND visit_type = 'scheduled'
                AND status NOT IN (
                  'cancelled',
                  'missed'
                )
                AND NOT COALESCE(
              appointment_id = $3::integer
              AND patient_id = $4::integer,
              FALSE
            )
            ) AS booked_patients,

            (
              SELECT COUNT(*)::INTEGER

              FROM appointment_holds

              WHERE doctor_id = $1
                AND appointment_date = $2::date
                AND status = 'active'
                AND expires_at >
                    CURRENT_TIMESTAMP
            ) AS held_patients;
        `,
        [
          doctor_id,
          appointment_date,
          excludeAppointmentId,
          patient_id ?? null,
        ],
      );

    const bookedPatients =
      capacityResult.rows[0]
        .booked_patients;

    const heldPatients =
      capacityResult.rows[0]
        .held_patients;

    if (
      bookedPatients + heldPatients >=
      settings.scheduled_patient_capacity
    ) {
      await client.query("ROLLBACK");

      return response.status(409).json({
        message:
          "This physician has reached the scheduled appointment capacity for this day.",
      });
    }

    /*
     * Long visits (45+ min): at most max_long_visits_per_day,
     * counting bookings and other people's active holds (the
     * visit being rescheduled doesn't count).
     */
    if (
      isLongVisit(appointmentDuration) &&
      settings.max_long_visits_per_day !== null
    ) {
      const longResult = await client.query<{ taken: number }>(
        `
          SELECT
            (
              SELECT COUNT(*)::integer FROM appointments
              WHERE doctor_id = $1
                AND appointment_date = $2::date
                AND visit_type = 'scheduled'
                AND status NOT IN ('cancelled', 'missed')
                AND duration_minutes >= $3
                AND NOT COALESCE(
                  appointment_id = $4::integer
                  AND patient_id = $5::integer,
                  FALSE
                )
            )
            +
            (
              SELECT COUNT(*)::integer FROM appointment_holds
              WHERE doctor_id = $1
                AND appointment_date = $2::date
                AND status = 'active'
                AND expires_at > clock_timestamp()
                AND duration_minutes >= $3
            ) AS taken
        `,
        [
          doctor_id,
          appointment_date,
          LONG_VISIT_MINUTES,
          excludeAppointmentId,
          patient_id ?? null,
        ],
      );

      if (longResult.rows[0].taken >= settings.max_long_visits_per_day) {
        await client.query("ROLLBACK");

        return response.status(409).json({
          code: "LONG_VISIT_LIMIT",
          message:
            "No long-visit spots are left with this physician on this day. Please choose another day.",
        });
      }
    }

    /*
     * Create the five-minute hold.
     *
     * hold_token is generated by PostgreSQL using
     * gen_random_uuid().
     */
    const holdResult =
  await client.query(
    `
      INSERT INTO appointment_holds (
        patient_id,
        doctor_id,
        appointment_type_id,
        appointment_reason_id,
        appointment_date,
        start_time,
        duration_minutes,
        expires_at
      )

      VALUES (
        $1,
        $2,
        $3,
        $4,
        $5,
        $6,
        $7,
        CURRENT_TIMESTAMP
          + INTERVAL '5 minutes'
      )

      RETURNING
        hold_id,
        hold_token,
        patient_id,
        doctor_id,
        appointment_type_id,
        appointment_reason_id,
        appointment_date,
        start_time,
        duration_minutes,
        status,
        created_at,
        expires_at;
    `,
    [
      patient_id ?? null,
      doctor_id,

      // Derived from appointment_reasons.
      appointmentTypeId,

      // Selected structured visit reason.
      appointment_reason_id,

      appointment_date,
      start_time,

      // Also derived from appointment_reasons.
      appointmentDuration,
    ],
  );

    const createdHold =
      holdResult.rows[0];

    await client.query("COMMIT");

    /*
    * Schedule the real-time expiration notification.
    *
    * If the hold is converted or released before the
    * timer fires, the helper simply does nothing.
    */
    scheduleAppointmentHoldExpiration(
      createdHold.hold_id,
      createdHold.doctor_id,
      appointment_date,
      createdHold.expires_at,
    );

    /*
    * Notify every connected booking screen immediately
    * that this time has just been reserved.
    */
    emitClinicUpdate({
        type:
          "appointment_availability_changed",

        doctorId:
          doctor_id,

        appointmentDate:
          appointment_date,
      },
    );

    return response
      .status(201)
      .json(createdHold);
  } catch (error) {
    await client.query("ROLLBACK");

    console.error(
      "Error creating appointment hold:",
      error,
    );

    return response.status(500).json({
      message:
        "Unable to temporarily hold appointment time.",
    });
  } finally {
    client.release();
  }
});

/*
 * =========================================================
 * POST /api/appointments/holds/:holdToken/release
 *
 * Releases a temporary appointment hold before it expires.
 *
 * Used when the patient:
 * - changes appointment time
 * - goes back in the booking flow
 * - cancels the booking process
 *
 * Expiration remains the fallback if the browser closes.
 * =========================================================
 */
router.post(
  "/holds/:holdToken/release",
  requireAnyAuth, requireValidHoldToken,
  async (request, response) => {
    const { holdToken } = request.params;

    if (!holdToken) {
      return response.status(400).json({
        message: "Hold token is required.",
      });
    }

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      /*
       * Lock the hold while we inspect/update it.
       */
      const holdResult =
        await client.query<{
          hold_id: number;
          doctor_id: number;
          appointment_date: string;
          status: string;
        }>(
          `
            SELECT
              hold_id,
              doctor_id,
              appointment_date::text
                AS appointment_date,
              status

            FROM appointment_holds

            WHERE hold_token = $1

            FOR UPDATE;
          `,
          [holdToken],
        );

      if (holdResult.rows.length === 0) {
        await client.query("ROLLBACK");

        return response.status(404).json({
          message:
            "Appointment hold not found.",
        });
      }

      const hold = holdResult.rows[0];

      /*
       * Only an active hold needs to be released.
       *
       * Converted holds represent completed bookings
       * and must never be released here.
       */
      if (hold.status !== "active") {
        await client.query("ROLLBACK");

        return response.status(409).json({
          message:
            "This appointment hold is no longer active.",
        });
      }

      /*
       * Mark the hold as released.
       */
      await client.query(
        `
          UPDATE appointment_holds

          SET
            status = 'released'

          WHERE hold_id = $1;
        `,
        [hold.hold_id],
      );

      await client.query("COMMIT");

      /*
       * Tell connected clients that availability
       * for this doctor/date has changed.
       */
      emitClinicUpdate({
          type:
            "appointment_availability_changed",

          doctorId:
            hold.doctor_id,

          appointmentDate:
            hold.appointment_date,
        },
      );

      return response.status(200).json({
        message:
          "Appointment hold released.",
        hold_id:
          hold.hold_id,
        status:
          "released",
      });
    } catch (error) {
      await client.query("ROLLBACK");

      console.error(
        "Error releasing appointment hold:",
        error,
      );

      return response.status(500).json({
        message:
          "Unable to release appointment hold.",
      });
    } finally {
      client.release();
    }
  },
);


router.post("/", requireStaffAuth, requireRole("admin", "receptionist"), requireValidHoldToken, async (request, response) => {
  try {
    const {
      patient_id,
      doctor_id,
      appointment_date,
      start_time,
      hold_token,
      reason_for_visit,
      notes,
      slot_id,
      visit_type = "scheduled",
      booking_channel = "front_desk",
      rebooked_from_appointment_id,
    } = request.body as CreateAppointmentBody;

   

    // Make sure all required appointment information was provided.
    if (
      !patient_id ||
      !doctor_id ||
      !appointment_date ||
      !appointment_date ||
      !start_time 
      
    ) {
      return response.status(400).json({
        message:
          "Patient, doctor, appointment type, date, and time are required.",
      });
    }

    
        // Prevent booking a past date or time.
    const appointmentTimeCheck = await pool.query<{
      appointment_is_future: boolean;
    }>(
      `
        SELECT
          (
            $1::date + $2::time
          ) > (
            CURRENT_TIMESTAMP AT TIME ZONE 'America/Toronto'
          ) AS appointment_is_future;
      `,
      [appointment_date, start_time],
    );

    if (!appointmentTimeCheck.rows[0].appointment_is_future) {
      return response.status(400).json({
        message:
          "Appointments cannot be booked for a time that has already passed.",
      });
    }

    /*
 * Never trust arbitrary visit-source values
 * from the browser.
 */
/*
 * This endpoint only creates booked appointments. Walk-ins
 * go through POST /walk-in (admission rules); a body that
 * claims "walk_in" would skip overlap/capacity checks and
 * never be marked missed.
 */
void visit_type;

const normalizedVisitType = "scheduled" as const;

// Staff bookings are made at the front desk or by phone;
// "patient_portal" is reserved for the patient route.
const normalizedBookingChannel:
  | "front_desk"
  | "phone" =
  booking_channel === "phone"
    ? "phone"
    : "front_desk";


/*
 * Forms depend on PATIENT HISTORY,
 * not whether this appointment is
 * a walk-in or booked visit.
 */
const patientResult =
  await pool.query<{
    initial_forms_completed_at:
      string | null;
  }>(
    `
      SELECT
        initial_forms_completed_at
      FROM patients
      WHERE patient_id = $1
      LIMIT 1;
    `,
    [patient_id],
  );


if (
  patientResult.rows.length === 0
) {
  return response.status(404).json({
    message: "Patient not found.",
  });
}


const initialFormsStatus:
  | "pending"
  | "completed" =
  patientResult.rows[0]
    .initial_forms_completed_at
    ? "completed"
    : "pending";


const client =
  await pool.connect();

try {
  await client.query("BEGIN");

  /*
   * =====================================================
   * SERIALIZE BOOKINGS FOR THIS DOCTOR + DATE
   * =====================================================
   *
   * Availability is only a snapshot.
   *
   * Two patients could submit the same time at almost
   * exactly the same moment. This transaction-level
   * advisory lock makes booking requests for the same
   * physician/date wait for one another.
   *
   * PostgreSQL automatically releases this lock when
   * the transaction COMMITs or ROLLBACKs.
   */
  await client.query(
    `
      SELECT pg_advisory_xact_lock(
        $1::integer,
        (
          $2::date - DATE '2000-01-01'
        )::integer
      );
    `,
    [
      doctor_id,
      appointment_date,
    ],
  );

  /*
 * =====================================================
 * VALIDATE TEMPORARY APPOINTMENT HOLD
 * =====================================================
 *
 * If the booking came from the patient booking flow,
 * make sure the supplied hold:
 *
 * - exists
 * - is still active
 * - has not expired
 * - belongs to this exact booking
 *
 * FOR UPDATE locks the hold until this transaction
 * finishes.
 */
let appointmentHold:
  | {
      hold_id: number;
      patient_id: number | null;
      doctor_id: number;
      appointment_type_id: number;
      appointment_reason_id: number;
      appointment_date: string;
      start_time: string;
      duration_minutes: number;
    }
  | null = null;

/*
 * These values will be copied from the
 * validated hold and used later when
 * creating the appointment.
 */
let heldAppointmentTypeId:
  number | null = null;

let heldAppointmentReasonId:
  number | null = null;

let heldAppointmentDuration:
  number | null = null;



if (hold_token) {
  const holdResult =
    await client.query<{
      hold_id: number;
      patient_id: number | null;
      doctor_id: number;
      appointment_type_id: number;
      appointment_reason_id: number;
      appointment_date: string;
      start_time: string;
      duration_minutes: number;
    }>(
      `
        SELECT
          hold_id,
          patient_id,
          doctor_id,
          appointment_type_id,
          appointment_reason_id,

          appointment_date::text
            AS appointment_date,

          start_time::text
            AS start_time,

          duration_minutes

        FROM appointment_holds

        WHERE hold_token = $1
          AND status = 'active'
          AND expires_at >
            CURRENT_TIMESTAMP

        FOR UPDATE;
      `,
      [hold_token],
    );

  /*
   * No active hold means it either does not exist
   * or its five-minute reservation expired.
   */
  if (holdResult.rows.length === 0) {
    await client.query("ROLLBACK");

    return response.status(409).json({
      message:
        "Your temporary appointment hold has expired. Please select a time again.",
    });
  }

  appointmentHold =
    holdResult.rows[0];

  /*
   * The hold token must represent this exact
   * appointment request.
   */
    const holdMatchesBooking =
      Number(
        appointmentHold.doctor_id,
      ) === Number(doctor_id) &&

      appointmentHold.appointment_date ===
        appointment_date &&

      appointmentHold.start_time.slice(
        0,
        5,
      ) === start_time.slice(0, 5) &&

      (
        appointmentHold.patient_id === null ||
        Number(
          appointmentHold.patient_id,
        ) === Number(patient_id)
      );

    if (!holdMatchesBooking) {
      await client.query("ROLLBACK");

      return response.status(409).json({
        message:
          "This appointment hold does not match the requested booking.",
      });
    }

    /*
 * The hold is valid and matches this booking.
 * Copy its server-controlled booking data so
 * we can use it later in this transaction.
 */
heldAppointmentTypeId =
  Number(
    appointmentHold.appointment_type_id,
  );

heldAppointmentReasonId =
  Number(
    appointmentHold.appointment_reason_id,
  );

heldAppointmentDuration =
  Number(
    appointmentHold.duration_minutes,
  );

if (
  !Number.isInteger(
    heldAppointmentTypeId,
  ) ||
  heldAppointmentTypeId <= 0 ||
  !Number.isInteger(
    heldAppointmentReasonId,
  ) ||
  heldAppointmentReasonId <= 0 ||
  !Number.isFinite(
    heldAppointmentDuration,
  ) ||
  heldAppointmentDuration <= 0
) {
  await client.query("ROLLBACK");

  return response.status(500).json({
    message:
      "The appointment hold contains invalid booking information.",
  });
}

}

/*
 * Scheduled bookings now use the booking data
 * captured by the validated temporary hold.
 *
 * Type, reason, and duration are controlled by
 * the backend when the hold is created.
 */
if (
  !appointmentHold ||
  heldAppointmentTypeId === null ||
  heldAppointmentReasonId === null ||
  heldAppointmentDuration === null
) {
  await client.query("ROLLBACK");

  return response.status(409).json({
    message:
      "A valid appointment hold is required to complete this booking.",
  });
}

const appointmentDuration =
  heldAppointmentDuration;

    /*
 * =====================================================
 * VALIDATE SCHEDULED BOOKING AVAILABILITY
 * =====================================================
 *
 * The requested appointment must:
 * 1. Fit completely inside a published "scheduled" block.
 * 2. Not overlap another active scheduled appointment.
 * 3. Stay below the doctor's daily scheduled-patient capacity.
 *
 * Catch-up, lunch, and walk-in periods do not need
 * special cases here because they are NOT "scheduled"
 * blocks.
 */

/*
 * Get the weekday in PostgreSQL format:
 * Sunday = 0 ... Saturday = 6.
 */
const scheduleDayResult =
  await client.query<{
    day_of_week: number;
  }>(
    `
      SELECT
        EXTRACT(
          DOW FROM $1::date
        )::INTEGER AS day_of_week;
    `,
    [appointment_date],
  );

const dayOfWeek =
  scheduleDayResult.rows[0].day_of_week;


/*
 * Load this doctor's booking settings
 * for the requested weekday.
 */
const scheduleSettingsResult =
  await client.query<{
    scheduled_patient_capacity: number;
    booking_interval_minutes: number;
  }>(
    `
      SELECT
        scheduled_patient_capacity,
        booking_interval_minutes

      FROM doctor_schedule_settings

      WHERE doctor_id = $1
        AND day_of_week = $2
        AND is_active = TRUE

      LIMIT 1;
    `,
    [
      doctor_id,
      dayOfWeek,
    ],
  );

if (
  scheduleSettingsResult.rows.length === 0
) {
  await client.query("ROLLBACK");

  return response.status(409).json({
    message:
      "This physician does not have an active booking schedule for this day.",
  });
}

const scheduleSettings =
  scheduleSettingsResult.rows[0];


/*
 * Make sure the requested appointment fits ENTIRELY
 * inside one published scheduled block.
 *
 * Example:
 *
 * scheduled: 09:00-10:30
 * requested: 10:00-10:30 -> allowed
 * requested: 10:15-10:45 -> rejected
 *
 * This automatically protects catch-up, lunch,
 * walk-in, and other blocked periods.
 */
const scheduledBlockResult =
  await client.query(
    `
      SELECT
        schedule_block_id

      FROM effective_schedule_blocks($5::date)

      WHERE doctor_id = $1
        AND day_of_week = $2
        AND is_active = TRUE
        AND block_type = 'scheduled'

        AND $3::time >= start_time

        AND (
          $3::time
          + make_interval(
              mins => $4::integer
            )
        ) <= end_time

      LIMIT 1;
    `,
    [
      doctor_id,
      dayOfWeek,
      start_time,
      appointmentDuration,
      appointment_date,
    ],
  );

if (
  scheduledBlockResult.rows.length === 0
) {
  await client.query("ROLLBACK");

  return response.status(409).json({
    message:
      "This appointment time is outside the physician's available scheduled booking periods.",
  });
}


/*
 * Enforce the doctor's booking grid.
 *
 * Example:
 * booking_interval_minutes = 15
 *
 * 09:00 -> valid
 * 09:15 -> valid
 * 09:30 -> valid
 * 09:10 -> invalid
 */
const bookingGridResult =
  await client.query<{
    is_on_booking_grid: boolean;
  }>(
    `
      SELECT (
        (
          EXTRACT(
            HOUR FROM $1::time
          )::INTEGER * 60
          +
          EXTRACT(
            MINUTE FROM $1::time
          )::INTEGER
        )
        %
        $2::integer
      ) = 0 AS is_on_booking_grid;
    `,
    [
      start_time,
      scheduleSettings.booking_interval_minutes,
    ],
  );

if (
  !bookingGridResult.rows[0]
    .is_on_booking_grid
) {
  await client.query("ROLLBACK");

  return response.status(409).json({
    message:
      "This appointment time is not on the physician's booking interval.",
  });
}


/*
 * Check whether the requested appointment overlaps
 * another active scheduled appointment.
 *
 * Two intervals overlap when:
 *
 * requestedStart < existingEnd
 * AND
 * requestedEnd > existingStart
 *
 * Cancelled and missed appointments no longer
 * consume scheduled capacity.
 */
const overlapResult =
  await client.query(
    `
      SELECT
        appointment_id

      FROM appointments

      WHERE doctor_id = $1
        AND appointment_date = $2::date
        AND visit_type = 'scheduled'

        AND status NOT IN (
          'cancelled',
          'missed'
        )

        AND start_time IS NOT NULL

        AND $3::time <
          (
            start_time
            + make_interval(
                mins => duration_minutes
              )
          )

        AND (
          $3::time
          + make_interval(
              mins => $4::integer
            )
        ) > start_time

      LIMIT 1;
    `,
    [
      doctor_id,
      appointment_date,
      start_time,
      appointmentDuration,
    ],
  );

if (
  overlapResult.rows.length > 0
) {
  await client.query("ROLLBACK");

  return response.status(409).json({
    message:
      "This appointment time is no longer available.",
  });
}

/*
 * Check temporary appointment holds.
 *
 * Ignore this patient's own hold because they
 * are now trying to convert it into a real
 * appointment.
 */
const otherHoldOverlapResult =
  await client.query(
    `
      SELECT
        hold_id

      FROM appointment_holds

      WHERE doctor_id = $1
        AND appointment_date = $2::date
        AND status = 'active'
        AND expires_at > CURRENT_TIMESTAMP

        AND (
          $5::uuid IS NULL
          OR hold_token <> $5::uuid
        )

        AND $3::time <
          (
            start_time
            + make_interval(
                mins => duration_minutes
              )
          )

        AND (
          $3::time
          + make_interval(
              mins => $4::integer
            )
        ) > start_time

      LIMIT 1;
    `,
    [
      doctor_id,
      appointment_date,
      start_time,
      appointmentDuration,
      hold_token ?? null,
    ],
  );

if (
  otherHoldOverlapResult.rows.length > 0
) {
  await client.query("ROLLBACK");

  return response.status(409).json({
    message:
      "This appointment time is temporarily unavailable.",
  });
}


/*
 * Enforce the scheduled-patient ceiling.
 *
 * Walk-ins do NOT count toward this limit.
 */
/*
 * Enforce the scheduled-patient ceiling.
 *
 * Confirmed scheduled appointments count toward
 * capacity.
 *
 * Active holds also temporarily consume capacity,
 * except for this booking's own hold.
 */
const capacityResult =
  await client.query<{
    booked_patients: number;
    held_patients: number;
  }>(
    `
      SELECT

        (
          SELECT COUNT(*)::INTEGER

          FROM appointments

          WHERE doctor_id = $1
            AND appointment_date = $2::date
            AND visit_type = 'scheduled'

            AND status NOT IN (
              'cancelled',
              'missed'
            )
        ) AS booked_patients,

        (
          SELECT COUNT(*)::INTEGER

          FROM appointment_holds

          WHERE doctor_id = $1
            AND appointment_date = $2::date
            AND status = 'active'
            AND expires_at > CURRENT_TIMESTAMP

            AND (
              $3::uuid IS NULL
              OR hold_token <> $3::uuid
            )
        ) AS held_patients;
    `,
    [
      doctor_id,
      appointment_date,
      hold_token ?? null,
    ],
  );

const bookedPatients =
  capacityResult.rows[0]
    .booked_patients;

const heldPatients =
  capacityResult.rows[0]
    .held_patients;

if (
  bookedPatients + heldPatients >=
  scheduleSettings
    .scheduled_patient_capacity
) {
  await client.query("ROLLBACK");

  return response.status(409).json({
    message:
      "This physician has reached the scheduled appointment capacity for this day.",
  });
}

   let rebookingSourceStatus:
    | "missed"
    | "cancelled"
    | null = null;

  /*
   * If this is a rebooking, lock and validate
   * the original missed appointment first.
   */
  if (
    rebooked_from_appointment_id
  ) {
    const oldAppointmentResult =
      await client.query<{
        appointment_id: number;
        patient_id: number;
        status: string;
        follow_up_status:
          | string
          | null;
      }>(
        `
          SELECT
            appointment_id,
            patient_id,
            status,
            follow_up_status

          FROM appointments

          WHERE appointment_id =
            $1

          FOR UPDATE;
        `,
        [
          rebooked_from_appointment_id,
        ],
      );

    if (
      oldAppointmentResult.rows
        .length === 0
    ) {
      await client.query(
        "ROLLBACK",
      );

      return response
        .status(404)
        .json({
          message:
            "The original missed appointment could not be found.",
        });
    }

    const oldAppointment =
      oldAppointmentResult.rows[0];

    rebookingSourceStatus =
      oldAppointment.status === "missed"
        ? "missed"
        : "cancelled";

    if (
      oldAppointment.status !== "missed" &&
      oldAppointment.status !== "cancelled"
    ) {
      await client.query(
        "ROLLBACK",
      );

      return response
        .status(409)
        .json({
          message:
            "Only missed or cancelled appointments can be rebooked through this workflow.",
        });
    }

    if (
      oldAppointment.patient_id !==
      Number(patient_id)
    ) {
      await client.query(
        "ROLLBACK",
      );

      return response
        .status(409)
        .json({
          message:
            "The new appointment must belong to the same patient as the missed appointment.",
        });
    }

    if (
      
        oldAppointment.follow_up_status === "resolved" ||
        oldAppointment.follow_up_status === "rebooked"
      
    ) {
      await client.query(
        "ROLLBACK",
      );

      return response
        .status(409)
        .json({
          message:
            "This missed appointment has already been resolved.",
        });
    }
  }

  /*
   * Create the new appointment.
   */
  const result =
    await client.query(
      `
        INSERT INTO appointments (
          patient_id,
          doctor_id,
          appointment_type_id,
          appointment_reason_id,
          appointment_date,
          start_time,
          duration_minutes,
          status,
          reason_for_visit,
          notes,
          slot_id,
          visit_type,
          booking_channel,
          forms_status,
          rebooked_from_appointment_id
        )

        VALUES (
          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          $7,
          'scheduled',
          $8,
          $9,
          $10,
          $11,
          $12,
          $13,
          $14
        )

        RETURNING *;
      `,
      [
        patient_id,
        doctor_id,

        /*
        * These are trusted values copied
        * from the locked appointment hold.
        */
        heldAppointmentTypeId,
        heldAppointmentReasonId,

        appointment_date,
        start_time,
        appointmentDuration,

        reason_for_visit?.trim() || null,
        notes?.trim() || null,

        slot_id || null,
        normalizedVisitType,
        normalizedBookingChannel,
        initialFormsStatus,

        rebooked_from_appointment_id ||
          null,
      ],
    );

  const createdAppointment =
  result.rows[0];

/*
 * Convert the temporary appointment hold
 * into a completed reservation.
 *
 * This happens inside the same transaction
 * as the appointment creation.
 */
if (appointmentHold) {
  const convertedHoldResult =
    await client.query(
      `
        UPDATE appointment_holds

        SET
          status = 'converted'

        WHERE hold_id = $1
          AND status = 'active'
          AND expires_at > clock_timestamp()

        RETURNING hold_id;
      `,
      [
        appointmentHold.hold_id,
      ],
    );

  if (
    convertedHoldResult.rows.length === 0
  ) {
    await client.query("ROLLBACK");

    return response.status(409).json({
      message:
        "Your appointment hold expired before the booking could be completed. Please select a time again.",
    });
  }
}

/*
 * Successful creation of the new appointment
 * automatically resolves the original missed
 * appointment as REBOOKED.
 */
if (
  rebooked_from_appointment_id
) {
  await client.query(
    `
      UPDATE appointments

      SET
        follow_up_status =
          'rebooked',

        follow_up_reason =
          NULL,

        follow_up_notes =
          NULL,

        followed_up_at =
          CURRENT_TIMESTAMP,

        updated_at =
          CURRENT_TIMESTAMP

      WHERE appointment_id =
        $1

        AND status IN (
          'missed',
          'cancelled'
        );
    `,
    [
      rebooked_from_appointment_id,
    ],
  );
}

  await client.query("COMMIT");

      // Text the patient (if they opted in). Never blocks
      // or fails the request.
      notifyBookingChange(createdAppointment.appointment_id, "booked").catch((error) =>
        console.error("Booking text failed:", error),
      );

  emitClinicUpdate({
      type:
        "appointment_created",

      appointmentId:
        createdAppointment
          .appointment_id,
    },
  );

  if (
    rebooked_from_appointment_id
  ) {
    emitClinicUpdate({
        type:
          "appointment_follow_up_changed",

        appointmentId:
          rebooked_from_appointment_id,

        followUpStatus:
          "rebooked",

        rebookedToAppointmentId:
          createdAppointment
            .appointment_id,
      },
    );
  }

  return response
    .status(201)
    .json({
      ...createdAppointment,

      was_rebooking:
        Boolean(
          rebooked_from_appointment_id,
        ),
    });
} catch (error) {
  await client.query(
    "ROLLBACK",
  );

  // The database blocks overlapping active bookings for
  // the same doctor (exclusion constraint).
  if ((error as { code?: string }).code === "23P01") {
    return response.status(409).json({
      message:
        "That time was just booked by someone else. Please choose another time.",
    });
  }

  console.error(
    "Error booking appointment:",
    error,
  );

  return response
    .status(500)
    .json({
      message:
        "Unable to book appointment.",
    });
} finally {
  client.release();
}
  } catch (error) {
    console.error("Error booking appointment:", error);

    response.status(500).json({
      message: "Unable to book appointment.",
    });
  }
});

/*
=========================================================
PATCH /api/appointments/:appointmentId/forms

Initial forms are patient-level onboarding paperwork.

Once completed once, the patient keeps forms on file
for future booked AND walk-in appointments.
=========================================================
*/

router.patch(
  "/:appointmentId/forms",
  requireStaffAuth,
  requireRole("admin", "receptionist"),
  async (
    request,
    response,
  ) => {
    const appointmentId =
      Number(
        request.params
          .appointmentId,
      );


    if (
      !Number.isInteger(
        appointmentId,
      ) ||
      appointmentId <= 0
    ) {
      return response
        .status(400)
        .json({
          message:
            "Invalid appointment ID.",
        });
    }


    const client =
      await pool.connect();


    try {
      await client.query(
        "BEGIN",
      );


      /*
       * Find appointment and lock it.
       */
      const appointmentResult =
        await client.query<{
          appointment_id: number;
          patient_id: number;
          forms_status:
            | "pending"
            | "completed";
        }>(
          `
            SELECT
              appointment_id,
              patient_id,
              forms_status

            FROM appointments

            WHERE appointment_id = $1

            FOR UPDATE;
          `,
          [appointmentId],
        );


      if (
        appointmentResult.rows
          .length === 0
      ) {
        await client.query(
          "ROLLBACK",
        );

        return response
          .status(404)
          .json({
            message:
              "Appointment not found.",
          });
      }


      const appointment =
        appointmentResult.rows[0];


      /*
       * Once onboarding forms are
       * complete, remember that at
       * the patient level.
       */
      await client.query(
        `
          UPDATE patients

          SET
            initial_forms_completed_at =
              COALESCE(
                initial_forms_completed_at,
                CURRENT_TIMESTAMP
              ),

            updated_at =
              CURRENT_TIMESTAMP

          WHERE patient_id = $1;
        `,
        [
          appointment.patient_id,
        ],
      );


      /*
       * Mark this visit completed.
       */
      await client.query(
        `
          UPDATE appointments

          SET
            forms_status =
              'completed',

            updated_at =
              CURRENT_TIMESTAMP

          WHERE appointment_id = $1;
        `,
        [appointmentId],
      );


      /*
       * Important:
       *
       * If this patient already has
       * other future visits booked,
       * those visits should also know
       * their forms are now on file.
       */
      await client.query(
        `
          UPDATE appointments

          SET
            forms_status =
              'completed',

            updated_at =
              CURRENT_TIMESTAMP

          WHERE patient_id = $1

            AND status IN (
              'scheduled',
              'checked_in'
            );
        `,
        [
          appointment.patient_id,
        ],
      );


      await client.query(
        "COMMIT",
      );


      emitClinicUpdate({
          type:
            "appointment_forms_completed",

          appointmentId,

          patientId:
            appointment.patient_id,
        },
      );


      return response
        .status(200)
        .json({
          appointment_id:
            appointmentId,

          patient_id:
            appointment.patient_id,

          forms_status:
            "completed",

          readiness_status:
            "ready",
        });
    } catch (error) {
      await client.query(
        "ROLLBACK",
      );

      console.error(
        "Error completing patient forms:",
        error,
      );

      return response
        .status(500)
        .json({
          message:
            "Unable to complete patient forms.",
        });
    } finally {
      client.release();
    }
  },
);

/*
GET /api/appointments/missed-cancelled

Returns missed and cancelled appointments.
Newest appointments appear first.
*/
router.get(
  "/missed-cancelled",
  requireStaffAuth,
  async (_request, response) => {
    try {
      await sweepExpiredAppointments();

      const result = await pool.query(`
        SELECT
          a.appointment_id,
          a.appointment_date,
          a.start_time,
          a.duration_minutes,
          a.status,
          a.reason_for_visit,

          a.follow_up_status,
          a.follow_up_reason,
          a.follow_up_notes,
          a.followed_up_at,
          a.rebooked_from_appointment_id,

          a.missed_at,
          a.missed_reason,

          a.cancelled_at,
          a.cancelled_by,
          a.cancellation_reason,

          p.patient_id,
          p.first_name
            AS patient_first_name,
          p.last_name
            AS patient_last_name,
          p.phone
            AS patient_phone,

          d.doctor_id,
          d.first_name
            AS doctor_first_name,
          d.last_name
            AS doctor_last_name,

          at.appointment_type_id,
          at.name
            AS appointment_type,

          rebooked.appointment_id
            AS rebooked_appointment_id,

          rebooked.appointment_date
            AS rebooked_appointment_date,

          rebooked.start_time
            AS rebooked_start_time,

          rebooked_doctor.first_name
            AS rebooked_doctor_first_name,

          rebooked_doctor.last_name
            AS rebooked_doctor_last_name

        FROM appointments AS a

        JOIN patients AS p
          ON p.patient_id =
             a.patient_id

        LEFT JOIN doctors AS d
          ON d.doctor_id =
             a.doctor_id

        JOIN appointment_types AS at
          ON at.appointment_type_id =
             a.appointment_type_id

        LEFT JOIN LATERAL (
          SELECT
            replacement.appointment_id,
            replacement.appointment_date,
            replacement.start_time,
            replacement.doctor_id

          FROM appointments
            AS replacement

          WHERE
            replacement.rebooked_from_appointment_id =
              a.appointment_id

          ORDER BY
            replacement.created_at DESC,
            replacement.appointment_id DESC

          LIMIT 1
        ) AS rebooked
          ON TRUE

        LEFT JOIN doctors AS rebooked_doctor
          ON rebooked_doctor.doctor_id =
             rebooked.doctor_id

        WHERE (
          (
            a.status = 'cancelled'
            -- Moved by the patient to a new time: not a
            -- cancellation that needs follow-up.
            AND a.rescheduled_to_appointment_id IS NULL
          )

          OR (
            a.status = 'missed'
            AND a.appointment_date =
              (
                CURRENT_TIMESTAMP
                AT TIME ZONE 'America/Toronto'
              )::date
          )
        )

        ORDER BY
          a.appointment_date DESC,
          a.start_time DESC;
      `);

      return response
        .status(200)
        .json(result.rows);
    } catch (error) {
      console.error(
        "Error getting missed and cancelled appointments:",
        error,
      );

      return response
        .status(500)
        .json({
          message:
            "Unable to get missed and cancelled appointments.",
        });
    }
  },
);

/*
=========================================================
PATCH /api/appointments/:appointmentId/follow-up/resolve

Manually resolves a missed appointment after staff
has contacted/reviewed the patient.

The appointment itself remains status = 'missed'.
Only its follow-up workflow is resolved.
=========================================================
*/
router.patch(
  "/:appointmentId/follow-up/resolve",
  requireStaffAuth,
  requireRole("admin", "receptionist"),
  async (request, response) => {
    const appointmentId =
      Number(
        request.params.appointmentId,
      );

    const {
      reason,
      notes,
    } = request.body as {
      reason?: string | null;
      notes?: string | null;
    };

    if (
      !Number.isInteger(
        appointmentId,
      ) ||
      appointmentId <= 0
    ) {
      return response
        .status(400)
        .json({
          message:
            "Invalid appointment ID.",
        });
    }

    const allowedReasons = [
      "Patient declined to rebook",
      "Patient will call back",
      "No further follow-up needed",
      "Other",
    ] as const;

    if (
      !reason ||
      !allowedReasons.includes(
        reason as typeof allowedReasons[number],
      )
    ) {
      return response
        .status(400)
        .json({
          message:
            "Please select a valid resolution reason.",
        });
    }

    if (
      reason === "Other" &&
      !notes?.trim()
    ) {
      return response
        .status(400)
        .json({
          message:
            "Please add a note when selecting Other.",
        });
    }

    try {
      const result =
        await pool.query(
          `
            UPDATE appointments

            SET
              follow_up_status =
                'resolved',

              follow_up_reason =
                $1,

              follow_up_notes =
                $2,

              followed_up_at =
                CURRENT_TIMESTAMP,

              updated_at =
                CURRENT_TIMESTAMP

            WHERE appointment_id =
              $3

              AND status IN (
                'missed',
                'cancelled'
              )

              AND COALESCE(
                follow_up_status,
                'pending'
              ) = 'pending'

            RETURNING
              appointment_id,
              status,
              follow_up_status,
              follow_up_reason,
              follow_up_notes,
              followed_up_at;
          `,
          [
            reason,
            notes?.trim() || null,
            appointmentId,
          ],
        );

      if (
        result.rows.length === 0
      ) {
        return response
          .status(409)
          .json({
            message:
              "This appointment has already been resolved, rebooked, or could not be found.",
          });
      }

      emitClinicUpdate({
          type:
            "appointment_follow_up_changed",

          appointmentId,

          followUpStatus:
            "resolved",
        },
      );

      return response
        .status(200)
        .json(result.rows[0]);
    } catch (error) {
      console.error(
        "Error resolving appointment:",
        error,
      );

      return response
        .status(500)
        .json({
          message:
            "Unable to resolve the appointment.",
        });
    }
  },
);

/*
 * PATCH /api/appointments/:appointmentId/walk-in-assignment
 * body: { assignment_mode: "auto" | "manual", doctor_id?: number }
 *
 * Records a waiting walk-in's choice when they won't be
 * seen before walk-in hours end:
 * - "auto": next available doctor's walk-in hours
 * - "manual" + doctor_id: that doctor's next walk-in hours
 * Their place in line (check-in order) is unchanged.
 */
router.patch(
  "/:appointmentId/walk-in-assignment",
  requireStaffAuth,
  requireRole("admin", "receptionist"),
  async (request, response) => {
    const appointmentId = Number(
      request.params.appointmentId,
    );

    const assignmentMode =
      request.body?.assignment_mode === "manual"
        ? "manual"
        : request.body?.assignment_mode === "auto"
          ? "auto"
          : null;

    const doctorId = Number(request.body?.doctor_id);

    if (
      !Number.isInteger(appointmentId) ||
      appointmentId <= 0 ||
      !assignmentMode ||
      (assignmentMode === "manual" &&
        (!Number.isInteger(doctorId) || doctorId <= 0))
    ) {
      return response.status(400).json({
        message:
          "Send assignment_mode (auto or manual) and doctor_id for manual.",
      });
    }

    try {
      if (assignmentMode === "manual") {
        const doctorResult = await pool.query(
          `
            SELECT doctor_id
            FROM doctors
            WHERE doctor_id = $1
              AND is_active = TRUE
          `,
          [doctorId],
        );

        if (doctorResult.rows.length === 0) {
          return response.status(404).json({
            message: "Active doctor not found.",
          });
        }
      }

      /*
       * The new choice must lead to walk-in hours today:
       * a doctor with no walk-in hours left (or "next
       * available" when nobody has any) would leave the
       * patient waiting with no time to be seen. Offer a
       * booked appointment instead.
       */
      try {
        const now = new Date();
        const options = walkInNextStepOptions(
          await buildClinicState(now),
          now,
          appointmentId,
        );

        if (options) {
          const noTimeLeft =
            assignmentMode === "manual"
              ? !options.doctors.find(
                  (option) => option.doctorId === doctorId,
                )?.startAt
              : options.nextAvailable === null;

          if (noTimeLeft) {
            return response.status(409).json({
              code: "WALK_IN_NO_TIME_LEFT",
              message:
                assignmentMode === "manual"
                  ? "This doctor has no walk-in time left today. Choose another doctor or offer a booked appointment."
                  : "No doctor has walk-in time left today. Offer the patient a booked appointment instead.",
            });
          }
        }
      } catch (error) {
        // As with admission, a failed check does not block
        // the front desk.
        console.error(
          "Walk-in reassignment check failed:",
          error,
        );
      }

      const result = await pool.query(
        `
          UPDATE appointments
          SET
            assignment_mode = $2,
            doctor_id = $3,
            updated_at = CURRENT_TIMESTAMP
          WHERE appointment_id = $1
            AND visit_type = 'walk_in'
            AND status IN ('scheduled', 'checked_in')
          RETURNING
            appointment_id,
            assignment_mode,
            doctor_id,
            status;
        `,
        [
          appointmentId,
          assignmentMode,
          assignmentMode === "manual" ? doctorId : null,
        ],
      );

      if (result.rows.length === 0) {
        return response.status(409).json({
          message:
            "Only waiting walk-ins (not yet roomed) can be reassigned.",
        });
      }

      emitClinicUpdate({
        type: "walk_in_assignment_changed",
        appointmentId,
        doctorId:
          assignmentMode === "manual" ? doctorId : null,
      });

      return response.status(200).json(result.rows[0]);
    } catch (error) {
      console.error(
        "Error updating walk-in assignment:",
        error,
      );

      return response.status(500).json({
        message: "Unable to update the walk-in.",
      });
    }
  },
);

/*
PATCH /api/appointments/:appointmentId/status

Allowed workflow:
scheduled -> checked_in
checked_in -> roomed
roomed -> completed

/*
A scheduled, checked-in, or roomed appointment can also be cancelled.
*/
router.patch("/:appointmentId/status", requireStaffAuth, requireOwnAppointmentIfDoctor(), async (request, response) => {
  const appointmentId = Number(request.params.appointmentId);

  const {
  status,
  cancellation_reason,
} = request.body as {
  status?: AppointmentStatus;
  cancellation_reason?: string | null;
};

  if (!Number.isInteger(appointmentId) || appointmentId <= 0) {
    return response.status(400).json({
      message: "Invalid appointment ID.",
    });
  }

  if (!status || !allowedStatuses.includes(status)) {
    return response.status(400).json({
      message:
        "Status must be scheduled, checked_in, roomed, completed, or cancelled.",
    });
  }

  if (
  status === "cancelled" &&
  !cancellation_reason?.trim()
) {
  return response.status(400).json({
    message:
      "A cancellation reason is required.",
  });
}

  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const existingResult = await client.query<{
      appointment_id: number;
      doctor_id: number | null;
      assignment_mode: "auto" | "manual";
      visit_type: "scheduled" | "walk_in";
      appointment_date: string;
      appointment_date_text: string;
      status: AppointmentStatus;
      slot_id: number | null;
      appointment_has_ended: boolean;
      appointment_has_started: boolean;
    }>(
          `
       SELECT
        appointment_id,
        doctor_id,
        assignment_mode,
        visit_type,
        appointment_date,
        appointment_date::text AS appointment_date_text,
        status,
        slot_id,

          (
            appointment_date
            + start_time
          ) <= (
            CURRENT_TIMESTAMP
            AT TIME ZONE 'America/Toronto'
          ) AS appointment_has_started,

          (
            appointment_date
            + start_time
            + make_interval(
                mins => duration_minutes
              )
          ) <= (
            CURRENT_TIMESTAMP
            AT TIME ZONE 'America/Toronto'
          ) AS appointment_has_ended

        FROM appointments

        WHERE appointment_id = $1

        FOR UPDATE;
      `,
      [appointmentId],
    );

    if (existingResult.rows.length === 0) {
      await client.query("ROLLBACK");

      return response.status(404).json({
        message: "Appointment not found.",
      });
    }

    const appointment = existingResult.rows[0];
    const currentStatus = appointment.status;
    /*
    * Prevent a patient from being checked in
    * after their appointment window has ended.
    *
    * Example:
    * 3:30 PM appointment
    * 30 minute duration
    * -> after 4:00 PM it becomes missed
    */
    if (
      status === "checked_in" &&
      currentStatus === "scheduled" &&
      appointment.appointment_has_ended
    ) {
      await client.query(
        `
          UPDATE appointments

          SET
            status = 'missed',

            missed_at =
              appointment_date
              + start_time
              + make_interval(
                  mins => duration_minutes
                ),

            missed_reason =
              'Patient did not check in before appointment window ended',

            follow_up_status = 'pending',
            follow_up_notes = NULL,
            followed_up_at = NULL,

            updated_at =
              CURRENT_TIMESTAMP

          WHERE appointment_id = $1
            AND status = 'scheduled';
        `,
        [appointmentId],
      );

  await client.query("COMMIT");

  emitClinicUpdate({
      type:
        "appointment_status_changed",

      appointmentId,

      status:
        "missed",

      doctorId:
        appointment.doctor_id,
    },
  );

  return response
    .status(409)
    .json({
      message:
        "This appointment window has ended and the appointment has been marked as missed.",
    });
}
    const allowedTransitions: Record<
      AppointmentStatus,
      AppointmentStatus[]
    > = {
      scheduled: ["checked_in", "cancelled"],
      checked_in: ["roomed", "cancelled"],
      roomed: ["completed", "cancelled"],
      completed: [],
      cancelled: [],
      missed: [],
    };

    if (!allowedTransitions[currentStatus].includes(status)) {
      await client.query("ROLLBACK");

      return response.status(400).json({
        message: `Appointment cannot move from ${currentStatus} to ${status}.`,
      });
    }

    /*
      ROOM PATIENT:
      - provider must be available
      - provider must have a room assigned for the appointment date
      - copy that room into the appointment
      - connect provider to this appointment
    */
    if (status === "roomed") {

      /*
 * A patient cannot be moved to the
 * physician until their required
 * first-time forms are complete.
 */
const readinessResult =
  await client.query<{
    forms_status:
      | "pending"
      | "completed";
  }>(
    `
      SELECT
        forms_status

      FROM appointments

      WHERE appointment_id = $1;
    `,
    [appointmentId],
  );


const readiness =
  readinessResult.rows[0];


if (
  !readiness ||
  readiness.forms_status !==
    "completed"
) {
  await client.query(
    "ROLLBACK",
  );

  return response
    .status(409)
    .json({
      message:
        "This patient's initial forms are still pending.",
    });
}

/*
 * Determine which physician will actually
 * receive this patient.
 *
 * Manual/scheduled patients keep their
 * persisted physician.
 *
 * Auto walk-ins use QueueSimulator's
 * current real-time projection.
 */
let effectiveDoctorId =
  appointment.doctor_id;

if (
  appointment.visit_type === "walk_in" &&
  appointment.assignment_mode === "auto"
) {
  const now = new Date();

  const state =
    await buildClinicState(now);

  const simulation =
    simulateWalkInQueue(
      state,
      now,
    );

  const assignment =
    simulation.assignments.find(
      (item) =>
        item.appointmentId ===
        appointmentId,
    );

  if (!assignment) {
    await client.query("ROLLBACK");

    return response.status(409).json({
      message:
        "No physician is currently available for this walk-in.",
    });
  }

  const projectedStartAt =
    new Date(
      assignment.projectedStartAt,
    );

  if (
    Number.isNaN(
      projectedStartAt.getTime(),
    ) ||
    projectedStartAt.getTime() >
      now.getTime()
  ) {
    await client.query("ROLLBACK");

    return response.status(409).json({
      message:
        "This walk-in is not ready to be roomed yet.",
    });
  }

  effectiveDoctorId =
    assignment.projectedDoctorId;
}

if (
  !Number.isInteger(effectiveDoctorId) ||
  effectiveDoctorId === null ||
  effectiveDoctorId <= 0
) {
  await client.query("ROLLBACK");

  return response.status(409).json({
    message:
      "A physician could not be assigned to this patient.",
  });
}
      /*
       * Lock the provider's status row for the rest of
       * this transaction. Two staff rooming patients to
       * the same doctor at once now run one after the
       * other, and the second sees the doctor as busy.
       */
      const providerResult = await client.query<{
        current_status: string | null;
        current_appointment_id: number | null;
        room_name: string | null;
      }>(
        `
          SELECT
            ps.current_status,
            ps.current_appointment_id,
            dra.room_name

          FROM provider_status AS ps

          LEFT JOIN doctor_room_assignments AS dra
            ON dra.doctor_id = ps.doctor_id
          AND dra.assignment_date = $2::date

          WHERE ps.doctor_id = $1

          LIMIT 1

          FOR UPDATE OF ps;
        `,
        [
          effectiveDoctorId,
          appointment.appointment_date,
        ],
      );

      const provider = providerResult.rows[0];

      if (
        provider?.current_status !== "available" ||
        provider.current_appointment_id !== null
      ) {
        await client.query("ROLLBACK");

        return response.status(409).json({
          message: "The provider is not currently available.",
        });
      }

      if (!provider?.room_name) {
        await client.query("ROLLBACK");

        return response.status(409).json({
          message:
            "The provider does not have a room assigned for this date.",
        });
      }

    const result = await client.query(
      `
        UPDATE appointments
        SET
          doctor_id = $2,
          status = 'roomed',
          roomed_at = CURRENT_TIMESTAMP,
          consult_started_at = CURRENT_TIMESTAMP,
          assigned_room_name = $3,
          updated_at = CURRENT_TIMESTAMP

        WHERE appointment_id = $1

        RETURNING
          appointment_id,
          patient_id,
          doctor_id,
          appointment_date,
          start_time,
          duration_minutes,
          status,
          checked_in_at,
          roomed_at,
          consult_started_at,
          completed_at,
          cancelled_at,
          cancelled_by,
          assigned_room_name,
          updated_at;
      `,
      [
        appointmentId,
        effectiveDoctorId,
        provider.room_name,
      ],
    );

await client.query(
  `
    UPDATE provider_status
    SET
      current_status = 'in_consult',
      status_reason = NULL,
      current_appointment_id = $2,
      estimated_ready_at = NULL,
      readiness_estimate_minutes = NULL,
      readiness_estimate_updated_at = NULL,
      status_updated_at = CURRENT_TIMESTAMP
    WHERE doctor_id = $1;
  `,
  [
    effectiveDoctorId,
    appointmentId,
  ],
);

      

      await client.query("COMMIT");

      const updatedAppointment = {
        ...result.rows[0],
        room_name: provider.room_name,
        provider_status: "in_consult",
      };

      emitClinicUpdate({
        type: "appointment_status_changed",
        appointmentId,
        status: "roomed",
        doctorId: effectiveDoctorId,
      });

      return response
        .status(200)
        .json(updatedAppointment);
          }

    /*
      COMPLETE CONSULT:
      - complete the patient
      - make provider available again
      - disconnect current appointment
    */
    if (status === "completed") {

      // A consultation must be started before
// the appointment can be completed.
const consultResult = await client.query<{
  consult_started_at: Date | null;
}>(
  `
    SELECT
      consult_started_at
    FROM appointments
    WHERE appointment_id = $1;
  `,
  [appointmentId],
);

const consultStartedAt =
  consultResult.rows[0]?.consult_started_at;

if (!consultStartedAt) {
  await client.query("ROLLBACK");

  return response.status(409).json({
    message:
      "The consultation must be started before the appointment can be completed.",
  });
}
      const result = await client.query(

        
        `
          UPDATE appointments
          SET
            status = 'completed',
            consult_ended_at = CURRENT_TIMESTAMP,
            completed_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
          WHERE appointment_id = $1
          RETURNING
            appointment_id,
            patient_id,
            doctor_id,
            appointment_date,
            start_time,
            duration_minutes,
            status,
            checked_in_at,
            roomed_at,
            consult_started_at,
            consult_ended_at,
            completed_at,
            cancelled_at,
            cancelled_by,
            assigned_room_name,
            updated_at;
        `,
        [appointmentId],
      );

      await client.query(
      `
        UPDATE provider_status
        SET
          current_status = 'available',
          status_reason = NULL,
          current_appointment_id = NULL,
          estimated_ready_at = NULL,
          readiness_estimate_minutes = NULL,
          readiness_estimate_updated_at = NULL,
          status_updated_at = CURRENT_TIMESTAMP
        WHERE doctor_id = $1
          AND current_appointment_id = $2;
      `,
      [appointment.doctor_id, appointmentId],
    );

      await client.query("COMMIT");

      const updatedAppointment = {
        ...result.rows[0],
        room_name:
          result.rows[0].assigned_room_name,
        provider_status: "available",
      };

      emitClinicUpdate({
        type: "appointment_status_changed",
        appointmentId,
        status: "completed",
        doctorId: appointment.doctor_id,
      });

      return response
        .status(200)
        .json(updatedAppointment);
          }

    /*
      CHECK IN OR CANCEL:
      keep your normal timestamp logic
    */
    const result = await client.query(
      `
        UPDATE appointments
        SET
          status = $1::varchar,

          checked_in_at = CASE
            WHEN $1::varchar = 'checked_in'
            THEN CURRENT_TIMESTAMP
            ELSE checked_in_at
          END,

          cancelled_at = CASE
            WHEN $1::varchar = 'cancelled'
            THEN CURRENT_TIMESTAMP
            ELSE cancelled_at
          END,

          cancelled_by = CASE
            WHEN $1::varchar = 'cancelled'
            THEN 'staff'
            ELSE cancelled_by
          END,
          cancellation_reason = CASE
            WHEN $1::varchar = 'cancelled'
            THEN $3
            ELSE cancellation_reason
          END,

          follow_up_status = CASE
            WHEN $1::varchar = 'cancelled'
            THEN 'pending'
            ELSE follow_up_status
          END,

          follow_up_reason = CASE
            WHEN $1::varchar = 'cancelled'
            THEN NULL
            ELSE follow_up_reason
          END,

          follow_up_notes = CASE
            WHEN $1::varchar = 'cancelled'
            THEN NULL
            ELSE follow_up_notes
          END,

          followed_up_at = CASE
            WHEN $1::varchar = 'cancelled'
            THEN NULL
            ELSE followed_up_at
          END,

          updated_at = CURRENT_TIMESTAMP

        WHERE appointment_id = $2

        RETURNING
          appointment_id,
          patient_id,
          doctor_id,
          appointment_date,
          start_time,
          duration_minutes,
          status,
          checked_in_at,
          roomed_at,
          completed_at,
          cancelled_at,
          cancelled_by,
          assigned_room_name,
          updated_at;
      `,
      [
        status,
        appointmentId,
        cancellation_reason?.trim() || null,
      ],
    );

    if (status === "cancelled") {
  /*
   * If this appointment came from a booked slot
   * and the appointment has NOT started yet,
   * make that slot available again.
   */
      if (
        appointment.slot_id &&
        !appointment.appointment_has_started
      ) {
        await client.query(
          `
            UPDATE appointment_slots

            SET
              slot_status = 'available'

            WHERE slot_id = $1
              AND slot_status = 'booked';
          `,
          [appointment.slot_id],
        );
      }

      /*
      * If the provider happened to be connected
      * to this appointment, release them.
      */
      await client.query(
        `
          UPDATE provider_status

          SET
            current_status = 'available',
            status_reason = NULL,
            current_appointment_id = NULL,
            estimated_ready_at = NULL,
            readiness_estimate_minutes = NULL,
            readiness_estimate_updated_at = NULL,
            status_updated_at = CURRENT_TIMESTAMP

          WHERE doctor_id = $1
            AND current_appointment_id = $2;
        `,
        [
          appointment.doctor_id,
          appointmentId,
        ],
      );
    }

    await client.query("COMMIT");

    emitClinicUpdate({
  type: "appointment_status_changed",
  appointmentId,
  status,
  doctorId: appointment.doctor_id,
  appointmentDate: appointment.appointment_date_text,
});

    // A cancelled booking frees its time for open
    // booking screens.
    if (
      status === "cancelled" &&
      appointment.visit_type === "scheduled"
    ) {

      // Text the patient (if they opted in). Never blocks
      // or fails the request.
      notifyBookingChange(appointmentId, "cancelled_by_clinic").catch((error) =>
        console.error("Booking text failed:", error),
      );

      emitClinicUpdate({
        type: "appointment_availability_changed",
        doctorId: appointment.doctor_id,
        appointmentDate:
          appointment.appointment_date_text,
      });
    }

    return response.status(200).json(result.rows[0]);
  } catch (error) {
    await client.query("ROLLBACK");

    console.error("Error updating appointment status:", error);

    return response.status(500).json({
      message: "Unable to update appointment status.",
    });
  } finally {
    client.release();
  }
});

export default router;