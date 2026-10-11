import type {
  NextFunction,
  Response,
} from "express";

import { pool } from "../db.js";

import type {
  AuthenticatedRequest,
  StaffRole,
} from "./authMiddleware.js";

export function requireRole(
  ...allowedRoles: StaffRole[]
) {
  return (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ) => {
    const staffAuth = req.staff;

    if (!staffAuth) {
      return res.status(401).json({
        message:
          "Authentication required.",
      });
    }

    if (
      !allowedRoles.includes(
        staffAuth.role,
      )
    ) {
      return res.status(403).json({
        message:
          "You do not have permission to perform this action.",
      });
    }

    next();
  };
}

/*
 * Doctors may only act on their own provider record.
 * Admins and receptionists may act on any doctor.
 *
 * paramName is the route parameter holding the doctor ID.
 */
export function requireDoctorSelf(
  paramName = "doctorId",
) {
  return (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ) => {
    const staffAuth = req.staff;

    if (!staffAuth) {
      return res.status(401).json({
        message:
          "Authentication required.",
      });
    }

    if (staffAuth.role !== "doctor") {
      return next();
    }

    if (
      staffAuth.doctorId === null ||
      Number(req.params[paramName]) !==
        staffAuth.doctorId
    ) {
      return res.status(403).json({
        message:
          "Doctors can only update their own status.",
      });
    }

    next();
  };
}

/*
 * Doctors may only act on appointments assigned to them.
 * Admins and receptionists may act on any appointment.
 */
export function requireOwnAppointmentIfDoctor(
  paramName = "appointmentId",
) {
  return async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ) => {
    const staffAuth = req.staff;

    if (!staffAuth) {
      return res.status(401).json({
        message:
          "Authentication required.",
      });
    }

    if (staffAuth.role !== "doctor") {
      return next();
    }

    const appointmentId = Number(
      req.params[paramName],
    );

    if (
      !Number.isInteger(appointmentId) ||
      appointmentId <= 0
    ) {
      return res.status(400).json({
        message: "Invalid appointment ID.",
      });
    }

    try {
      const result = await pool.query<{
        doctor_id: number | null;
      }>(
        `
          SELECT doctor_id
          FROM appointments
          WHERE appointment_id = $1
        `,
        [appointmentId],
      );

      const appointment = result.rows[0];

      if (!appointment) {
        return res.status(404).json({
          message: "Appointment not found.",
        });
      }

      if (
        staffAuth.doctorId === null ||
        appointment.doctor_id !==
          staffAuth.doctorId
      ) {
        return res.status(403).json({
          message:
            "Doctors can only update their own appointments.",
        });
      }

      next();
    } catch (error) {
      console.error(
        "Appointment ownership check error:",
        error,
      );

      return res.status(500).json({
        message:
          "Unable to verify appointment access.",
      });
    }
  };
}
