import express from "express";
import { pool } from "../db.js";
import { requireAnyAuth } from "../middleware/authMiddleware.js";

const router = express.Router();

/*
GET /api/dashboard/summary
Returns live dashboard KPI values.
*/
router.get("/summary", requireAnyAuth, async (_request, response) => {
  try {
    const [appointmentResult, roomResult] =
      await Promise.all([
        pool.query(`
          SELECT
            COUNT(*) FILTER (
              WHERE status <> 'cancelled'
            )::int AS patients_today,

            COUNT(*) FILTER (
              WHERE status = 'checked_in'
            )::int AS patients_waiting,

            COUNT(*) FILTER (
              WHERE checked_in_at IS NOT NULL
            )::int AS checked_in_today,

            -- Same definition as the wait-time analytics:
            -- check-in -> roomed, 0-12 h. NULL when no
            -- one has been roomed yet today (not 0).
            ROUND(
              AVG(
                EXTRACT(
                  EPOCH FROM (
                    roomed_at - checked_in_at
                  )
                ) / 60
              ) FILTER (
                WHERE checked_in_at IS NOT NULL
                  AND roomed_at IS NOT NULL
                  AND roomed_at - checked_in_at
                    BETWEEN INTERVAL '0 minutes'
                    AND INTERVAL '12 hours'
              )
            )::int AS average_wait_minutes

          FROM appointments
          WHERE appointment_date = (CURRENT_TIMESTAMP AT TIME ZONE 'America/Toronto')::date;
        `),

        pool.query(`
          SELECT
            COUNT(DISTINCT dra.room_name)::int
              AS rooms_assigned,

            COUNT(DISTINCT dra.room_name) FILTER (
              WHERE ps.current_status = 'in_consult'
            )::int AS rooms_occupied

          FROM doctor_room_assignments AS dra

          LEFT JOIN provider_status AS ps
            ON ps.doctor_id = dra.doctor_id

          WHERE dra.assignment_date = (CURRENT_TIMESTAMP AT TIME ZONE 'America/Toronto')::date;
        `),
      ]);

    const appointmentStats =
      appointmentResult.rows[0];

    const roomStats = roomResult.rows[0];

    // Number of examination rooms: EXAM_ROOM_COUNT in .env
    // (keep it the same as VITE_EXAM_ROOM_COUNT in the web
    // app).
    const configuredRooms = Number(process.env.EXAM_ROOM_COUNT ?? 6);
    const totalRooms =
      Number.isInteger(configuredRooms) && configuredRooms > 0
        ? configuredRooms
        : 6;

    return response.status(200).json({
      patients_today:
        appointmentStats.patients_today,

      average_wait_minutes:
        appointmentStats.average_wait_minutes,

      patients_waiting:
        appointmentStats.patients_waiting,

      checked_in_today:
        appointmentStats.checked_in_today,

      rooms_assigned:
        roomStats.rooms_assigned,

      rooms_occupied:
        roomStats.rooms_occupied,

      total_rooms: totalRooms,

      rooms_available: Math.max(
        totalRooms - roomStats.rooms_assigned,
        0,
      ),
    });
  } catch (error) {
    console.error(
      "Error getting dashboard summary:",
      error,
    );

    return response.status(500).json({
      message: "Unable to get dashboard summary.",
    });
  }
});

export default router;