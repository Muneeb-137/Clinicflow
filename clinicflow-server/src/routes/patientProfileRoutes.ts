import express from "express";
import bcrypt from "bcrypt";
import { createHash, randomBytes, randomInt, timingSafeEqual } from "crypto";

import { pool } from "../db.js";
import type { AuthenticatedRequest } from "../middleware/authMiddleware.js";
import { requirePatientAuth } from "../middleware/requirePatientAuth.js";
import { authRateLimit } from "../middleware/rateLimit.js";
import { sendPatientEmailChangeEmail } from "../services/emailService.js";
import {
  maskPhone,
  normalizePhone,
  sendSms,
  smsMode,
  CLINIC_NAME,
  validTwilioSignature,
} from "../services/sms.js";

/*
 * =========================================================
 * PATIENT PROFILE AND TEXT-MESSAGE SETTINGS
 * =========================================================
 *
 * Patients can change their contact details, emergency
 * contact and text-message settings. Name and date of
 * birth identify their record, so only staff change those.
 * A new email must be confirmed from the new inbox before
 * it becomes the sign-in email.
 */

const router = express.Router();

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const text = (value: unknown, max: number) =>
  typeof value === "string" ? value.trim().slice(0, max) : null;

function patientId(req: AuthenticatedRequest) {
  return req.patientAuth?.patientId as number;
}

/*
 * GET /api/patient-profile
 */
router.get("/", requirePatientAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const result = await pool.query(
      `
        SELECT
          p.first_name, p.last_name,
          p.date_of_birth::text AS date_of_birth,
          pu.email,
          p.phone, p.address_line, p.city, p.province, p.postal_code,
          p.emergency_contact_name, p.emergency_contact_phone,
          p.sms_phone, p.sms_phone_verified_at IS NOT NULL AS sms_verified,
          p.sms_opt_in, p.sms_reminders, p.sms_booking_updates, p.sms_wait_updates,
          p.sms_stopped_at IS NOT NULL AS sms_stopped,
          (
            SELECT ec.new_email FROM patient_email_changes AS ec
            WHERE ec.patient_user_id = pu.patient_user_id
              AND ec.used_at IS NULL AND ec.expires_at > CURRENT_TIMESTAMP
            ORDER BY ec.created_at DESC LIMIT 1
          ) AS pending_email
        FROM patients AS p
        JOIN patient_users AS pu ON pu.patient_id = p.patient_id
        WHERE p.patient_id = $1
      `,
      [patientId(req)],
    );

    const row = result.rows[0];

    if (!row) {
      return res.status(404).json({ message: "Profile not found." });
    }

    return res.json({
      ...row,
      sms_phone: maskPhone(row.sms_phone),
      sms_mode: smsMode(),
    });
  } catch (error) {
    console.error("Error loading patient profile:", error);
    return res.status(500).json({ message: "Unable to load your profile." });
  }
});

/*
 * PATCH /api/patient-profile
 * Contact details and emergency contact.
 */
router.patch("/", requirePatientAuth, async (req: AuthenticatedRequest, res) => {
  const body = req.body ?? {};

  const phoneProblem = (value: unknown, label: string) => {
    if (value === undefined || value === null || value === "") return null;
    return typeof value === "string" && /^[+\d\s().-]{7,20}$/.test(value.trim())
      ? null
      : `${label} doesn't look like a phone number.`;
  };

  const problem =
    phoneProblem(body.phone, "Phone") ??
    phoneProblem(body.emergency_contact_phone, "Emergency contact phone") ??
    (body.postal_code && !/^[A-Za-z0-9 -]{3,10}$/.test(String(body.postal_code).trim())
      ? "Postal code doesn't look right."
      : null);

  if (problem) {
    return res.status(400).json({ message: problem });
  }

  try {
    await pool.query(
      `
        UPDATE patients SET
          phone = $2,
          address_line = $3,
          city = $4,
          province = $5,
          postal_code = $6,
          emergency_contact_name = $7,
          emergency_contact_phone = $8,
          updated_at = CURRENT_TIMESTAMP
        WHERE patient_id = $1
      `,
      [
        patientId(req),
        text(body.phone, 20) || null,
        text(body.address_line, 255) || null,
        text(body.city, 100) || null,
        text(body.province, 50) || null,
        text(body.postal_code, 20)?.toUpperCase() || null,
        text(body.emergency_contact_name, 200) || null,
        text(body.emergency_contact_phone, 30) || null,
      ],
    );

    return res.json({ message: "Your details were saved." });
  } catch (error) {
    console.error("Error saving patient profile:", error);
    return res.status(500).json({ message: "Unable to save your details." });
  }
});

/* ---------------------------------------------------------
 * Email change
 * ------------------------------------------------------- */

const emailChangeLimit = authRateLimit({
  name: "patient-email-change",
  windowMs: 60 * 60_000,
  maxPerAccount: 3,
  maxPerIp: 10,
  accountField: "new_email",
  countAllAttempts: true,
});

/*
 * POST /api/patient-profile/email { new_email, current_password }
 * Sends a confirmation link to the new address.
 */
router.post(
  "/email",
  requirePatientAuth,
  emailChangeLimit,
  async (req: AuthenticatedRequest, res) => {
    const newEmail = String(req.body?.new_email ?? "").trim().toLowerCase();
    const password = req.body?.current_password;

    if (!EMAIL_PATTERN.test(newEmail) || newEmail.length > 255) {
      return res.status(400).json({ message: "Enter a valid email address." });
    }

    if (typeof password !== "string" || !password) {
      return res.status(400).json({ message: "Enter your current password to change your email." });
    }

    try {
      const account = await pool.query<{
        patient_user_id: number;
        email: string;
        password_hash: string;
        first_name: string;
      }>(
        `
          SELECT pu.patient_user_id, pu.email, pu.password_hash, p.first_name
          FROM patient_users AS pu JOIN patients AS p ON p.patient_id = pu.patient_id
          WHERE pu.patient_id = $1
        `,
        [patientId(req)],
      );

      const user = account.rows[0];

      if (!user || !(await bcrypt.compare(password, user.password_hash))) {
        return res.status(401).json({ message: "Your current password isn't right." });
      }

      if (user.email.toLowerCase() === newEmail) {
        return res.status(400).json({ message: "That's already your email." });
      }

      const taken = await pool.query(
        "SELECT 1 FROM patient_users WHERE LOWER(email) = $1 AND patient_user_id <> $2",
        [newEmail, user.patient_user_id],
      );

      if (taken.rows.length > 0) {
        return res.status(409).json({ message: "Another account already uses that email." });
      }

      const token = randomBytes(32).toString("base64url");

      await pool.query(
        "UPDATE patient_email_changes SET used_at = CURRENT_TIMESTAMP WHERE patient_user_id = $1 AND used_at IS NULL",
        [user.patient_user_id],
      );
      await pool.query(
        `INSERT INTO patient_email_changes (token_hash, patient_user_id, new_email, expires_at)
         VALUES ($1, $2, $3, CURRENT_TIMESTAMP + INTERVAL '1 hour')`,
        [sha256(token), user.patient_user_id, newEmail],
      );

      const url = `${process.env.CLIENT_URL ?? "http://localhost:5173"}/confirm-email?token=${encodeURIComponent(token)}`;

      try {
        await sendPatientEmailChangeEmail(newEmail, user.first_name, url);
      } catch (error) {
        console.error("Email change email failed:", error);
        return res.status(502).json({ message: "We couldn't send the confirmation email. Try again soon." });
      }

      return res.json({
        message: `We sent a confirmation link to ${newEmail}. Your email changes once you open it (within 1 hour).`,
      });
    } catch (error) {
      console.error("Error starting email change:", error);
      return res.status(500).json({ message: "Unable to change your email." });
    }
  },
);

/*
 * POST /api/patient-profile/email/confirm { token }
 * Opened from the link in the new inbox (no sign-in needed).
 */
router.post("/email/confirm", async (req, res) => {
  const token = String(req.body?.token ?? "");

  if (!token || token.length > 200) {
    return res.status(400).json({ message: "This link is incomplete." });
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const change = await client.query<{ patient_user_id: number; new_email: string }>(
      `
        UPDATE patient_email_changes SET used_at = CURRENT_TIMESTAMP
        WHERE token_hash = $1 AND used_at IS NULL AND expires_at > CURRENT_TIMESTAMP
        RETURNING patient_user_id, new_email
      `,
      [sha256(token)],
    );

    const row = change.rows[0];

    if (!row) {
      await client.query("ROLLBACK");
      return res.status(410).json({ message: "This link has expired or was already used." });
    }

    const updated = await client.query<{ patient_id: number }>(
      `UPDATE patient_users SET email = $2, updated_at = CURRENT_TIMESTAMP
       WHERE patient_user_id = $1 RETURNING patient_id`,
      [row.patient_user_id, row.new_email],
    );

    await client.query(
      "UPDATE patients SET email = $2, updated_at = CURRENT_TIMESTAMP WHERE patient_id = $1",
      [updated.rows[0].patient_id, row.new_email],
    );

    await client.query("COMMIT");

    return res.json({ message: `Your email is now ${row.new_email}. Use it the next time you sign in.` });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);

    if ((error as { code?: string }).code === "23505") {
      return res.status(409).json({ message: "Another account already uses that email." });
    }

    console.error("Error confirming email change:", error);
    return res.status(500).json({ message: "Unable to change your email." });
  } finally {
    client.release();
  }
});

/* ---------------------------------------------------------
 * Text messages
 * ------------------------------------------------------- */

const smsCodeLimit = authRateLimit({
  name: "patient-sms-code",
  windowMs: 60 * 60_000,
  maxPerAccount: 5,
  maxPerIp: 10,
  accountField: "phone",
  countAllAttempts: true,
});

const codeHash = (patient: number, phone: string, code: string) =>
  sha256(`${patient}:${phone}:${code}:${process.env.PATIENT_JWT_SECRET ?? ""}`);

/*
 * POST /api/patient-profile/sms/start { phone }
 * Texts a 6-digit code to confirm the mobile number.
 */
router.post(
  "/sms/start",
  requirePatientAuth,
  smsCodeLimit,
  async (req: AuthenticatedRequest, res) => {
    const phone = normalizePhone(req.body?.phone);

    if (!phone) {
      return res.status(400).json({
        message: "Enter a mobile number, e.g. 416-555-1234.",
      });
    }

    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");

    try {
      await pool.query(
        `
          INSERT INTO sms_phone_verifications (patient_id, phone, code_hash, expires_at)
          VALUES ($1, $2, $3, CURRENT_TIMESTAMP + INTERVAL '10 minutes')
          ON CONFLICT (patient_id) DO UPDATE SET
            phone = EXCLUDED.phone, code_hash = EXCLUDED.code_hash,
            expires_at = EXCLUDED.expires_at, attempts = 0, created_at = CURRENT_TIMESTAMP
        `,
        [patientId(req), phone, codeHash(patientId(req), phone, code)],
      );

      const result = await sendSms({
        to: phone,
        body: `${CLINIC_NAME}: ${code} is your code to turn on text messages. It expires in 10 minutes.`,
        kind: "phone_verification",
        patientId: patientId(req),
      });

      if (result === "failed") {
        return res.status(502).json({
          message: "We couldn't text that number. Check it and try again.",
        });
      }

      return res.json({
        message: `We texted a code to ${maskPhone(phone)}.`,
        sms_mode: smsMode(),
      });
    } catch (error) {
      console.error("Error starting SMS verification:", error);
      return res.status(500).json({ message: "Unable to send a code." });
    }
  },
);

/*
 * POST /api/patient-profile/sms/verify { code }
 * Confirms the number and turns texts on.
 */
router.post("/sms/verify", requirePatientAuth, async (req: AuthenticatedRequest, res) => {
  const code = String(req.body?.code ?? "").replace(/\s/g, "");

  try {
    const result = await pool.query<{
      phone: string;
      code_hash: string;
      attempts: number;
      expired: boolean;
    }>(
      `SELECT phone, code_hash, attempts, expires_at <= CURRENT_TIMESTAMP AS expired
       FROM sms_phone_verifications WHERE patient_id = $1`,
      [patientId(req)],
    );

    const pending = result.rows[0];

    if (!pending || pending.expired || pending.attempts >= 5) {
      return res.status(410).json({ message: "This code has expired. Send a new one." });
    }

    const expected = Buffer.from(codeHash(patientId(req), pending.phone, code), "hex");
    const stored = Buffer.from(pending.code_hash, "hex");

    if (!/^\d{6}$/.test(code) || expected.length !== stored.length || !timingSafeEqual(expected, stored)) {
      await pool.query(
        "UPDATE sms_phone_verifications SET attempts = attempts + 1 WHERE patient_id = $1",
        [patientId(req)],
      );
      return res.status(401).json({ message: "That code isn't right." });
    }

    await pool.query(
      `
        UPDATE patients SET
          sms_phone = $2,
          sms_phone_verified_at = CURRENT_TIMESTAMP,
          sms_opt_in = TRUE,
          sms_stopped_at = NULL,
          updated_at = CURRENT_TIMESTAMP
        WHERE patient_id = $1
      `,
      [patientId(req), pending.phone],
    );

    await pool.query("DELETE FROM sms_phone_verifications WHERE patient_id = $1", [patientId(req)]);

    return res.json({ message: "Text messages are on." });
  } catch (error) {
    console.error("Error verifying SMS code:", error);
    return res.status(500).json({ message: "Unable to check the code." });
  }
});

/*
 * PATCH /api/patient-profile/sms
 * { opt_in?, reminders?, booking_updates?, wait_updates? }
 */
router.patch("/sms", requirePatientAuth, async (req: AuthenticatedRequest, res) => {
  const flag = (value: unknown) => (typeof value === "boolean" ? value : null);
  const body = req.body ?? {};

  try {
    const result = await pool.query(
      `
        UPDATE patients SET
          sms_opt_in = COALESCE($2, sms_opt_in) AND sms_phone_verified_at IS NOT NULL,
          sms_reminders = COALESCE($3, sms_reminders),
          sms_booking_updates = COALESCE($4, sms_booking_updates),
          sms_wait_updates = COALESCE($5, sms_wait_updates),
          updated_at = CURRENT_TIMESTAMP
        WHERE patient_id = $1
        RETURNING sms_opt_in
      `,
      [
        patientId(req),
        flag(body.opt_in),
        flag(body.reminders),
        flag(body.booking_updates),
        flag(body.wait_updates),
      ],
    );

    return res.json({
      message: result.rows[0]?.sms_opt_in ? "Text settings saved." : "Text messages are off.",
    });
  } catch (error) {
    console.error("Error saving SMS settings:", error);
    return res.status(500).json({ message: "Unable to save text settings." });
  }
});

/*
 * DELETE /api/patient-profile/sms — remove the number.
 */
router.delete("/sms", requirePatientAuth, async (req: AuthenticatedRequest, res) => {
  try {
    await pool.query(
      `UPDATE patients SET sms_phone = NULL, sms_phone_verified_at = NULL, sms_opt_in = FALSE,
         updated_at = CURRENT_TIMESTAMP WHERE patient_id = $1`,
      [patientId(req)],
    );
    return res.json({ message: "Your mobile number was removed and texts are off." });
  } catch (error) {
    console.error("Error removing SMS number:", error);
    return res.status(500).json({ message: "Unable to remove the number." });
  }
});

/*
 * POST /api/patient-profile/sms/inbound
 *
 * Twilio calls this when someone texts the clinic number.
 * STOP (and similar) turns texts off for that number; START
 * turns them back on. Twilio itself also blocks texts to
 * numbers that replied STOP. Set the number's "A message
 * comes in" webhook to this URL in the Twilio console.
 */
router.post(
  "/sms/inbound",
  express.urlencoded({ extended: false }),
  async (req, res) => {
    const params = Object.fromEntries(
      Object.entries(req.body ?? {}).map(([key, value]) => [key, String(value)]),
    );

    const publicUrl = `${process.env.PUBLIC_API_URL ?? `${req.protocol}://${req.get("host")}`}${req.originalUrl}`;

    if (!validTwilioSignature(publicUrl, params, req.get("x-twilio-signature"))) {
      return res.status(403).send("Invalid signature");
    }

    const from = normalizePhone(params.From);
    const word = (params.Body ?? "").trim().toUpperCase();

    try {
      if (from && ["STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT", "ARRET"].includes(word)) {
        await pool.query("UPDATE patients SET sms_stopped_at = CURRENT_TIMESTAMP WHERE sms_phone = $1", [from]);
      } else if (from && ["START", "UNSTOP", "YES"].includes(word)) {
        await pool.query("UPDATE patients SET sms_stopped_at = NULL WHERE sms_phone = $1", [from]);
      }
    } catch (error) {
      console.error("Inbound SMS handling failed:", error);
    }

    // Empty reply: Twilio sends its own STOP/START confirmations.
    res.type("text/xml").send("<Response></Response>");
  },
);

export default router;
