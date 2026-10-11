import express from "express";
import { isLongVisit } from "../services/longVisits.js";
import { clinicToday } from "../clinicTimeZone.js";
import { pool } from "../db.js";
import {
  getDoctorDaySlots,
  getDoctorsDaySummary,
} from "../services/scheduleAvailability.js";

import {
  type AuthenticatedRequest,
  requireAnyAuth,
  requireStaffAuth,
} from "../middleware/authMiddleware.js";

import {
  requireRole,
} from "../middleware/requireRole.js";

import { buildClinicState } from "../services/waittime/ClinicStateBuilder.js";
import { simulateWalkInQueue } from "../services/waittime/QueueSimulator.js";

const router = express.Router();

/* =========================================================
   GET CURRENT DOCTOR'S APPOINTMENTS TODAY
   DOCTOR ONLY

   GET /api/doctors/me/today
========================================================= */

router.get(
  "/me/today",
  requireStaffAuth,
  requireRole("doctor"),
  async (
    request: AuthenticatedRequest,
    response,
  ) => {
    try {
      const doctorId =
        request.staff?.doctorId;

      /*
       A doctor login MUST be connected
       to a doctors.doctor_id record.
      */
      if (!doctorId) {
        return response.status(403).json({
          message:
            "This doctor account is not linked to a physician profile.",
        });
      }

      const doctorResult =
        await pool.query<{
          doctor_id: number;
          first_name: string;
          last_name: string;
          specialty: string | null;
          is_active: boolean;
        }>(
          `
            SELECT
              doctor_id,
              first_name,
              last_name,
              specialty,
              is_active

            FROM doctors

            WHERE doctor_id = $1

            LIMIT 1;
          `,
          [doctorId],
        );

      if (
        doctorResult.rows.length === 0
      ) {
        return response.status(404).json({
          message:
            "Doctor profile not found.",
        });
      }

      const doctor =
        doctorResult.rows[0];

      if (!doctor.is_active) {
        return response.status(403).json({
          message:
            "This physician profile is inactive.",
        });
      }

      const appointmentsResult =
        await pool.query(
          `
            SELECT
              a.appointment_id,
              a.appointment_date,

              a.start_time,
              a.start_time AS appointment_time,

              a.duration_minutes,
              a.status,
              a.reason_for_visit,

              a.visit_type,
              a.walk_in_capacity_override,
              a.booking_channel,
              a.forms_status,

              CASE
                WHEN a.forms_status =
                  'completed'
                THEN 'ready'
                ELSE 'pending'
              END AS readiness_status,

              a.checked_in_at,
              a.roomed_at,
              a.completed_at,

              -- Shown on the doctor dashboard for the
              -- patient currently in the room.
              a.assigned_room_name,

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

            INNER JOIN patients AS p
              ON p.patient_id = a.patient_id

            INNER JOIN doctors AS d
              ON d.doctor_id = a.doctor_id

            INNER JOIN appointment_types AS at
              ON at.appointment_type_id =
                a.appointment_type_id

            WHERE
              a.doctor_id = $1
              AND a.appointment_date =
                 (CURRENT_TIMESTAMP AT TIME ZONE 'America/Toronto')::date

            ORDER BY
              a.start_time ASC;
          `,
          [doctorId],
        );

      return response.status(200).json({
        doctor: {
          doctor_id:
            doctor.doctor_id,

          first_name:
            doctor.first_name,

          last_name:
            doctor.last_name,

          specialty:
            doctor.specialty,
        },

        appointments:
          appointmentsResult.rows,
      });
    } catch (error) {
      console.error(
        "Error loading current doctor's appointments:",
        error,
      );

      return response.status(500).json({
        message:
          "Unable to load today's appointments.",
      });
    }
  },
);

/* =========================================================
   GET CURRENT DOCTOR'S LIVE QUEUE
   DOCTOR ONLY

   GET /api/doctors/me/queue
========================================================= */

router.get(
  "/me/queue",
  requireStaffAuth,
  requireRole("doctor"),
  async (
    request: AuthenticatedRequest,
    response,
  ) => {
    try {
      const doctorId =
        request.staff?.doctorId;

      if (!doctorId) {
        return response.status(403).json({
          message:
            "This doctor account is not linked to a physician profile.",
        });
      }

      const result =
        await pool.query(
          `
            SELECT
              a.appointment_id,
              a.appointment_date,
              a.start_time,
              a.duration_minutes,
              a.status,
              a.reason_for_visit,
              a.visit_type,
              a.walk_in_capacity_override,
              a.booking_channel,
              a.forms_status,

              CASE
                WHEN a.forms_status = 'completed'
                  THEN 'ready'
                ELSE 'pending'
              END AS readiness_status,

             a.checked_in_at,
             a.roomed_at,
             a.consult_started_at,
             a.consult_ended_at,
             a.completed_at,

              p.patient_id,
              p.first_name AS patient_first_name,
              p.last_name AS patient_last_name,
              p.phone AS patient_phone,

              d.doctor_id,
              d.first_name AS doctor_first_name,
              d.last_name AS doctor_last_name,

              at.appointment_type_id,
              at.name AS appointment_type,

              CASE
                WHEN
                  a.status = 'checked_in'
                  AND a.checked_in_at IS NOT NULL
                THEN FLOOR(
                  EXTRACT(
                    EPOCH FROM (
                      CURRENT_TIMESTAMP -
                      a.checked_in_at
                    )
                  ) / 60
                )::INTEGER
                ELSE 0
              END AS waiting_minutes

            FROM appointments AS a

            INNER JOIN patients AS p
              ON p.patient_id =
                a.patient_id

            INNER JOIN doctors AS d
              ON d.doctor_id =
                a.doctor_id

            LEFT JOIN appointment_types AS at
              ON at.appointment_type_id =
                a.appointment_type_id

            WHERE
              a.doctor_id = $1

              AND a.appointment_date =
                (CURRENT_TIMESTAMP AT TIME ZONE 'America/Toronto')::date

              AND a.status IN (
                'checked_in',
                'roomed'
              )

            ORDER BY
              CASE
                WHEN a.status = 'checked_in'
                  THEN 1
                WHEN a.status = 'roomed'
                  THEN 2
                ELSE 3
              END,

              a.checked_in_at ASC NULLS LAST,
              a.start_time ASC;
          `,
          [doctorId],
        );

      return response.status(200).json(
        result.rows,
      );
    } catch (error) {
      console.error(
        "Error loading current doctor's queue:",
        error,
      );

      return response.status(500).json({
        message:
          "Unable to load your current queue.",
      });
    }
  },
);

/* =========================================================
   GET ACTIVE DOCTORS

   GET /api/doctors

   Used for Book Appointment dropdown.
========================================================= */

router.get(
  "/",
  requireStaffAuth,
  async (_request, response) => {
    try {
      const result =
        await pool.query(`
          SELECT
            doctor_id,
            first_name,
            last_name,
            specialty
          FROM doctors
          WHERE is_active = TRUE
          ORDER BY
            last_name,
            first_name;
        `);

      return response
        .status(200)
        .json(result.rows);
    } catch (error) {
      console.error(
        "Error getting doctors:",
        error,
      );

      return response
        .status(500)
        .json({
          message:
            "Unable to get doctors.",
        });
    }
  },
);

/* =========================================================
   DOCTOR AVAILABILITY SUMMARY

   GET /api/doctors/availability-summary
========================================================= */

router.get(
  "/availability-summary",
  requireAnyAuth,
  async (request, response) => {
    try {
      const requestedDate =
        typeof request.query.date ===
        "string"
          ? request.query.date
          : clinicToday();

      // Real schedule, bookings and holds (not the old
      // appointment_slots table).
      return response.json(
        await getDoctorsDaySummary(requestedDate),
      );
    } catch (error) {
      console.error(
        "Error loading doctor availability summary:",
        error,
      );

      return response
        .status(500)
        .json({
          message:
            "Unable to load doctor availability summary.",
        });
    }
  },
);

/* =========================================================
   WALK-IN AVAILABLE PHYSICIANS

   GET /api/doctors/walk-in-available

   For now:
   - Returns physicians who are currently inside a dedicated
     walk-in schedule block.
   - A physician may still be "in_consult" and accept patients
     into their walk-in queue.
   - Opportunistic scheduled-doctor openings come later.
========================================================= */

router.get(
  "/walk-in-available",
  requireStaffAuth,
  async (_request, response) => {
    try {
      const result = await pool.query(`
        SELECT
          d.doctor_id,
          d.first_name,
          d.last_name,
          d.specialty,

          COALESCE(
            ps.current_status,
            'available'
          ) AS current_status,

          ps.status_reason,

          dsb.start_time AS walk_in_start_time,
          dsb.end_time AS walk_in_available_until,

          COUNT(a.appointment_id) FILTER (
            WHERE
              a.visit_type = 'walk_in'
              AND a.status = 'checked_in'
          )::INTEGER AS walk_ins_waiting

        FROM doctors AS d

        INNER JOIN LATERAL effective_schedule_blocks(((CURRENT_TIMESTAMP AT TIME ZONE 'America/Toronto'))::date) AS dsb
          ON dsb.doctor_id = d.doctor_id
          AND dsb.is_active = TRUE
          AND dsb.block_type = 'walk_in'

          -- Match today's weekday in Toronto.
          

          -- Physician must currently be inside the walk-in block.
          AND (
            CURRENT_TIMESTAMP AT TIME ZONE 'America/Toronto'
          )::time >= dsb.start_time

          AND (
            CURRENT_TIMESTAMP AT TIME ZONE 'America/Toronto'
          )::time < dsb.end_time

        LEFT JOIN provider_status AS ps
          ON ps.doctor_id = d.doctor_id

        LEFT JOIN appointments AS a
          ON a.doctor_id = d.doctor_id
          AND a.appointment_date =
            (
              CURRENT_TIMESTAMP AT TIME ZONE 'America/Toronto'
            )::date

        WHERE d.is_active = TRUE

        GROUP BY
          d.doctor_id,
          d.first_name,
          d.last_name,
          d.specialty,
          ps.current_status,
          ps.status_reason,
          dsb.start_time,
          dsb.end_time

        ORDER BY
          walk_ins_waiting ASC,
          d.last_name,
          d.first_name;
      `);

      /*
       * "Walk-ins waiting" per doctor: the walk-ins the
       * engine plans for that doctor (including those with
       * no preferred doctor), not just ones assigned to
       * them by name, so the number matches the estimate.
       */
      const now = new Date();
      const plan = simulateWalkInQueue(
        await buildClinicState(now),
        now,
      );

      const plannedByDoctor = new Map<number, number>();

      for (const visit of plan.assignments) {
        plannedByDoctor.set(
          visit.projectedDoctorId,
          (plannedByDoctor.get(visit.projectedDoctorId) ?? 0) + 1,
        );
      }

      return response.json(
        result.rows
          .map((row) => ({
            ...row,
            walk_ins_waiting:
              plannedByDoctor.get(row.doctor_id) ?? 0,
          }))
          .sort(
            (a, b) =>
              a.walk_ins_waiting - b.walk_ins_waiting,
          ),
      );
    } catch (error) {
      console.error(
        "Error loading walk-in physicians:",
        error,
      );

      return response.status(500).json({
        message:
          "Unable to load physicians accepting walk-ins.",
      });
    }
  },
);

/* =========================================================
   GET DOCTOR SCHEDULE BLOCKS

   GET /api/doctors/:doctorId/schedule-blocks?date=2026-09-17
========================================================= */

router.get(
  "/:doctorId/schedule-blocks",
  requireStaffAuth,
  async (request, response) => {
    try {
      const doctorId = Number(request.params.doctorId);

      const date =
        typeof request.query.date === "string"
          ? request.query.date
          : "";

      if (!Number.isInteger(doctorId) || doctorId <= 0) {
        return response.status(400).json({
          message: "A valid doctor ID is required.",
        });
      }

      // Keep the API strict so an invalid date does not silently
      // return the wrong recurring weekday.
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return response.status(400).json({
          message: "A date is required in YYYY-MM-DD format.",
        });
      }

      const result = await pool.query(
        `
          SELECT
            dsb.schedule_block_id,
            dsb.doctor_id,
            dsb.day_of_week,
            dsb.start_time,
            dsb.end_time,
            dsb.block_type,
            dsb.block_reason,
            dsb.is_active
          FROM effective_schedule_blocks(($2::DATE)::date) AS dsb
          WHERE
            dsb.doctor_id = $1
            AND dsb.is_active = TRUE

            -- Convert the requested date into the corresponding
            -- recurring weekday.
            

          ORDER BY dsb.start_time;
        `,
        [doctorId, date],
      );

      return response.json(result.rows);
    } catch (error) {
      console.error(
        "Error loading doctor schedule blocks:",
        error,
      );

      return response.status(500).json({
        message:
          "Unable to load physician schedule.",
      });
    }
  },
);

/* =========================================================
   GET DOCTOR SCHEDULE PREVIEW

   GET /api/doctors/:doctorId/schedule-preview?date=2026-09-17

   Combines:
   - physician information
   - recurring schedule blocks for the requested weekday
   - scheduled-patient capacity/rules for that weekday

   This does NOT generate appointment slots.
========================================================= */

router.get(
  "/:doctorId/schedule-preview",
  requireStaffAuth,
  async (request, response) => {
    try {
      const doctorId = Number(
        request.params.doctorId,
      );

      const date =
        typeof request.query.date === "string"
          ? request.query.date
          : "";

      if (
        !Number.isInteger(doctorId) ||
        doctorId <= 0
      ) {
        return response.status(400).json({
          message:
            "A valid doctor ID is required.",
        });
      }

      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(date)
      ) {
        return response.status(400).json({
          message:
            "A date is required in YYYY-MM-DD format.",
        });
      }

      /*
       * Load the physician first.
       */
      const doctorResult =
        await pool.query<{
          doctor_id: number;
          first_name: string;
          last_name: string;
          specialty: string | null;
        }>(
          `
            SELECT
              doctor_id,
              first_name,
              last_name,
              specialty
            FROM doctors
            WHERE doctor_id = $1
              AND is_active = TRUE
            LIMIT 1;
          `,
          [doctorId],
        );

      if (doctorResult.rows.length === 0) {
        return response.status(404).json({
          message:
            "Active physician not found.",
        });
      }

      /*
       * Load recurring blocks for the weekday
       * represented by the requested date.
       */
      const blocksResult =
        await pool.query(
          `
            SELECT
              schedule_block_id,
              doctor_id,
              day_of_week,
              start_time,
              end_time,
              block_type,
              block_reason
            FROM effective_schedule_blocks(($2::DATE)::date)
            WHERE doctor_id = $1
              AND is_active = TRUE
              
            ORDER BY start_time;
          `,
          [doctorId, date],
        );

      /*
       * Load booking/capacity rules for
       * the same physician + weekday.
       */
      const settingsResult =
        await pool.query<{
          scheduled_patient_capacity: number;
          booking_interval_minutes: number;
          patients_before_catch_up:
            number | null;
          catch_up_minutes:
            number | null;
        }>(
          `
            SELECT
              scheduled_patient_capacity,
              booking_interval_minutes,
              patients_before_catch_up,
              catch_up_minutes
            FROM doctor_schedule_settings
            WHERE doctor_id = $1
              AND is_active = TRUE
              AND day_of_week =
                EXTRACT(
                  DOW FROM $2::DATE
                )::INTEGER
            LIMIT 1;
          `,
          [doctorId, date],
        );

      const settings =
        settingsResult.rows[0] ?? null;

      /*
       * Count existing active scheduled bookings.
       *
       * Cancelled/missed appointments should not
       * consume scheduled patient capacity.
       *
       * Walk-ins also do not consume the scheduled
       * patient-count ceiling.
       */
      const bookingCountResult =
        await pool.query<{
          booked_patients: number;
        }>(
          `
            SELECT
              COUNT(*)::INTEGER
                AS booked_patients
            FROM appointments
            WHERE doctor_id = $1
              AND appointment_date = $2::DATE
              AND visit_type = 'scheduled'
              AND status NOT IN (
                'cancelled',
                'missed'
              );
          `,
          [doctorId, date],
        );

      const bookedPatients =
        bookingCountResult.rows[0]
          ?.booked_patients ?? 0;

      const remainingCapacity =
        settings
          ? Math.max(
              settings
                .scheduled_patient_capacity -
                bookedPatients,
              0,
            )
          : null;

      return response.status(200).json({
        date,

        doctor: doctorResult.rows[0],

        settings: settings
          ? {
              ...settings,
              booked_patients:
                bookedPatients,
              remaining_patient_capacity:
                remainingCapacity,
            }
          : null,

        blocks: blocksResult.rows,
      });
    } catch (error) {
      console.error(
        "Error loading doctor schedule preview:",
        error,
      );

      return response.status(500).json({
        message:
          "Unable to load physician schedule preview.",
      });
    }
  },
);

/* =========================================================
   GET SCHEDULED BOOKING AVAILABILITY

   GET
   /api/doctors/:doctorId/booking-availability
     ?date=2026-09-17
     &appointmentReasonId=1

   Purpose:
   - Uses the selected appointment reason's DB duration.
   - Derives the care category from appointment_types.
   - Uses the doctor's scheduled clinic blocks.
   - Uses the doctor's booking interval.
   - Respects existing scheduled appointments.
   - Respects active temporary holds.
   - Respects the scheduled-patient daily capacity.
========================================================= */

router.get(
  "/:doctorId/booking-availability",
  requireAnyAuth,
  async (request: AuthenticatedRequest, response) => {
    try {
      /*
       * Rescheduling: leave out the visit being moved, if it
       * is the signed-in patient's own (staff may name any).
       */
      const excludeId = Number(request.query.excludeAppointmentId);
      const excludeAppointmentId =
        Number.isInteger(excludeId) && excludeId > 0 ? excludeId : null;
      const excludeOwner = request.patientAuth?.patientId ?? null;

      const doctorId =
        Number(request.params.doctorId);

      const date =
        typeof request.query.date === "string"
          ? request.query.date
          : "";

      const appointmentReasonId =
        Number(
          request.query.appointmentReasonId,
        );

              /*
      * Optional hold token belonging to the booking flow
      * requesting availability.
      *
      * The user's own hold still blocks its time interval,
      * but it should not consume an additional capacity spot
      * when calculating availability for that same user.
      */
      const holdToken =
        typeof request.query.holdToken === "string" &&
        request.query.holdToken.trim() !== ""
          ? request.query.holdToken.trim()
          : null;

      /* -------------------------
         Validate request
      ------------------------- */

      if (
        !Number.isInteger(doctorId) ||
        doctorId <= 0
      ) {
        return response.status(400).json({
          message:
            "A valid doctor ID is required.",
        });
      }

      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(date)
      ) {
        return response.status(400).json({
          message:
            "A date is required in YYYY-MM-DD format.",
        });
      }

      if (
        !Number.isInteger(
          appointmentReasonId,
        ) ||
        appointmentReasonId <= 0
      ) {
        return response.status(400).json({
          message:
            "A valid appointment reason ID is required.",
        });
      }

      /* -------------------------
         Load doctor
      ------------------------- */

      const doctorResult =
        await pool.query<{
          doctor_id: number;
          first_name: string;
          last_name: string;
          specialty: string | null;
        }>(
          `
            SELECT
              doctor_id,
              first_name,
              last_name,
              specialty

            FROM doctors

            WHERE doctor_id = $1
              AND is_active = TRUE

            LIMIT 1;
          `,
          [doctorId],
        );

      if (
        doctorResult.rows.length === 0
      ) {
        return response.status(404).json({
          message:
            "Active physician not found.",
        });
      }

      /* -------------------------
         Load appointment reason

         The reason determines:
         - care category
         - booking duration

         Duration comes from the DB,
         never from the frontend.
      ------------------------- */

      const appointmentReasonResult =
        await pool.query<{
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
          [appointmentReasonId],
        );

      if (
        appointmentReasonResult.rows
          .length === 0
      ) {
        return response.status(404).json({
          message:
            "Active appointment reason not found.",
        });
      }

      const appointmentReason =
        appointmentReasonResult.rows[0];

      /*
       * These are derived from the selected reason.
       * The frontend does not decide either value.
       */
      const appointmentTypeId =
        appointmentReason.appointment_type_id;

      const requestedDuration =
        appointmentReason.duration_minutes;

      /* -------------------------
         Load scheduling settings
      ------------------------- */

      const settingsResult =
        await pool.query<{
          scheduled_patient_capacity: number;
          booking_interval_minutes: number;
          patients_before_catch_up:
            number | null;
          catch_up_minutes:
            number | null;
          max_long_visits_per_day:
            number | null;
        }>(
          `
            SELECT
              scheduled_patient_capacity,
              booking_interval_minutes,
              patients_before_catch_up,
              catch_up_minutes,
              max_long_visits_per_day

            FROM doctor_schedule_settings

            WHERE doctor_id = $1
              AND is_active = TRUE

              AND day_of_week =
                EXTRACT(
                  DOW FROM $2::DATE
                )::INTEGER

            LIMIT 1;
          `,
          [doctorId, date],
        );

      if (
        settingsResult.rows.length === 0
      ) {
        return response.status(200).json({
          date,

          doctor:
            doctorResult.rows[0],

          appointment_reason: {
            appointment_reason_id:
              appointmentReason
                .appointment_reason_id,

            name:
              appointmentReason
                .reason_name,

            duration_minutes:
              requestedDuration,

            appointment_type_id:
              appointmentTypeId,

            category_name:
              appointmentReason
                .category_name,
          },

          available_times: [],

          message:
            "No scheduling rules are configured for this physician on this day.",
        });
      }

      const settings =
        settingsResult.rows[0];

      /* -------------------------
         Load scheduled clinic blocks

         Walk-in and blocked periods
         are intentionally excluded.
      ------------------------- */

      const blocksResult =
        await pool.query<{
          schedule_block_id: number;
          start_time: string;
          end_time: string;
        }>(
          `
            SELECT
              schedule_block_id,
              start_time,
              end_time

            FROM effective_schedule_blocks(($2::DATE)::date)

            WHERE doctor_id = $1
              AND is_active = TRUE
              AND block_type = 'scheduled'

              

            ORDER BY start_time;
          `,
          [doctorId, date],
        );

      /* -------------------------
         Load existing bookings
      ------------------------- */

      const appointmentsResult =
        await pool.query<{
          appointment_id: number;
          start_time: string;
          duration_minutes: number;
        }>(
          `
            SELECT
              appointment_id,
              start_time,
              duration_minutes

            FROM appointments

            WHERE doctor_id = $1
              AND appointment_date =
                $2::DATE

              AND visit_type =
                'scheduled'

              AND status NOT IN (
                'cancelled',
                'missed'
              )

              AND start_time IS NOT NULL

              AND NOT COALESCE(
                appointment_id = $3::integer
                AND ($4::integer IS NULL OR patient_id = $4::integer),
                FALSE
              )

            ORDER BY start_time;
          `,
          [doctorId, date, excludeAppointmentId, excludeOwner],
        );

      const existingAppointments =
        appointmentsResult.rows;

      /* -------------------------
         Load active appointment holds

         Holds temporarily consume:
         - schedule time
         - patient capacity
      ------------------------- */

      const holdsResult =
        await pool.query<{
          hold_id: number;
          hold_token: string;
          start_time: string;
          duration_minutes: number;
        }>(
          `
            SELECT
              hold_id,
              hold_token,
              start_time,
              duration_minutes

            FROM appointment_holds

            WHERE doctor_id = $1
              AND appointment_date = $2::DATE
              AND status = 'active'
              AND expires_at >
                CURRENT_TIMESTAMP

            ORDER BY start_time;
          `,
          [
            doctorId,
            date,
          ],
        );

      const activeHolds =
        holdsResult.rows;

      const bookedPatients =
        existingAppointments.length;

            /*
      * All active holds block schedule time.
      *
      * For capacity, however, do not count the requesting
      * booking flow's own hold against itself.
      */
      const heldPatients =
        activeHolds.filter(
          (hold) =>
            holdToken === null ||
            hold.hold_token !== holdToken,
        ).length;

      /*
       * Active holds temporarily consume
       * scheduled patient capacity.
       */
      const remainingCapacity =
        Math.max(
          settings
            .scheduled_patient_capacity -
            bookedPatients -
            heldPatients,
          0,
        );

      /*
       * Long visits (45+ min) have their own daily limit, so
       * they can't crowd out shorter visits. Our own hold
       * isn't counted against us.
       */
      const longVisitsTaken =
        existingAppointments.filter((appointment) =>
          isLongVisit(appointment.duration_minutes),
        ).length +
        activeHolds.filter(
          (hold) =>
            (holdToken === null || hold.hold_token !== holdToken) &&
            isLongVisit(hold.duration_minutes),
        ).length;

      const longVisitLimitReached =
        isLongVisit(requestedDuration) &&
        settings.max_long_visits_per_day !== null &&
        longVisitsTaken >= settings.max_long_visits_per_day;

      /*
       * Stop early if the doctor's
       * scheduled-patient ceiling (or long-visit limit)
       * has already been reached.
       */
      if (remainingCapacity === 0 || longVisitLimitReached) {
        return response.status(200).json({
          date,

          doctor:
            doctorResult.rows[0],

          appointment_reason: {
            appointment_reason_id:
              appointmentReason
                .appointment_reason_id,

            name:
              appointmentReason
                .reason_name,

            duration_minutes:
              requestedDuration,

            appointment_type_id:
              appointmentTypeId,

            category_name:
              appointmentReason
                .category_name,
          },

          settings: {
            ...settings,

            booked_patients:
              bookedPatients,

            held_patients:
              heldPatients,

            remaining_patient_capacity:
              remainingCapacity,

            long_visits_booked:
              longVisitsTaken,

            long_visit_limit_reached:
              longVisitLimitReached,
          },

          available_times: [],
        });
      }

      /* =====================================================
         TIME HELPERS
      ===================================================== */

      const timeToMinutes = (
        time: string,
      ) => {
        const [hours, minutes] =
          time
            .slice(0, 5)
            .split(":")
            .map(Number);

        return hours * 60 + minutes;
      };

      const minutesToTime = (
        totalMinutes: number,
      ) => {
        const hours =
          Math.floor(
            totalMinutes / 60,
          );

        const minutes =
          totalMinutes % 60;

        return `${String(hours).padStart(
          2,
          "0",
        )}:${String(minutes).padStart(
          2,
          "0",
        )}`;
      };

      /* =====================================================
         GENERATE CANDIDATE START TIMES
      ===================================================== */

      const availableTimes: string[] =
        [];

      const bookingInterval =
        settings
          .booking_interval_minutes;

      /*
       * Never offer times that have already started.
       * Clinic time is Toronto time; holds reject past
       * times, so offering them only produced errors.
       */
      const clinicNowResult = await pool.query<{
        today: string;
        now_minutes: number;
      }>(
        `
          SELECT
            (
              CURRENT_TIMESTAMP
              AT TIME ZONE 'America/Toronto'
            )::date::text AS today,

            (
              EXTRACT(HOUR FROM CURRENT_TIMESTAMP AT TIME ZONE 'America/Toronto') * 60
              + EXTRACT(MINUTE FROM CURRENT_TIMESTAMP AT TIME ZONE 'America/Toronto')
            )::integer AS now_minutes;
        `,
      );

      const clinicNow =
        clinicNowResult.rows[0];

      // Earliest start still bookable on this date.
      const earliestStart =
        date < clinicNow.today
          ? Number.POSITIVE_INFINITY
          : date === clinicNow.today
            ? clinicNow.now_minutes + 1
            : 0;

      for (
        const block of blocksResult.rows
      ) {
        const blockStart =
          timeToMinutes(
            block.start_time,
          );

        const blockEnd =
          timeToMinutes(
            block.end_time,
          );

        /*
         * Generate starts using the booking
         * grid, but the selected reason's
         * duration determines whether the
         * entire appointment fits.
         */
        for (
          let candidateStart =
            blockStart;

          candidateStart +
            requestedDuration <=
          blockEnd;

          candidateStart +=
            bookingInterval
        ) {
          if (candidateStart < earliestStart) {
            continue;
          }

          const candidateEnd =
            candidateStart +
            requestedDuration;

          /*
           * Reject overlap with an existing
           * scheduled appointment.
           */
          const overlapsExisting =
            existingAppointments.some(
              (appointment) => {
                const existingStart =
                  timeToMinutes(
                    appointment.start_time,
                  );

                const existingEnd =
                  existingStart +
                  appointment
                    .duration_minutes;

                return (
                  candidateStart <
                    existingEnd &&
                  candidateEnd >
                    existingStart
                );
              },
            );

          if (overlapsExisting) {
            continue;
          }

          /*
           * Reject overlap with an active
           * temporary hold.
           */
          const overlapsHold =
            activeHolds.some(
              (hold) => {
                const holdStart =
                  timeToMinutes(
                    hold.start_time,
                  );

                const holdEnd =
                  holdStart +
                  hold.duration_minutes;

                return (
                  candidateStart <
                    holdEnd &&
                  candidateEnd >
                    holdStart
                );
              },
            );

          if (overlapsHold) {
            continue;
          }

          availableTimes.push(
            minutesToTime(
              candidateStart,
            ),
          );
        }
      }

      return response.status(200).json({
        date,

        doctor:
          doctorResult.rows[0],

        appointment_reason: {
          appointment_reason_id:
            appointmentReason
              .appointment_reason_id,

          name:
            appointmentReason
              .reason_name,

          duration_minutes:
            requestedDuration,

          appointment_type_id:
            appointmentTypeId,

          category_name:
            appointmentReason
              .category_name,
        },

        settings: {
          ...settings,

          booked_patients:
            bookedPatients,

          held_patients:
            heldPatients,

          remaining_patient_capacity:
            remainingCapacity,

          long_visits_booked:
            longVisitsTaken,

          long_visit_limit_reached:
            false,
        },

        available_times:
          availableTimes,
      });
    } catch (error) {
      console.error(
        "Error loading booking availability:",
        error,
      );

      return response.status(500).json({
        message:
          "Unable to load booking availability.",
      });
    }
  },
);


/* =========================================================
   GET DOCTOR APPOINTMENT SLOTS

   GET /api/doctors/:doctorId/slots?date=2026-07-30
========================================================= */

router.get(
  "/:doctorId/slots",
  requireStaffAuth,
  async (request, response) => {
    try {
      const doctorId =
        Number(
          request.params.doctorId,
        );

      const date =
        request.query.date;

      if (
        !Number.isInteger(doctorId) ||
        doctorId <= 0
      ) {
        return response
          .status(400)
          .json({
            message:
              "A valid doctor ID is required.",
          });
      }

      if (
        typeof date !== "string" ||
        date.trim() === ""
      ) {
        return response
          .status(400)
          .json({
            message:
              "A date is required in YYYY-MM-DD format.",
          });
      }

      // Built from the real schedule (see
      // scheduleAvailability.ts).
      return response
        .status(200)
        .json(
          await getDoctorDaySlots(doctorId, date),
        );
    } catch (error) {
      console.error(
        "Error getting appointment slots:",
        error,
      );

      return response
        .status(500)
        .json({
          message:
            "Unable to get appointment slots.",
        });
    }
  },
);

export default router;