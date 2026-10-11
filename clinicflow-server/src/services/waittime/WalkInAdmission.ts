import { pool } from "../../db.js";

import { buildClinicState } from "./ClinicStateBuilder.js";

import {
  checkWalkInAdmission,
  type WalkInAdmission,
} from "./PredictionEngine.js";

export type WalkInAdmissionResult = WalkInAdmission & {
  appointmentTypeName: string;
  projectedDoctorName: string | null;
  checkedAt: string;
};

/*
 * Runs the walk-in admission check against the live
 * clinic: can a new walk-in of this visit type be seen,
 * start to finish, in the walk-in hours open now?
 *
 * Shared by Add Walk-In (preview) and walk-in creation
 * (enforcement), so both use exactly the same rule.
 *
 * Returns null if the appointment type does not exist.
 */
export async function evaluateWalkInAdmission(input: {
  appointmentTypeId: number;
  assignmentMode: "auto" | "manual";
  doctorId: number | null;
}): Promise<WalkInAdmissionResult | null> {
  const typeResult = await pool.query<{
    name: string;
    default_duration_minutes: number;
  }>(
    `
      SELECT name, default_duration_minutes
      FROM appointment_types
      WHERE appointment_type_id = $1
        AND is_active = TRUE
    `,
    [input.appointmentTypeId],
  );

  const appointmentType = typeResult.rows[0];

  if (!appointmentType) {
    return null;
  }

  const now = new Date();
  const state = await buildClinicState(now);

  const admission = checkWalkInAdmission(state, now, {
    appointmentTypeId: input.appointmentTypeId,
    durationMinutes:
      appointmentType.default_duration_minutes,
    assignmentMode: input.assignmentMode,
    doctorId: input.doctorId,
  });

  const doctor = state.providers.find(
    (provider) =>
      provider.doctorId === admission.projectedDoctorId,
  );

  return {
    ...admission,
    appointmentTypeName: appointmentType.name,
    projectedDoctorName: doctor
      ? `${doctor.firstName} ${doctor.lastName}`
      : null,
    checkedAt: now.toISOString(),
  };
}
