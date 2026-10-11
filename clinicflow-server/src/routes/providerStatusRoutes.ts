import express from "express";
import { clinicToday } from "../clinicTimeZone.js";
import { pool } from "../db.js";
import { emitClinicUpdate } from "../socket.js";
import {
  type AuthenticatedRequest,
  requireAnyAuth,
  requireStaffAuth,
} from "../middleware/authMiddleware.js";
import { requireDoctorSelf } from "../middleware/requireRole.js";

const router = express.Router();

const allowedProviderStatuses = [
  "available",
  "in_consult",
  "unavailable",
] as const;

type ProviderStatus =
  (typeof allowedProviderStatuses)[number];

/*
GET /api/provider-status

Returns all active doctors and their current status.
*/
router.get("/", requireAnyAuth, async (request: AuthenticatedRequest, response) => {
  try {
    const result = await pool.query(`
      SELECT
        d.doctor_id,
        d.first_name,
        d.last_name,
        d.specialty,

        COALESCE(
          ps.current_status,
          'unavailable'
        ) AS current_status,

        ps.status_reason,
        ps.current_appointment_id,
        ps.status_updated_at,

        ps.estimated_ready_at,
        ps.readiness_estimate_minutes,
        ps.readiness_estimate_updated_at,

        dra.assignment_id,
        dra.assignment_date,
        dra.room_name,

        a.patient_id,
        a.start_time,
        a.status AS appointment_status,

        p.first_name AS patient_first_name,
        p.last_name AS patient_last_name,

        at.name AS appointment_type_name

      FROM doctors AS d

      LEFT JOIN provider_status AS ps
        ON ps.doctor_id = d.doctor_id

      LEFT JOIN doctor_room_assignments AS dra
        ON dra.doctor_id = d.doctor_id
       AND dra.assignment_date = (CURRENT_TIMESTAMP AT TIME ZONE 'America/Toronto')::date

      LEFT JOIN appointments AS a
        ON a.appointment_id = ps.current_appointment_id

      LEFT JOIN patients AS p
        ON p.patient_id = a.patient_id

      LEFT JOIN appointment_types AS at
        ON at.appointment_type_id = a.appointment_type_id

      WHERE d.is_active = TRUE

      ORDER BY
        d.last_name ASC,
        d.first_name ASC;
    `);

    // Patients may see doctor availability and rooms, but
    // never who the doctor is currently seeing.
    if (request.patientAuth) {
      return response.status(200).json(
        result.rows.map((row) => ({
          ...row,
          // Free text typed by staff/doctors; internal.
          status_reason: null,
          current_appointment_id: null,
          patient_id: null,
          patient_first_name: null,
          patient_last_name: null,
          start_time: null,
          appointment_status: null,
          appointment_type_name: null,
        })),
      );
    }

    return response.status(200).json(result.rows);
  } catch (error) {
    console.error(
      "Error getting provider statuses:",
      error,
    );

    return response.status(500).json({
      message: "Unable to get provider statuses.",
    });
  }
});

/*
PATCH /api/provider-status/:doctorId

Updates a doctor's operational status.
*/
router.patch("/:doctorId", requireStaffAuth, requireDoctorSelf(), async (request, response) => {
  const client = await pool.connect();

  try {
    const doctorId = Number(
      request.params.doctorId,
    );

    const {
      current_status,
      status_reason,
    } = request.body as {
      current_status?: ProviderStatus;
      status_reason?: string | null;
    };

    if (
      !Number.isInteger(doctorId) ||
      doctorId <= 0
    ) {
      return response.status(400).json({
        message: "Invalid doctor ID.",
      });
    }

    if (
      !current_status ||
      !allowedProviderStatuses.includes(
        current_status,
      )
    ) {
      return response.status(400).json({
        message:
          "Status must be available, in_consult, or unavailable.",
      });
    }

    await client.query("BEGIN");

    const doctorResult = await client.query(
      `
        SELECT doctor_id
        FROM doctors
        WHERE doctor_id = $1
          AND is_active = TRUE;
      `,
      [doctorId],
    );

    if (doctorResult.rows.length === 0) {
      await client.query("ROLLBACK");

      return response.status(404).json({
        message: "Active doctor not found.",
      });
    }

    /*
     * While a patient is roomed with this doctor, the
     * doctor can only leave "in consult" by completing
     * or cancelling that visit. Otherwise the patient
     * would be left in the room with no doctor attached.
     */
    /*
     * Lock this doctor's status row, as rooming does, so a
     * patient cannot be roomed between this check and the
     * status change below.
     */
    await client.query(
      `
        SELECT doctor_id
        FROM provider_status
        WHERE doctor_id = $1
        FOR UPDATE;
      `,
      [doctorId],
    );

    if (current_status !== "in_consult") {
      const activeVisitResult = await client.query(
        `
          SELECT a.appointment_id
          FROM provider_status AS ps
          JOIN appointments AS a
            ON a.appointment_id =
               ps.current_appointment_id
          WHERE ps.doctor_id = $1
            AND a.status = 'roomed'
          LIMIT 1;
        `,
        [doctorId],
      );

      if (activeVisitResult.rows.length > 0) {
        await client.query("ROLLBACK");

        return response.status(409).json({
          message:
            "This doctor has a patient in the room. Complete or cancel that visit first.",
        });
      }
    }

    const normalizedReason =
      current_status === "available"
        ? null
        : status_reason?.trim() || null;

    const result = await client.query(
      `
        INSERT INTO provider_status (
          doctor_id,
          current_status,
          status_reason,
          current_appointment_id,
          status_updated_at
        )
        VALUES (
          $1,
          $2,
          $3,
          NULL,
          CURRENT_TIMESTAMP
        )

        ON CONFLICT (doctor_id)
        DO UPDATE SET
          current_status =
            EXCLUDED.current_status,

          status_reason =
            EXCLUDED.status_reason,

          current_appointment_id =
            CASE
              WHEN EXCLUDED.current_status =
                   'available'
              THEN NULL
              ELSE provider_status
                   .current_appointment_id
            END,

            estimated_ready_at =
              CASE
                WHEN EXCLUDED.current_status = 'in_consult'
                THEN provider_status.estimated_ready_at
                ELSE NULL
              END,

            readiness_estimate_minutes =
              CASE
                WHEN EXCLUDED.current_status = 'in_consult'
                THEN provider_status.readiness_estimate_minutes
                ELSE NULL
              END,

            readiness_estimate_updated_at =
              CASE
                WHEN EXCLUDED.current_status = 'in_consult'
                THEN provider_status.readiness_estimate_updated_at
                ELSE NULL
              END,

    status_updated_at =
      CURRENT_TIMESTAMP

    

        RETURNING
          doctor_id,
          current_status,
          status_reason,
          current_appointment_id,
          status_updated_at;
      `,
      [
        doctorId,
        current_status,
        normalizedReason,
      ],
    );

    const updatedProvider = result.rows[0];

    await client.query("COMMIT");

emitClinicUpdate({
  type: "provider_status_changed",
  doctorId,
  status: updatedProvider.current_status,
});

return response
  .status(200)
  .json(updatedProvider);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);

    console.error(
      "Error updating provider status:",
      error,
    );

    return response.status(500).json({
      message: "Unable to update provider status.",
    });
  } finally {
    client.release();
  }
});

router.patch(
  "/:doctorId/complete-consult",
  requireStaffAuth, requireDoctorSelf(),
  async (req, res) => {
    const doctorId = Number(req.params.doctorId);

    if (!Number.isInteger(doctorId)) {
      return res.status(400).json({
        message: "Invalid doctor ID.",
      });
    }

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      const providerResult = await client.query(
        `
          SELECT
            doctor_id,
            current_status,
            current_appointment_id
          FROM provider_status
          WHERE doctor_id = $1
          FOR UPDATE
        `,
        [doctorId],
      );

      if (providerResult.rowCount === 0) {
        await client.query("ROLLBACK");

        return res.status(404).json({
          message: "Provider status was not found.",
        });
      }

      const provider = providerResult.rows[0];

      if (!provider.current_appointment_id) {
        await client.query("ROLLBACK");

        return res.status(409).json({
          message:
            "This doctor does not have an active consultation.",
        });
      }

      const appointmentResult = await client.query(
        `
          UPDATE appointments
          SET
            status = 'completed',
            consult_ended_at = CURRENT_TIMESTAMP,
            completed_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
          WHERE appointment_id = $1
            AND doctor_id = $2
            AND status = 'roomed'
          RETURNING
            appointment_id,
            patient_id,
            doctor_id,
            status,
            completed_at
        `,
        [
          provider.current_appointment_id,
          doctorId,
        ],
      );

      if (appointmentResult.rowCount === 0) {
        await client.query("ROLLBACK");

        return res.status(409).json({
          message:
            "The current appointment could not be completed. It may already be completed or is not roomed.",
        });
      }

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
        `,
        [doctorId],
      );

      await client.query("COMMIT");

      emitClinicUpdate({
  type: "consultation_completed",
  doctorId,
  appointmentId:
    provider.current_appointment_id,
});

      return res.json({
        message: "Consultation completed successfully.",
        appointment:
          appointmentResult.rows[0],
        provider_status: "available",
      });
    } catch (error) {
      await client.query("ROLLBACK");

      console.error(
        "Error completing consultation:",
        error,
      );

      return res.status(500).json({
        message:
          "Unable to complete the consultation.",
      });
    } finally {
      client.release();
    }
  },
);

router.patch("/:doctorId/room", requireStaffAuth, requireDoctorSelf(), async (req, res) => {
  const doctorId = Number(req.params.doctorId);
  const roomName =
    typeof req.body.room_name === "string"
      ? req.body.room_name.trim()
      : "";

  if (!Number.isInteger(doctorId) || doctorId <= 0) {
    return res.status(400).json({
      message: "Invalid doctor ID",
    });
  }

  try {
    const doctorResult = await pool.query(
      `
      SELECT doctor_id
      FROM doctors
      WHERE doctor_id = $1
        AND is_active = TRUE
      `,
      [doctorId],
    );

    if (doctorResult.rowCount === 0) {
      return res.status(404).json({
        message: "Doctor not found",
      });
    }

    // Selecting "No room assigned"
    if (!roomName) {
      await pool.query(
        `
        DELETE FROM doctor_room_assignments
        WHERE doctor_id = $1
          AND assignment_date = (CURRENT_TIMESTAMP AT TIME ZONE 'America/Toronto')::date
        `,
        [doctorId],
      );

      emitClinicUpdate({
        type: "room_assignment_changed",
        doctorId,
        roomName: null,
      });

      return res.json({
        doctor_id: doctorId,
        assignment_date: clinicToday(),
        room_name: null,
      });
    }

    const result = await pool.query(
      `
      INSERT INTO doctor_room_assignments (
        doctor_id,
        assignment_date,
        room_name
      )
      VALUES (
        $1,
        (CURRENT_TIMESTAMP AT TIME ZONE 'America/Toronto')::date,
        $2
      )

      ON CONFLICT (doctor_id, assignment_date)
      DO UPDATE SET
        room_name = EXCLUDED.room_name,
        updated_at = CURRENT_TIMESTAMP

      RETURNING
        assignment_id,
        doctor_id,
        assignment_date,
        room_name,
        updated_at
      `,
      [doctorId, roomName],
    );

    const updatedRoom = result.rows[0];

    emitClinicUpdate({
      type: "room_assignment_changed",
      doctorId,
      roomName: updatedRoom.room_name,
    });

    return res.json(updatedRoom);
    } catch (error) {
    // Rooms are unique per day: another doctor has it.
    if ((error as { code?: string }).code === "23505") {
      const holder = await pool
        .query<{ name: string }>(
          `
          SELECT CONCAT('Dr. ', d.last_name) AS name
          FROM doctor_room_assignments AS dra
          JOIN doctors AS d
            ON d.doctor_id = dra.doctor_id
          WHERE dra.room_name = $1
            AND dra.assignment_date = (CURRENT_TIMESTAMP AT TIME ZONE 'America/Toronto')::date
          LIMIT 1
          `,
          [roomName],
        )
        .catch(() => null);

      const name = holder?.rows[0]?.name;

      return res.status(409).json({
        message: name
          ? `${roomName} is already assigned to ${name} today.`
          : `${roomName} is already assigned to another doctor today.`,
      });
    }

    console.error("Error updating doctor room:", error);

    return res.status(500).json({
      message: "Unable to update doctor room",
    });
  }
});

/*
 * PATCH /api/provider-status/:doctorId/readiness
 *
 * Allows a physician who is currently in consult
 * to provide a rough estimate of when they expect
 * to be ready for their next patient.
 *
 * IMPORTANT:
 * This does NOT change the provider's real status.
 * They remain "in_consult".
 */
router.patch(
  "/:doctorId/readiness",
  requireStaffAuth, requireDoctorSelf(),
  async (request, response) => {
    const doctorId =
      Number(request.params.doctorId);

    const { minutes } = request.body;

    if (!Number.isInteger(doctorId)) {
      return response.status(400).json({
        message: "Invalid doctor ID.",
      });
    }

    if (
      !Number.isInteger(minutes) ||
      minutes < 1 ||
      minutes > 60
    ) {
      return response.status(400).json({
        message:
          "Readiness estimate must be between 1 and 60 minutes.",
      });
    }

    try {
      const result = await pool.query(
        `
          UPDATE provider_status
          SET
            readiness_estimate_minutes = $1::integer,

            estimated_ready_at =
              CURRENT_TIMESTAMP
              + make_interval(
                  mins => $1::integer
                ),

            readiness_estimate_updated_at =
              CURRENT_TIMESTAMP

          WHERE doctor_id = $2
            AND current_status = 'in_consult'

          RETURNING *
        `,
        [
          minutes,
          doctorId,
        ],
      );

      if (result.rowCount === 0) {
        return response.status(409).json({
          message:
            "Readiness estimates can only be updated while the physician is in consult.",
        });
      }

      emitClinicUpdate({
        type: "provider_readiness_changed",
        doctorId,
      });

      return response.status(200).json(
        result.rows[0],
      );
    } catch (error) {
      console.error(
        "Error updating readiness estimate:",
        error,
      );

      return response.status(500).json({
        message:
          "Unable to update readiness estimate.",
      });
    }
  },
);

export default router;