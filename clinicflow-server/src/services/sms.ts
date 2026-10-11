import { createHmac, timingSafeEqual } from "crypto";

import { pool } from "../db.js";

/*
 * =========================================================
 * TEXT MESSAGES (SMS)
 * =========================================================
 *
 * Sent through Twilio when TWILIO_ACCOUNT_SID,
 * TWILIO_AUTH_TOKEN and TWILIO_FROM_NUMBER (or
 * TWILIO_MESSAGING_SERVICE_SID) are set; otherwise every
 * text is written to the server log instead ("log mode"),
 * so everything can be built and tested without an
 * account.
 *
 * Rules:
 * - Only to patients who opted in and confirmed their
 *   mobile number, and who haven't replied STOP.
 * - Each kind of message can be turned off by the patient
 *   (reminders, booking changes, wait-time updates).
 * - No health details in texts: times, clinic, doctor.
 * - Every text is recorded in sms_messages; dedupe_key
 *   makes sure a reminder is never sent twice.
 */

export type SmsCategory = "reminders" | "booking_updates" | "wait_updates";

export const CLINIC_NAME = process.env.CLINIC_NAME?.trim() || "ClinicFlow";

function twilioConfig() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_NUMBER;
  const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;

  if (!accountSid || !authToken || (!from && !messagingServiceSid)) {
    return null;
  }

  return { accountSid, authToken, from, messagingServiceSid };
}

export function smsMode() {
  return twilioConfig() ? "twilio" : "log";
}

/*
 * "(416) 555-1234" -> "+14165551234". North American
 * numbers may be typed without the country code. Returns
 * null for anything that isn't a plausible mobile number.
 */
export function normalizePhone(input: unknown): string | null {
  if (typeof input !== "string") return null;

  const trimmed = input.trim();
  const digits = trimmed.replace(/\D/g, "");

  if (!trimmed.startsWith("+")) {
    if (digits.length === 10) return `+1${digits}`;
    if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
    return null;
  }

  return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
}

// "+14165551234" -> "•••-•••-1234"
export function maskPhone(phone: string | null) {
  return phone ? `•••-•••-${phone.slice(-4)}` : null;
}

async function deliver(to: string, body: string) {
  const config = twilioConfig();

  if (!config) {
    console.log(`[sms:log] to ${to}: ${body}`);
    return { status: "logged" as const, sid: null };
  }

  const params = new URLSearchParams({ To: to, Body: body });

  if (config.messagingServiceSid) {
    params.set("MessagingServiceSid", config.messagingServiceSid);
  } else if (config.from) {
    params.set("From", config.from);
  }

  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${config.accountSid}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${config.accountSid}:${config.authToken}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params,
    },
  );

  const data = (await response.json().catch(() => ({}))) as {
    sid?: string;
    code?: number;
    message?: string;
  };

  if (!response.ok) {
    const error = new Error(data.message ?? `Twilio error ${response.status}`) as Error & {
      twilioCode?: number;
    };
    error.twilioCode = data.code;
    throw error;
  }

  return { status: "sent" as const, sid: data.sid ?? null };
}

/*
 * Sends one text and records it. With a dedupe_key that was
 * already used, nothing is sent ("duplicate").
 */
export async function sendSms(message: {
  to: string;
  body: string;
  kind: string;
  patientId?: number | null;
  appointmentId?: number | null;
  dedupeKey?: string | null;
}) {
  const inserted = await pool.query<{ message_id: number }>(
    `
      INSERT INTO sms_messages (patient_id, appointment_id, kind, dedupe_key, to_phone, body)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (dedupe_key) DO NOTHING
      RETURNING message_id
    `,
    [
      message.patientId ?? null,
      message.appointmentId ?? null,
      message.kind,
      message.dedupeKey ?? null,
      message.to,
      message.body,
    ],
  );

  const messageId = inserted.rows[0]?.message_id;

  if (!messageId) {
    return "duplicate" as const;
  }

  try {
    const result = await deliver(message.to, message.body);

    await pool.query(
      `UPDATE sms_messages SET status = $2, provider_sid = $3, sent_at = CURRENT_TIMESTAMP
       WHERE message_id = $1`,
      [messageId, result.status, result.sid],
    );

    return result.status;
  } catch (error) {
    const twilioCode = (error as { twilioCode?: number }).twilioCode;

    await pool.query(
      "UPDATE sms_messages SET status = 'failed', error = $2 WHERE message_id = $1",
      [messageId, (error as Error).message.slice(0, 500)],
    );

    // 21610: the number replied STOP to our sender.
    if (twilioCode === 21610 && message.patientId) {
      await pool.query(
        "UPDATE patients SET sms_stopped_at = CURRENT_TIMESTAMP WHERE patient_id = $1",
        [message.patientId],
      );
    }

    console.error(`SMS to ${maskPhone(message.to)} failed:`, (error as Error).message);
    return "failed" as const;
  }
}

/*
 * Texts a patient if they opted in to this category.
 * Returns "skipped" when they didn't.
 */
export async function textPatient(
  patientId: number,
  category: SmsCategory,
  message: {
    body: string;
    kind: string;
    appointmentId?: number | null;
    dedupeKey?: string | null;
  },
) {
  const result = await pool.query<{
    sms_phone: string | null;
    allowed: boolean;
  }>(
    `
      SELECT
        sms_phone,
        (
          sms_opt_in
          AND sms_phone IS NOT NULL
          AND sms_phone_verified_at IS NOT NULL
          AND sms_stopped_at IS NULL
          AND CASE $2
                WHEN 'reminders' THEN sms_reminders
                WHEN 'booking_updates' THEN sms_booking_updates
                WHEN 'wait_updates' THEN sms_wait_updates
                ELSE FALSE
              END
        ) AS allowed
      FROM patients
      WHERE patient_id = $1
    `,
    [patientId, category],
  );

  const patient = result.rows[0];

  if (!patient?.allowed || !patient.sms_phone) {
    return "skipped" as const;
  }

  return sendSms({
    to: patient.sms_phone,
    body: message.body,
    kind: message.kind,
    patientId,
    appointmentId: message.appointmentId ?? null,
    dedupeKey: message.dedupeKey ?? null,
  });
}

/*
 * Twilio signs webhook requests: HMAC-SHA1 of the full URL
 * followed by the POST parameters sorted by name.
 */
export function validTwilioSignature(
  url: string,
  params: Record<string, string>,
  signature: string | undefined,
) {
  const config = twilioConfig();

  if (!config || !signature) return false;

  const data =
    url +
    Object.keys(params)
      .sort()
      .map((key) => key + params[key])
      .join("");

  const expected = createHmac("sha1", config.authToken).update(data).digest("base64");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);

  return a.length === b.length && timingSafeEqual(a, b);
}
