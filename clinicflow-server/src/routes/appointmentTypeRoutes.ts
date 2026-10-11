import express from "express";
import { pool } from "../db.js";

const router = express.Router();

/*
GET /api/appointment-types

Returns all active appointment types
for the Book Appointment dropdown.
*/
router.get("/", async (_request, response) => {
  try {
    const result = await pool.query(`
      SELECT
        appointment_type_id,
        name,
        default_duration_minutes,
        description
      FROM appointment_types
      WHERE is_active = TRUE
      ORDER BY name;
    `);

    response.status(200).json(result.rows);
  } catch (error) {
    console.error("Error getting appointment types:", error);

    response.status(500).json({
      message: "Unable to get appointment types.",
    });
  }
});

/*
GET /api/appointment-reasons

Returns all active appointment reasons
with their category and configured duration.
*/
router.get("/reasons/all", async (_request, response) => {
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