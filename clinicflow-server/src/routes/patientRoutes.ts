import express from "express";
import { pool } from "../db.js";
import { formatPersonName } from "../utils/formatPersonName.js";
import { requireStaffAuth } from "../middleware/authMiddleware.js";
import { requireRole } from "../middleware/requireRole.js";

const router = express.Router();

// Patient records may be read by any staff member but only
// created or edited by the front desk and admins.

// GET /api/patients
// Retrieves all patients
router.get("/", requireStaffAuth, async (_request, response) => {
  try {
    const result = await pool.query(`
      SELECT
        patient_id,
        first_name,
        last_name,
        date_of_birth,
        phone,
        email,
        status
      FROM patients
      ORDER BY patient_id;
    `);

    response.json(result.rows);
  } catch (error) {
    console.error("Error loading patients:", error);

    response.status(500).json({
      message: "Could not load patients",
    });
  }
});

// POST /api/patients
// Creates a new patient
router.post("/", requireStaffAuth, requireRole("admin", "receptionist"), async (request, response) => {
  try {
    const {
      first_name,
      last_name,
      date_of_birth,
      phone,
      email,
      address_line,
      city,
      province,
      postal_code,
      emergency_contact_name,
      emergency_contact_phone,
      notes,
    } = request.body;

    if (!first_name || !last_name || !date_of_birth) {
      return response.status(400).json({
        message:
          "First name, last name, and date of birth are required.",
      });
    }

    const result = await pool.query(
      `
        INSERT INTO patients (
          first_name,
          last_name,
          date_of_birth,
          phone,
          email,
          address_line,
          city,
          province,
          postal_code,
          emergency_contact_name,
          emergency_contact_phone,
          notes
        )
        VALUES (
          $1, $2, $3, $4, $5, $6,
          $7, $8, $9, $10, $11, $12
        )
        RETURNING *;
      `,
      [
        formatPersonName(first_name),
        formatPersonName(last_name),
        date_of_birth,
        phone || null,
        email || null,
        address_line || null,
        city || null,
        province || null,
        postal_code || null,
        emergency_contact_name || null,
        emergency_contact_phone || null,
        notes || null,
      ]
    );

    response.status(201).json({
      message: "Patient added successfully",
      patient: result.rows[0],
    });
  } catch (error) {
    console.error("Error adding patient:", error);

    response.status(500).json({
      message: "Could not add patient",
    });
  }
});

router.get("/:patientId", requireStaffAuth, async (req, res) => {
  try {
    const patientId = Number(req.params.patientId);

    if (!Number.isInteger(patientId)) {
      return res.status(400).json({
        message: "Invalid patient ID.",
      });
    }

    const result = await pool.query(
      `
      SELECT
        p.patient_id,
        p.first_name,
        p.last_name,
        p.date_of_birth,
        p.phone,
        p.email,
        p.address_line,
        p.city,
        p.province,
        p.postal_code,
        p.emergency_contact_name,
        p.emergency_contact_phone,
        p.primary_doctor_id,
        p.notes,
        p.status,

        d.first_name AS primary_doctor_first_name,
        d.last_name AS primary_doctor_last_name,
        d.specialty AS primary_doctor_specialty

      FROM patients p

      LEFT JOIN doctors d
        ON d.doctor_id = p.primary_doctor_id

      WHERE p.patient_id = $1
      `,
      [patientId],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: "Patient not found.",
      });
    }

    return res.json(result.rows[0]);
  } catch (error) {
    console.error(
      "Error getting patient profile:",
      error,
    );

    return res.status(500).json({
      message: "Unable to get patient profile.",
    });
  }
});

router.put("/:patientId", requireStaffAuth, requireRole("admin", "receptionist"), async (req, res) => {
  try {
    const patientId = Number(req.params.patientId);

    if (!Number.isInteger(patientId)) {
      return res.status(400).json({
        message: "Invalid patient ID.",
      });
    }

    const {
      first_name,
      last_name,
      date_of_birth,
      phone,
      email,
      address_line,
      city,
      province,
      postal_code,
      emergency_contact_name,
      emergency_contact_phone,
      primary_doctor_id,
      notes,
    } = req.body;

    if (
      !first_name ||
      !last_name ||
      !date_of_birth
    ) {
      return res.status(400).json({
        message:
          "First name, last name, and date of birth are required.",
      });
    }

    const result = await pool.query(
      `
      UPDATE patients
      SET
        first_name = $1,
        last_name = $2,
        date_of_birth = $3,
        phone = $4,
        email = $5,
        address_line = $6,
        city = $7,
        province = $8,
        postal_code = $9,
        emergency_contact_name = $10,
        emergency_contact_phone = $11,
        primary_doctor_id = $12,
        notes = $13,
        updated_at = CURRENT_TIMESTAMP

      WHERE patient_id = $14

      RETURNING *
      `,
      [
        formatPersonName(first_name),
        formatPersonName(last_name),
        date_of_birth,
        phone?.trim() || null,
        email?.trim() || null,
        address_line?.trim() || null,
        city?.trim() || null,
        province?.trim() || "Ontario",
        postal_code?.trim() || null,
        emergency_contact_name?.trim() || null,
        emergency_contact_phone?.trim() || null,
        primary_doctor_id || null,
        notes?.trim() || null,
        patientId,
      ],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: "Patient not found.",
      });
    }

    return res.json({
      message: "Patient updated successfully.",
      patient: result.rows[0],
    });
  } catch (error) {
    console.error(
      "Error updating patient:",
      error,
    );

    return res.status(500).json({
      message: "Unable to update patient.",
    });
  }
});

// PATCH /api/patients/:patientId/status
// Updates a patient's active/inactive status
router.patch("/:patientId/status", requireStaffAuth, requireRole("admin", "receptionist"), async (request, response) => {
  try {
    const patientId = Number(request.params.patientId);
    const { status } = request.body ?? {};

    if (!Number.isInteger(patientId)) {
      return response.status(400).json({
        message: "Invalid patient ID.",
      });
    }

    if (!status) {
      return response.status(400).json({
        message: "Patient status is required.",
      });
    }

    const allowedStatuses = ["active", "inactive"];

    if (!allowedStatuses.includes(status)) {
      return response.status(400).json({
        message: "Status must be active or inactive.",
      });
    }

    const result = await pool.query(
      `
        UPDATE patients
        SET
          status = $1,
          updated_at = CURRENT_TIMESTAMP
        WHERE patient_id = $2
        RETURNING
          patient_id,
          first_name,
          last_name,
          date_of_birth,
          phone,
          email,
          status;
      `,
      [status, patientId]
    );

    if (result.rows.length === 0) {
      return response.status(404).json({
        message: "Patient not found.",
      });
    }

    return response.json({
      message: "Patient status updated successfully.",
      patient: result.rows[0],
    });
  } catch (error) {
    console.error("Error updating patient status:", error);

    return response.status(500).json({
      message: "Patient status could not be updated.",
    });
  }
});

export default router;