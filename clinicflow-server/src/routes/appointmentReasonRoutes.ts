import express from "express";
import { pool } from "../db.js";

const router = express.Router();

/*
GET /api/appointment-reasons

Returns all active appointment reasons
with their category and configured duration.
*/
router.get("/", async (_request, response) => {
  try {
    const result = await pool.query(`
      SELECT
        ar.appointment_reason_id,
        ar.name,
        ar.duration_minutes,
        ar.description,
        ar.appointment_type_id,
        at.name AS category_name
      FROM appointment_reasons ar
      JOIN appointment_types at
        ON at.appointment_type_id =
          ar.appointment_type_id
      WHERE ar.is_active = TRUE
        AND at.is_active = TRUE
      ORDER BY
        ar.display_order,
        ar.name;
    `);

    response.status(200).json(result.rows);
  } catch (error) {
    console.error(
      "Error getting appointment reasons:",
      error,
    );

    response.status(500).json({
      message:
        "Unable to get appointment reasons.",
    });
  }
});

export default router;