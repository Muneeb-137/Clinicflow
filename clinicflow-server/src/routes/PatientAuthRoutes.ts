import { Router } from "express";
import { notifyBookingChange } from "../services/patientNotifications.js";
import { revokeSessionFromRequest } from "../services/accountSecurity.js";
import {
  createAccountSecurityRouter,
  finishPasswordSignIn,
  patientAdapter,
} from "./accountSecurityRoutes.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import crypto from "crypto";

import { pool } from "../db.js";
import { sendPatientVerificationEmail } from "../services/emailService.js";
import { requirePatientAuth } from "../middleware/requirePatientAuth.js";
import { formatPersonName } from "../utils/formatPersonName.js";
import { emitClinicUpdate } from "../socket.js";
import { authRateLimit } from "../middleware/rateLimit.js";
import type { AuthenticatedRequest } from "../middleware/authMiddleware.js";
import {
  clearSessionCookie,
  PATIENT_COOKIE,
  setSessionCookie,
} from "../middleware/authCookies.js";

const router = Router();

/*
 * Appointment fields a patient may see about their own
 * visits. Never return a.* / RETURNING * to patients: the
 * row also holds staff-only data (internal notes,
 * follow-up notes and reasons, capacity override, slot
 * and assignment internals).
 */
const PATIENT_APPOINTMENT_COLUMNS = `
  appointment_id,
  patient_id,
  doctor_id,
  appointment_type_id,
  appointment_reason_id,
  appointment_date,
  start_time,
  duration_minutes,
  status,
  visit_type,
  booking_channel,
  reason_for_visit,
  cancelled_by,
  cancellation_reason,
  missed_reason,
  follow_up_status,
  rebooked_from_appointment_id,
  rescheduled_to_appointment_id
`;

const prefixed = (alias: string) =>
  PATIENT_APPOINTMENT_COLUMNS.split(",")
    .map((column) => `${alias}.${column.trim()}`)
    .join(",\n");

const MIN_PASSWORD_LENGTH = 8;

// Patients can move a booked visit online until this many
// hours before it (RESCHEDULE_CUTOFF_HOURS in .env).
const RESCHEDULE_CUTOFF_HOURS = (() => {
  const hours = Number(process.env.RESCHEDULE_CUTOFF_HOURS ?? 2);
  return Number.isFinite(hours) && hours >= 0 ? hours : 2;
})();

// Minimum time between verification emails to one address.
const RESEND_COOLDOWN_MS = 60_000;

const lastResendByEmail =
  new Map<string, number>();

// 5 wrong passwords per account per 15 minutes, and 30
// failed sign-ins from one IP address.
const patientLoginLimit = authRateLimit({
  name: "patient-login",
  windowMs: 15 * 60_000,
  maxPerAccount: 5,
  maxPerIp: 30,
});

// Verification links are random, but stop anyone
// hammering the endpoint with guesses.
const verifyEmailLimit = authRateLimit({
  name: "verify-email",
  windowMs: 15 * 60_000,
  maxPerAccount: 10,
  maxPerIp: 20,
  accountField: "token",
  failureStatuses: [400, 404],
});

// Per-email cooldown is handled in the route; this caps
// one IP requesting emails for many addresses.
const resendLimit = authRateLimit({
  name: "resend-verification",
  windowMs: 60 * 60_000,
  maxPerAccount: 10,
  maxPerIp: 10,
  countAllAttempts: true,
});

const RESEND_GENERIC_MESSAGE =
  "If an unverified account exists for that email, a new verification email has been sent.";

/*
 * Registration: each one sends an email and creates an
 * account, so it is limited per address and per email.
 */
const registerLimit = authRateLimit({
  name: "patient-register",
  windowMs: 60 * 60_000,
  maxPerAccount: 3,
  maxPerIp: 10,
  countAllAttempts: true,
});

router.post("/register", registerLimit, async (req, res) => {
  const client = await pool.connect();

  let committed = false;

  try {
    const {
      first_name,
      last_name,
      date_of_birth,
      phone,
      email,
      password,

      address_line,
      city,
      province,
      postal_code,

      emergency_contact_name,
      emergency_contact_phone,
    } = req.body;

    if (
      !first_name ||
      !last_name ||
      !date_of_birth ||
      !phone ||
      !email ||
      !password
    ) {
      return res.status(400).json({
        message: "Please complete all required fields.",
      });
    }

    if (
      typeof email !== "string" ||
      typeof password !== "string"
    ) {
      return res.status(400).json({
        message: "Invalid email or password.",
      });
    }

    if (password.length < MIN_PASSWORD_LENGTH) {
      return res.status(400).json({
        message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
      });
    }

    const normalizedEmail = email
      .trim()
      .toLowerCase();

    await client.query("BEGIN");

    /*
     * Prevent duplicate patient login accounts.
     */
    const existingAccount = await client.query(
      `
        SELECT patient_user_id
        FROM patient_users
        WHERE LOWER(email) = LOWER($1)
      `,
      [normalizedEmail],
    );

    if (existingAccount.rows.length > 0) {
      await client.query("ROLLBACK");

      return res.status(409).json({
        message:
          "An account already exists with this email.",
      });
    }

    /*
     * If the front desk already has a chart for this
     * person, link the login to it instead of creating a
     * duplicate patient.
     *
     * Match on email + date of birth, only for active
     * charts that do not have a login yet. The account
     * still cannot be used until the email is verified,
     * which proves the person controls the email on the
     * chart. The chart's details are left unchanged.
     */
    const existingChartResult =
      await client.query<{
        patient_id: number;
      }>(
        `
          SELECT p.patient_id
          FROM patients AS p
          WHERE LOWER(p.email) = LOWER($1)
            AND p.date_of_birth = $2::date
            AND p.status = 'active'
            AND NOT EXISTS (
              SELECT 1
              FROM patient_users AS pu
              WHERE pu.patient_id = p.patient_id
            )
          ORDER BY p.patient_id
          FOR UPDATE OF p
        `,
        [normalizedEmail, date_of_birth],
      );

    // Only link when exactly one chart matches, so an
    // ambiguous match never picks the wrong person.
    const linkedPatientId =
      existingChartResult.rows.length === 1
        ? existingChartResult.rows[0].patient_id
        : null;

    /*
     * Otherwise create the patient profile.
     */
    const patientResult = linkedPatientId
      ? { rows: [{ patient_id: linkedPatientId }] }
      : await client.query(
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
          emergency_contact_phone
        )
        VALUES (
          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          $7,
          $8,
          $9,
          $10,
          $11
        )
        RETURNING patient_id
      `,
        [
          formatPersonName(first_name),
          formatPersonName(last_name),
          date_of_birth,
          phone,
          normalizedEmail,
          address_line || null,
          city || null,
          province || "Ontario",
          postal_code || null,
          emergency_contact_name || null,
          emergency_contact_phone || null,
        ],
    );

    const patientId =
      patientResult.rows[0].patient_id;

    /*
     * Hash the password.
     */
    const passwordHash = await bcrypt.hash(
      password,
      12,
    );

    /*
     * Generate a random email verification token.
     */
    const verificationToken =
      crypto.randomBytes(32).toString("hex");

    /*
     * We don't store the raw verification token.
     */
    const verificationTokenHash = crypto
      .createHash("sha256")
      .update(verificationToken)
      .digest("hex");

    const verificationExpires =
      new Date(Date.now() + 30 * 60 * 1000);

    /*
     * Create login account connected to patient.
     */
    await client.query(
      `
        INSERT INTO patient_users (
          patient_id,
          email,
          password_hash,
          email_verified,
          verification_token_hash,
          verification_token_expires_at
        )
        VALUES (
          $1,
          $2,
          $3,
          FALSE,
          $4,
          $5
        )
      `,
      [
        patientId,
        normalizedEmail,
        passwordHash,
        verificationTokenHash,
        verificationExpires,
      ],
    );

  await client.query("COMMIT");
committed = true;

try {
  await sendPatientVerificationEmail(
  normalizedEmail,
  formatPersonName(first_name),
  verificationToken,
);

  return res.status(201).json({
    message:
      "Account created. Please verify your email before signing in.",
    emailSent: true,
  });
} catch (emailError) {
  console.error(
    "Verification email failed:",
    emailError,
  );

  return res.status(201).json({
    message:
      "Account created, but the verification email could not be sent.",
    emailSent: false,
  });
}
  } catch (error) {
  if (!committed) {
    await client.query("ROLLBACK");
  }

    console.error(
      "Patient registration error:",
      error,
    );

    return res.status(500).json({
      message:
        "Unable to create patient account.",
    });
  } finally {
    client.release();
  }
});

router.post("/verify-email", verifyEmailLimit, async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({
        message: "Verification token is required.",
      });
    }

    const tokenHash = crypto
      .createHash("sha256")
      .update(token)
      .digest("hex");

    const result = await pool.query(
      `
        SELECT patient_user_id
        FROM patient_users
        WHERE verification_token_hash = $1
          AND verification_token_expires_at > NOW()
          AND email_verified = FALSE
      `,
      [tokenHash],
    );

    if (result.rows.length === 0) {
      return res.status(400).json({
        message:
          "This verification link is invalid or has expired.",
      });
    }

    const patientUserId =
      result.rows[0].patient_user_id;

    await pool.query(
      `
        UPDATE patient_users
        SET
          email_verified = TRUE,
          verification_token_hash = NULL,
          verification_token_expires_at = NULL,
          updated_at = NOW()
        WHERE patient_user_id = $1
      `,
      [patientUserId],
    );

    return res.json({
      message: "Email successfully verified.",
    });
  } catch (error) {
    console.error(
      "Patient verification error:",
      error,
    );

    return res.status(500).json({
      message: "Unable to verify email.",
    });
  }
});

router.post("/resend-verification", resendLimit, async (req, res) => {
  try {
    const { email } = req.body;

    if (!email || typeof email !== "string") {
      return res.status(400).json({
        message: "Email is required.",
      });
    }

    const normalizedEmail = email
      .trim()
      .toLowerCase();

    /*
     * Always answer the same way whether or not the
     * account exists, so this endpoint cannot be used to
     * discover registered emails. Throttle per address so
     * it cannot be used to flood someone's inbox.
     */
    const now = Date.now();

    const lastResendAt =
      lastResendByEmail.get(normalizedEmail);

    if (
      lastResendAt !== undefined &&
      now - lastResendAt < RESEND_COOLDOWN_MS
    ) {
      return res.status(429).json({
        message:
          "Please wait a minute before requesting another email.",
      });
    }

    lastResendByEmail.set(normalizedEmail, now);

    const result = await pool.query(
      `
        SELECT
          pu.patient_user_id,
          pu.email_verified,
          p.first_name
        FROM patient_users pu
        JOIN patients p
          ON p.patient_id = pu.patient_id
        WHERE LOWER(pu.email) = LOWER($1)
      `,
      [normalizedEmail],
    );

    const patient = result.rows[0];

    if (!patient || patient.email_verified) {
      return res.json({
        message: RESEND_GENERIC_MESSAGE,
      });
    }

    const verificationToken =
      crypto.randomBytes(32).toString("hex");

    const verificationTokenHash = crypto
      .createHash("sha256")
      .update(verificationToken)
      .digest("hex");

    const verificationExpires =
      new Date(Date.now() + 30 * 60 * 1000);

    await pool.query(
      `
        UPDATE patient_users
        SET
          verification_token_hash = $1,
          verification_token_expires_at = $2,
          updated_at = NOW()
        WHERE patient_user_id = $3
      `,
      [
        verificationTokenHash,
        verificationExpires,
        patient.patient_user_id,
      ],
    );

    await sendPatientVerificationEmail(
      normalizedEmail,
      patient.first_name,
      verificationToken,
    );

    return res.json({
      message: RESEND_GENERIC_MESSAGE,
    });
  } catch (error) {
    console.error(
      "Resend verification error:",
      error,
    );

    return res.status(500).json({
      message:
        "Unable to resend verification email.",
    });
  }
});

router.post("/login", patientLoginLimit, async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        message:
          "Email and password are required.",
      });
    }

    const normalizedEmail = email
      .trim()
      .toLowerCase();

    const result = await pool.query(
      `
        SELECT
          pu.patient_user_id,
          pu.patient_id,
          pu.email,
          pu.password_hash,
          pu.email_verified,
          pu.is_active,

          p.first_name,
          p.last_name

        FROM patient_users pu

        JOIN patients p
          ON p.patient_id = pu.patient_id

        WHERE LOWER(pu.email) = LOWER($1)
      `,
      [normalizedEmail],
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        message:
          "Invalid email or password.",
      });
    }

    const patient = result.rows[0];

    const passwordMatches =
      await bcrypt.compare(
        password,
        patient.password_hash,
      );

    if (!passwordMatches) {
      return res.status(401).json({
        message:
          "Invalid email or password.",
      });
    }

    if (!patient.email_verified) {
      return res.status(403).json({
        code: "EMAIL_NOT_VERIFIED",
        message:
          "Please verify your email before signing in.",
      });
    }

    if (!patient.is_active) {
      return res.status(403).json({
        message:
          "This account is currently inactive.",
      });
    }

    /*
     * Password accepted. Second step: an emailed code,
     * unless this browser is a trusted device.
     */
    const account = await patientAdapter.loadById(
      patient.patient_user_id,
    );

    if (!account) {
      return res.status(401).json({
        message:
          "Invalid email or password.",
      });
    }

    return finishPasswordSignIn(
      patientAdapter,
      account,
      req,
      res,
    );
  } catch (error) {
    console.error(
      "Patient login error:",
      error,
    );

    return res.status(500).json({
      message: "Unable to sign in.",
    });
  }
});

/*
 * GET /api/patient-auth/me
 *
 * Returns the signed-in patient. The web app calls this
 * on page load to restore the session from the cookie.
 */
router.get(
  "/me",
  requirePatientAuth,
  async (req: AuthenticatedRequest, res) => {
    try {
      const result = await pool.query(
        `
          SELECT
            pu.patient_user_id,
            pu.patient_id,
            pu.email,
            p.first_name,
            p.last_name
          FROM patient_users AS pu
          JOIN patients AS p
            ON p.patient_id = pu.patient_id
          WHERE pu.patient_user_id = $1
        `,
        [req.patientAuth?.patientUserId],
      );

      if (result.rows.length === 0) {
        return res.status(401).json({
          message:
            "Your patient session is invalid or has expired.",
        });
      }

      return res.json({
        patient: result.rows[0],
      });
    } catch (error) {
      console.error(
        "Get current patient error:",
        error,
      );

      return res.status(500).json({
        message:
          "Unable to load your account.",
      });
    }
  },
);

/*
 * POST /api/patient-auth/logout
 *
 * Clears the patient session cookie.
 */
router.post("/logout", async (req, res) => {
  // Close the session itself, not only the cookie.
  await revokeSessionFromRequest("patient", req).catch(
    (error) => console.error("Sign-out error:", error),
  );

  clearSessionCookie(res, PATIENT_COOKIE);

  return res.json({
    message: "Signed out.",
  });
});

router.get(
  "/me/appointments",
  requirePatientAuth,
  async (req, res) => {
    try {
      const { patientId } =
        (req as any).patientAuth;

      const result = await pool.query(
        `
          SELECT
            ${prefixed("a")},

            d.first_name AS doctor_first_name,
            d.last_name AS doctor_last_name,

            at.name AS appointment_type_name

          FROM appointments a

          LEFT JOIN doctors d
            ON d.doctor_id = a.doctor_id

          LEFT JOIN appointment_types at
            ON at.appointment_type_id =
              a.appointment_type_id

          WHERE a.patient_id = $1

          ORDER BY
            a.appointment_date ASC,
            a.start_time ASC
        `,
        [patientId],
      );

      return res.json({
        appointments: result.rows,
      });
    } catch (error) {
      console.error(
        "Patient appointments error:",
        error,
      );

      return res.status(500).json({
        message:
          "Unable to load your appointments.",
      });
    }
  },
);

router.post(
  "/me/appointments",
  requirePatientAuth,
  async (req, res) => {
    const client = await pool.connect();

    try {
      const { patientId } =
        (req as any).patientAuth;

      const {
        doctor_id,
        appointment_date,
        start_time,
        reason_for_visit,
        notes,
        hold_token,
        rebooked_from_appointment_id,
        // Moving an existing booked visit to this new time.
        reschedule_from_appointment_id,
      } = req.body;

        if (
          !doctor_id ||
          !appointment_date ||
          !start_time ||
          !hold_token
        ) {
          return res.status(400).json({
            message:
              "Doctor, appointment type, date, time, and appointment hold are required.",
          });
        }

        if (
          typeof hold_token !== "string" ||
          !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
            hold_token,
          )
        ) {
          return res.status(400).json({
            message: "Invalid appointment hold.",
          });
        }

      await client.query("BEGIN");

      /*
       * Same doctor/date lock as staff booking and holds,
       * so two bookings for one doctor and day are checked
       * one after the other.
       */
      await client.query(
        `
          SELECT pg_advisory_xact_lock(
            $1::integer,
            ($2::date - DATE '2000-01-01')::integer
          );
        `,
        [doctor_id, appointment_date],
      );

      /*
       * Rescheduling: the old visit must be the patient's
       * own, still booked, and not too close. It is
       * cancelled first, inside this transaction, so the new
       * time may overlap it (same doctor, a bit later); if
       * the new booking fails, everything rolls back and the
       * old visit stays as it was.
       */
      let rescheduleSource: {
        appointment_id: number;
        doctor_id: number;
        appointment_date: string;
      } | null = null;

      if (reschedule_from_appointment_id) {
        if (rebooked_from_appointment_id) {
          await client.query("ROLLBACK");

          return res.status(400).json({
            message: "Send either a rebook or a reschedule, not both.",
          });
        }

        const sourceResult = await client.query<{
          appointment_id: number;
          doctor_id: number;
          appointment_date: string;
          too_late: boolean;
        }>(
          `
            SELECT
              appointment_id,
              doctor_id,
              appointment_date::text AS appointment_date,
              (appointment_date + start_time)
                - (CURRENT_TIMESTAMP AT TIME ZONE 'America/Toronto')
                < make_interval(hours => $3) AS too_late
            FROM appointments
            WHERE appointment_id = $1
              AND patient_id = $2
              AND visit_type = 'scheduled'
              AND status = 'scheduled'
              AND start_time IS NOT NULL
              AND rescheduled_to_appointment_id IS NULL
            FOR UPDATE
          `,
          [
            Number(reschedule_from_appointment_id),
            patientId,
            RESCHEDULE_CUTOFF_HOURS,
          ],
        );

        const source = sourceResult.rows[0];

        if (!source) {
          await client.query("ROLLBACK");

          return res.status(409).json({
            message:
              "This appointment can no longer be rescheduled. It may have been cancelled or already moved.",
          });
        }

        if (source.too_late) {
          await client.query("ROLLBACK");

          return res.status(409).json({
            message: `Your appointment is less than ${RESCHEDULE_CUTOFF_HOURS} hours away. Please call the clinic to change it.`,
          });
        }

        await client.query(
          `
            UPDATE appointments
            SET
              status = 'cancelled',
              cancelled_at = CURRENT_TIMESTAMP,
              cancelled_by = 'patient',
              cancellation_reason = 'Rescheduled by patient',
              follow_up_status = NULL,
              updated_at = CURRENT_TIMESTAMP
            WHERE appointment_id = $1
          `,
          [source.appointment_id],
        );

        rescheduleSource = source;
      }

      if (rebooked_from_appointment_id) {
        const originalAppointmentResult =
          await client.query(
            `
              SELECT
                appointment_id,
                patient_id,
                status,
                follow_up_status

              FROM appointments

              WHERE appointment_id = $1

              FOR UPDATE;
            `,
            [
              rebooked_from_appointment_id,
            ],
          );

        if (
          originalAppointmentResult.rows
            .length === 0
        ) {
          await client.query(
            "ROLLBACK",
          );

          return res.status(404).json({
            message:
              "The appointment you are trying to rebook could not be found.",
          });
        }

        const originalAppointment =
          originalAppointmentResult.rows[0];

        /*
        * Security:
        * a patient can only rebook
        * their own appointment.
        */
        if (
          Number(
            originalAppointment.patient_id,
          ) !== Number(patientId)
        ) {
          await client.query(
            "ROLLBACK",
          );

          return res.status(403).json({
            message:
              "You cannot rebook this appointment.",
          });
        }

        /*
        * Only cancelled or missed
        * appointments can be rebooked.
        */
        if (
          ![
            "cancelled",
            "missed",
          ].includes(
            originalAppointment.status,
          )
        ) {
          await client.query(
            "ROLLBACK",
          );

          return res.status(409).json({
            message:
              "Only cancelled or missed appointments can be rebooked.",
          });
        }
        
  /*
   * Only an actual rebook blocks another one. A follow-up
   * staff marked "resolved" (e.g. "patient hasn't rebooked
   * yet") closes their to-do, but the patient may still
   * rebook it; it then shows as rebooked to staff too.
   */
  if (
    originalAppointment.follow_up_status ===
      "rebooked"
  ) {
    await client.query(
      "ROLLBACK",
    );

    return res.status(409).json({
      message:
        "This appointment has already been rebooked. You can see the new appointment in My Appointments.",
    });
  }
}

 /*
 * Lock and validate the temporary appointment hold.
 *
 * The hold is now the patient's reservation for this
 * doctor/date/time instead of an appointment_slots row.
 */
const holdResult = await client.query(
  `
    SELECT
      hold_id,
      hold_token,
      patient_id,
      doctor_id,
      appointment_type_id,
      appointment_reason_id,
      appointment_date::text AS appointment_date,
      start_time::text AS start_time,
      duration_minutes,
      status,
      expires_at

    FROM appointment_holds

    WHERE hold_token = $1
      AND status = 'active'
      AND expires_at > CURRENT_TIMESTAMP

    FOR UPDATE;
  `,
  [hold_token],
);

if (holdResult.rows.length === 0) {
  await client.query("ROLLBACK");

  return res.status(409).json({
    message:
      "Your appointment reservation has expired or is no longer available. Please select a time again.",
  });
}

const appointmentHold =
  holdResult.rows[0];

/*
 * Patient portal bookings may only convert a hold
 * that belongs to the authenticated patient.
 */
if (
  appointmentHold.patient_id === null ||
  Number(appointmentHold.patient_id) !==
    Number(patientId)
) {
  await client.query("ROLLBACK");

  return res.status(403).json({
    message:
      "This appointment reservation does not belong to your account.",
  });
}

/*
 * Make sure the hold exactly matches what the patient
 * is trying to book.
 */
const holdDate =
  String(
    appointmentHold.appointment_date,
  ).slice(0, 10);

const holdStartTime =
  String(
    appointmentHold.start_time,
  ).slice(0, 5);

const requestedStartTime =
  String(start_time).slice(0, 5);

if (
  Number(appointmentHold.doctor_id) !==
    Number(doctor_id) ||
  holdDate !== appointment_date ||
  holdStartTime !== requestedStartTime
) {
  await client.query("ROLLBACK");

  return res.status(400).json({
    message:
      "The appointment reservation does not match the selected appointment details.",
  });
}

/*
 * The temporary hold is authoritative for the
 * appointment category, reason, and duration.
 *
 * Never trust browser-supplied values for these fields.
 */
const heldAppointmentTypeId =
  Number(appointmentHold.appointment_type_id);

const heldAppointmentReasonId =
  Number(appointmentHold.appointment_reason_id);

const heldAppointmentDuration =
  Number(appointmentHold.duration_minutes);

if (
  !Number.isInteger(heldAppointmentTypeId) ||
  heldAppointmentTypeId <= 0 ||
  !Number.isInteger(heldAppointmentReasonId) ||
  heldAppointmentReasonId <= 0 ||
  !Number.isFinite(heldAppointmentDuration) ||
  heldAppointmentDuration <= 0
) {
  await client.query("ROLLBACK");

  return res.status(500).json({
    message:
      "The appointment reservation contains invalid booking information.",
  });
}
      
     

      /*
 * Determine whether this patient
 * has already completed their
 * one-time onboarding forms.
 */
const patientFormsResult =
  await client.query<{
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
    [patientId],
  );


if (
  patientFormsResult.rows.length ===
  0
) {
  await client.query(
    "ROLLBACK",
  );

  return res.status(404).json({
    message:
      "Patient profile not found.",
  });
}


    const initialFormsStatus:
      | "pending"
      | "completed" =
      patientFormsResult.rows[0]
        .initial_forms_completed_at
        ? "completed"
        : "pending";

    /*
 * Create the scheduled appointment.
 *
 * The temporary hold has already been validated and
 * locked above, so we use its database-backed duration.
 *
 * New scheduled bookings no longer depend on
 * appointment_slots.
 */
    const appointmentResult =
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
            NULL,
            'scheduled',
            'patient_portal',
            $10,
            $11
          )
          RETURNING ${PATIENT_APPOINTMENT_COLUMNS};
        `,
        [
          patientId,
          doctor_id,
          heldAppointmentTypeId,
          heldAppointmentReasonId,
          appointment_date,
          start_time,
          heldAppointmentDuration,
          reason_for_visit || null,
          notes || null,
          initialFormsStatus,
          rebooked_from_appointment_id || null,
        ],
      );

    /*
    * Convert the temporary hold into a completed booking.
    *
    * This happens inside the same database transaction as
    * the appointment INSERT. Therefore we cannot end up
    * with a committed appointment while its hold remains
    * active.
    */
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
        [appointmentHold.hold_id],
      );

    if (
      convertedHoldResult.rows.length === 0
    ) {
      await client.query("ROLLBACK");

      return res.status(409).json({
        message:
          "Your appointment reservation expired before the booking could be completed. Please select a time again.",
      });
    }

      /*
      * If this booking came from a
      * cancelled or missed appointment,
      * mark the old appointment as rebooked.
      */
      if (rebooked_from_appointment_id) {
        await client.query(
          `
            UPDATE appointments

            SET
              follow_up_status =
                'rebooked',

              followed_up_at =
                CURRENT_TIMESTAMP,

              updated_at =
                CURRENT_TIMESTAMP

            WHERE appointment_id = $1
              AND patient_id = $2
              AND status IN (
                'cancelled',
                'missed'
              );
          `,
          [
            rebooked_from_appointment_id,
            patientId,
          ],
        );
      }

      // The old visit points at its replacement.
      if (rescheduleSource) {
        await client.query(
          `
            UPDATE appointments
            SET rescheduled_to_appointment_id = $2
            WHERE appointment_id = $1
          `,
          [
            rescheduleSource.appointment_id,
            appointmentResult.rows[0].appointment_id,
          ],
        );
      }

      await client.query("COMMIT");

      const createdAppointment =
        appointmentResult.rows[0];


      // Text the patient (if they opted in). Never blocks
      // or fails the request.
      notifyBookingChange(createdAppointment.appointment_id, rescheduleSource ? "rescheduled" : "booked").catch((error) =>
        console.error("Booking text failed:", error),
      );

      if (rescheduleSource) {
        emitClinicUpdate({
          type: "appointment_status_changed",
          appointmentId: rescheduleSource.appointment_id,
          status: "cancelled",
          doctorId: rescheduleSource.doctor_id,
          appointmentDate: rescheduleSource.appointment_date,
        });
      }

      /*
       * Same events as a front-desk booking, so staff
       * screens refresh as soon as a patient books.
       */
      emitClinicUpdate({
        type: "appointment_created",
        appointmentId:
          createdAppointment.appointment_id,
        doctorId: Number(doctor_id),
        appointmentDate: appointment_date,
        bookingChannel: "patient_portal",
      });

      emitClinicUpdate({
        type: "appointment_availability_changed",
        doctorId: Number(doctor_id),
        appointmentDate: appointment_date,
      });

      if (rebooked_from_appointment_id) {
        emitClinicUpdate({
          type: "appointment_follow_up_changed",
          appointmentId: Number(
            rebooked_from_appointment_id,
          ),
          followUpStatus: "rebooked",
          rebookedToAppointmentId:
            createdAppointment.appointment_id,
        });
      }

      return res.status(201).json(
        createdAppointment,
      );
    } catch (error) {
      await client.query("ROLLBACK");

      // Overlapping active booking for this doctor
      // (database exclusion constraint).
      if ((error as { code?: string }).code === "23P01") {
        return res.status(409).json({
          message:
            "That time was just booked by someone else. Please choose another time.",
        });
      }

      console.error(
        "Patient booking error:",
        error,
      );

      return res.status(500).json({
        message:
          "Unable to book appointment.",
      });
    } finally {
      client.release();
    }
  },
);

router.patch(
  "/me/appointments/:appointmentId/cancel",
  requirePatientAuth,
  async (req, res) => {
    const client = await pool.connect();

    try {
      const { patientId } =
        (req as any).patientAuth;

      const appointmentId = Number(
        req.params.appointmentId,
      );

      const {
        cancellation_reason,
      } = req.body;

      if (
        !Number.isInteger(
          appointmentId,
        )
      ) {
        return res.status(400).json({
          message:
            "Invalid appointment ID.",
        });
      }

      if (
        !cancellation_reason ||
        !String(
          cancellation_reason,
        ).trim()
      ) {
        return res.status(400).json({
          message:
            "Please provide a cancellation reason.",
        });
      }

      await client.query("BEGIN");

      /*
       * Lock the appointment and make
       * sure it belongs to the logged-in
       * patient.
       */
      const appointmentResult =
        await client.query(
          `
            SELECT
              appointment_id,
              patient_id,
              appointment_date,
              appointment_date::text
                AS appointment_date_text,
              start_time,
              status,
              slot_id,
              doctor_id
            FROM appointments
            WHERE appointment_id = $1
              AND patient_id = $2
            FOR UPDATE
          `,
          [
            appointmentId,
            patientId,
          ],
        );

      if (
        appointmentResult.rows
          .length === 0
      ) {
        await client.query(
          "ROLLBACK",
        );

        return res.status(404).json({
          message:
            "Appointment not found.",
        });
      }

      const appointment =
        appointmentResult.rows[0];

      /*
       * Patients may only cancel
       * appointments that are still
       * scheduled.
       */
      if (
        appointment.status !==
        "scheduled"
      ) {
        await client.query(
          "ROLLBACK",
        );

        return res.status(409).json({
          message:
            "This appointment can no longer be cancelled online.",
        });
      }

      /*
       * Make sure the appointment has
       * not already started.
       *
       * Appointment date/time is treated
       * as Toronto local clinic time.
       */
      const timeCheck =
        await client.query(
          `
            SELECT
              (
                (
                  $1::date +
                  $2::time
                )
                AT TIME ZONE
                'America/Toronto'
              ) > CURRENT_TIMESTAMP
              AS can_cancel
          `,
          [
            appointment.appointment_date,
            appointment.start_time,
          ],
        );

      const canCancel =
        timeCheck.rows[0]
          ?.can_cancel === true;

      if (!canCancel) {
        await client.query(
          "ROLLBACK",
        );

        return res.status(409).json({
          message:
            "This appointment has already started and can no longer be cancelled online.",
        });
      }

      /*
       * Cancel the appointment.
       */
      const cancelledResult =
        await client.query(
          `
            UPDATE appointments
            SET
              status = 'cancelled',

              cancelled_at =
                CURRENT_TIMESTAMP,

              cancelled_by =
                'patient',

              cancellation_reason =
                $1,

              follow_up_status =
                'pending',

              follow_up_notes =
                NULL,

              followed_up_at =
                NULL,

              updated_at =
                CURRENT_TIMESTAMP

            WHERE appointment_id = $2
              AND patient_id = $3
              AND status =
                'scheduled'

            RETURNING ${PATIENT_APPOINTMENT_COLUMNS}
          `,
          [
            String(
              cancellation_reason,
            ).trim(),
            appointmentId,
            patientId,
          ],
        );

      if (
        cancelledResult.rows
          .length === 0
      ) {
        await client.query(
          "ROLLBACK",
        );

        return res.status(409).json({
          message:
            "The appointment status changed before it could be cancelled.",
        });
      }

      /*
       * Reopen the original appointment
       * slot so another patient may book it.
       */
      if (appointment.slot_id) {
        await client.query(
          `
            UPDATE appointment_slots

            SET
              slot_status =
                'available'

            WHERE slot_id = $1
              AND slot_status =
                'booked'
          `,
          [
            appointment.slot_id,
          ],
        );
      }

      await client.query(
        "COMMIT",
      );

      /*
       * Tell staff screens the appointment was
       * cancelled, and open booking screens that this
       * time is free again.
       */

      // Text the patient (if they opted in). Never blocks
      // or fails the request.
      notifyBookingChange(appointmentId, "cancelled_by_patient").catch((error) =>
        console.error("Booking text failed:", error),
      );

      emitClinicUpdate({
        type: "appointment_status_changed",
        appointmentId,
        status: "cancelled",
        cancelledBy: "patient",
        doctorId: appointment.doctor_id,
        appointmentDate:
          appointment.appointment_date_text,
      });

      emitClinicUpdate({
        type: "appointment_availability_changed",
        doctorId: appointment.doctor_id,
        appointmentDate:
          appointment.appointment_date_text,
      });

      return res.json({
        message:
          "Appointment cancelled successfully.",

        appointment:
          cancelledResult.rows[0],
      });
    } catch (error) {
      await client.query(
        "ROLLBACK",
      );

      console.error(
        "Patient cancellation error:",
        error,
      );

      return res.status(500).json({
        message:
          "Unable to cancel appointment.",
      });
    } finally {
      client.release();
    }
  },
);

// /login/verify, /forgot-password, /change-password...
router.use(createAccountSecurityRouter(patientAdapter));

export default router;