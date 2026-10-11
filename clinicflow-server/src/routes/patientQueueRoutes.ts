import { Router } from "express";

import { pool } from "../db.js";
import { requirePatientAuth } from "../middleware/requirePatientAuth.js";

const router = Router();

router.get(
  "/today",
  requirePatientAuth,
  async (req, res) => {
    try {
      const { patientId } =
        (req as any).patientAuth;

      const result = await pool.query(
        `
          SELECT
            /*
             * Other patients are anonymous: no real
             * appointment id and no timestamps, only a
             * stand-in row number, their status, doctor and
             * how long they have waited.
             */
            CASE
              WHEN a.patient_id = $1
              THEN a.appointment_id
              ELSE -(ROW_NUMBER() OVER (
                ORDER BY a.checked_in_at, a.appointment_id
              ))::integer
            END AS appointment_id,
            a.status,
            CASE
              WHEN a.patient_id = $1 THEN a.checked_in_at
            END AS checked_in_at,
            CASE
              WHEN a.patient_id = $1 THEN a.roomed_at
            END AS roomed_at,

            d.doctor_id,
            d.first_name AS doctor_first_name,
            d.last_name AS doctor_last_name,

            CASE
              WHEN a.patient_id = $1
              THEN TRUE
              ELSE FALSE
            END AS is_current_patient,

            -- Only revealed for the signed-in patient.
            (a.patient_id = $1 AND a.walk_in_capacity_override) AS is_short_visit,

            CASE
              WHEN a.status = 'checked_in'
                AND a.checked_in_at IS NOT NULL
              THEN FLOOR(
                EXTRACT(
                  EPOCH FROM (
                    CURRENT_TIMESTAMP - a.checked_in_at
                  )
                ) / 60
              )
              ELSE 0
            END AS waiting_minutes

          FROM appointments AS a

          LEFT JOIN doctors AS d
            ON d.doctor_id = a.doctor_id

          WHERE
            a.appointment_date = (CURRENT_TIMESTAMP AT TIME ZONE 'America/Toronto')::date
            AND (
              a.status IN (
                'checked_in',
                'roomed'
              )

              -- The patient's own walk-in that has arrived
              -- but is not checked in yet, so they can see
              -- themselves straight away.
              OR (
                a.patient_id = $1
                AND a.visit_type = 'walk_in'
                AND a.status = 'scheduled'
              )
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
            a.roomed_at ASC NULLS LAST;
        `,
        [patientId],
      );

      return res.status(200).json(
        result.rows,
      );
    } catch (error) {
      console.error(
        "Patient live queue error:",
        error,
      );

      return res.status(500).json({
        message:
          "Unable to load the live queue.",
      });
    }
  },
);

router.get(
  "/summary",
  requirePatientAuth,
  async (_req, res) => {
    try {
      const result = await pool.query(
        `
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
                  WHERE
                    status IN (
                      'roomed',
                      'completed'
                    )
                    AND checked_in_at
                      IS NOT NULL
                    AND roomed_at
                      IS NOT NULL
                )
              ),
              0
            )::integer
              AS average_wait_minutes,

            COALESCE(
              FLOOR(
                MAX(
                  EXTRACT(
                    EPOCH FROM (
                      CURRENT_TIMESTAMP
                      - checked_in_at
                    )
                  ) / 60
                ) FILTER (
                  WHERE
                    status = 'checked_in'
                    AND checked_in_at
                      IS NOT NULL
                )
              ),
              0
            )::integer
              AS longest_wait_minutes,

            COUNT(*) FILTER (
              WHERE
                status IN (
                  'roomed',
                  'completed'
                )
                AND checked_in_at
                  IS NOT NULL
                AND roomed_at
                  IS NOT NULL
            )::integer
              AS patients_roomed_today

          FROM appointments

          WHERE
            appointment_date =
              (CURRENT_TIMESTAMP AT TIME ZONE 'America/Toronto')::date;
        `,
      );

      return res.status(200).json(
        result.rows[0],
      );
    } catch (error) {
      console.error(
        "Patient queue summary error:",
        error,
      );

      return res.status(500).json({
        message:
          "Unable to load queue statistics.",
      });
    }
  },
);

export default router;