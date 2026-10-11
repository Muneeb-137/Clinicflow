import { pool } from "../db.js";
import { CLINIC_TIME_ZONE } from "../clinicTimeZone.js";
import { getLivePredictions } from "./waittime/LivePredictions.js";
import { CLINIC_NAME, textPatient } from "./sms.js";

/*
 * =========================================================
 * PATIENT TEXT NOTIFICATIONS
 * =========================================================
 *
 * - Booking changes: booked, moved, cancelled.
 * - Reminders: the day before (sent 8 AM–9 PM) and about
 *   2 hours before a booked visit.
 * - Wait-time updates while waiting in the clinic: the
 *   first estimate after check-in, "about 15 minutes",
 *   "you're next", and "seen in the next walk-in hours".
 *   At most one of each per visit.
 *
 * Texts hold no health details, only times, the clinic and
 * the doctor's name. Patients choose which kinds they get.
 */

const portalUrl = (path: string) =>
  `${process.env.CLIENT_URL ?? "http://localhost:5173"}${path}`;

type AppointmentInfo = {
  appointment_id: number;
  patient_id: number;
  status: string;
  visit_type: string;
  appointment_date: string;
  start_time: string | null;
  doctor_last_name: string | null;
};

async function loadAppointment(appointmentId: number) {
  const result = await pool.query<AppointmentInfo>(
    `
      SELECT
        a.appointment_id,
        a.patient_id,
        a.status,
        a.visit_type,
        a.appointment_date::text AS appointment_date,
        to_char(a.start_time, 'HH24:MI') AS start_time,
        d.last_name AS doctor_last_name
      FROM appointments AS a
      LEFT JOIN doctors AS d ON d.doctor_id = a.doctor_id
      WHERE a.appointment_id = $1
    `,
    [appointmentId],
  );

  return result.rows[0] ?? null;
}

// "2026-10-13", "15:30" -> "Tue, Oct 13 at 3:30 PM"
function whenText(date: string, time: string | null) {
  const [y, m, d] = date.split("-").map(Number);
  const day = new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString("en-US", {
    timeZone: "UTC",
    weekday: "short",
    month: "short",
    day: "numeric",
  });

  if (!time) return day;

  const [h, min] = time.split(":").map(Number);
  return `${day} at ${h % 12 || 12}:${String(min).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}

function clockText(iso: string) {
  return new Date(iso).toLocaleTimeString("en-US", {
    timeZone: CLINIC_TIME_ZONE,
    hour: "numeric",
    minute: "2-digit",
  });
}

const withDoctor = (appointment: AppointmentInfo) =>
  appointment.doctor_last_name ? ` with Dr. ${appointment.doctor_last_name}` : "";

/* ---------------------------------------------------------
 * Booking changes
 * ------------------------------------------------------- */

export type BookingChange =
  | "booked"
  | "rescheduled"
  | "cancelled_by_patient"
  | "cancelled_by_clinic";

export async function notifyBookingChange(appointmentId: number, change: BookingChange) {
  const appointment = await loadAppointment(appointmentId);

  if (!appointment || appointment.visit_type !== "scheduled") {
    return;
  }

  const when = whenText(appointment.appointment_date, appointment.start_time);
  const manage = portalUrl("/patient/appointments");

  const body = {
    booked: `${CLINIC_NAME}: Your appointment${withDoctor(appointment)} is booked for ${when}. Manage it: ${manage}`,
    rescheduled: `${CLINIC_NAME}: Your appointment was moved to ${when}${withDoctor(appointment)}. Manage it: ${manage}`,
    cancelled_by_patient: `${CLINIC_NAME}: Your appointment on ${when}${withDoctor(appointment)} is cancelled. Book again anytime: ${portalUrl("/patient/book")}`,
    cancelled_by_clinic: `${CLINIC_NAME}: The clinic had to cancel your appointment on ${when}${withDoctor(appointment)}. Please book a new time: ${portalUrl("/patient/book")} or call us.`,
  }[change];

  await textPatient(appointment.patient_id, "booking_updates", {
    body,
    kind: `booking_${change}`,
    appointmentId,
    dedupeKey: `booking_${change}:${appointmentId}`,
  });
}

/* ---------------------------------------------------------
 * Reminders
 * ------------------------------------------------------- */

export async function sendDueReminders() {
  const due = await pool.query<AppointmentInfo & { minutes_until: number; is_tomorrow: boolean; daytime: boolean }>(
    `
      WITH now_local AS (
        SELECT (CURRENT_TIMESTAMP AT TIME ZONE '${CLINIC_TIME_ZONE}') AS t
      )
      SELECT
        a.appointment_id,
        a.patient_id,
        a.status,
        a.visit_type,
        a.appointment_date::text AS appointment_date,
        to_char(a.start_time, 'HH24:MI') AS start_time,
        d.last_name AS doctor_last_name,
        EXTRACT(EPOCH FROM ((a.appointment_date + a.start_time) - n.t)) / 60 AS minutes_until,
        a.appointment_date = (n.t::date + 1) AS is_tomorrow,
        n.t::time BETWEEN TIME '08:00' AND TIME '21:00' AS daytime
      FROM appointments AS a
      CROSS JOIN now_local AS n
      LEFT JOIN doctors AS d ON d.doctor_id = a.doctor_id
      JOIN patients AS p ON p.patient_id = a.patient_id
      WHERE a.visit_type = 'scheduled'
        AND a.status = 'scheduled'
        AND a.start_time IS NOT NULL
        AND a.appointment_date BETWEEN n.t::date AND n.t::date + 1
        AND p.sms_opt_in = TRUE
        AND (a.appointment_date + a.start_time) > n.t
    `,
  );

  for (const appointment of due.rows) {
    const minutes = Number(appointment.minutes_until);
    const time = whenText(appointment.appointment_date, appointment.start_time).split(" at ")[1];

    // Day before: any time 8 AM–9 PM the day before, if the
    // visit was booked at least a few hours earlier.
    if (appointment.is_tomorrow && appointment.daytime && minutes > 6 * 60) {
      await textPatient(appointment.patient_id, "reminders", {
        body: `${CLINIC_NAME} reminder: your appointment is tomorrow (${whenText(appointment.appointment_date, null)}) at ${time}${withDoctor(appointment)}. Need to change it? ${portalUrl("/patient/appointments")} Reply STOP to opt out.`,
        kind: "reminder_day_before",
        appointmentId: appointment.appointment_id,
        dedupeKey: `reminder_day_before:${appointment.appointment_id}`,
      });
    }

    // Same day, about 2 hours before.
    if (!appointment.is_tomorrow && minutes <= 120 && minutes >= 30) {
      await textPatient(appointment.patient_id, "reminders", {
        body: `${CLINIC_NAME} reminder: your appointment is today at ${time}${withDoctor(appointment)}. Please check in at the front desk when you arrive.`,
        kind: "reminder_same_day",
        appointmentId: appointment.appointment_id,
        dedupeKey: `reminder_same_day:${appointment.appointment_id}`,
      });
    }
  }
}

/* ---------------------------------------------------------
 * Wait-time updates
 * ------------------------------------------------------- */

export async function sendWaitUpdates() {
  const { predictions } = await getLivePredictions();

  const waiting = predictions.predictions.filter(
    (prediction) => prediction.patientId !== null && prediction.patientId !== undefined,
  );

  if (waiting.length === 0) return;

  // Only patients who opted in, and only once checked in.
  const eligible = await pool.query<{ appointment_id: number }>(
    `
      SELECT a.appointment_id
      FROM appointments AS a
      JOIN patients AS p ON p.patient_id = a.patient_id
      WHERE a.appointment_id = ANY($1::integer[])
        AND a.status = 'checked_in'
        AND p.sms_opt_in = TRUE
        AND p.sms_wait_updates = TRUE
    `,
    [waiting.map((prediction) => prediction.appointmentId)],
  );

  const eligibleIds = new Set(eligible.rows.map((row) => row.appointment_id));
  const queueUrl = portalUrl("/patient/queue");

  for (const prediction of waiting) {
    if (!eligibleIds.has(prediction.appointmentId)) continue;

    const patientId = prediction.patientId as number;
    const id = prediction.appointmentId;
    const minutes = prediction.expectedWaitMinutes;
    const send = (kind: string, body: string, dedupe = `${kind}:${id}`) =>
      textPatient(patientId, "wait_updates", { body, kind, appointmentId: id, dedupeKey: dedupe });

    // Pushed to later walk-in hours today.
    if (prediction.walkInBlock?.status === "later" && prediction.projectedStartAt) {
      await send(
        "wait_later_hours",
        `${CLINIC_NAME}: Walk-in hours ended before your turn. You'll be seen in the next walk-in hours at about ${clockText(prediction.projectedStartAt)}. You're welcome to step out and come back a few minutes before.`,
        `wait_later_hours:${id}:${prediction.walkInBlock.startsAt ?? ""}`,
      );
      continue;
    }

    if (minutes === null || minutes === undefined) continue;

    if (minutes <= 5) {
      await send("wait_next", `${CLINIC_NAME}: You're next! Please be ready to be called in.`);
    } else if (minutes <= 20) {
      await send(
        "wait_soon",
        `${CLINIC_NAME}: You're about ${Math.max(5, Math.round(minutes / 5) * 5)} minutes from being seen. Please stay nearby.`,
      );
    } else {
      // Only as the first update of the visit (not after
      // "about 15 minutes" if the estimate grows again).
      const alreadyUpdated = await pool.query(
        `SELECT 1 FROM sms_messages
         WHERE appointment_id = $1 AND kind IN ('wait_soon', 'wait_next') LIMIT 1`,
        [id],
      );

      if (alreadyUpdated.rows.length > 0) continue;

      await send(
        "wait_checked_in",
        `${CLINIC_NAME}: You're checked in. Estimated wait about ${Math.round(minutes / 5) * 5} min. We'll text you when you're close. Live queue: ${queueUrl}`,
      );
    }
  }
}

/* ---------------------------------------------------------
 * Scheduler
 * ------------------------------------------------------- */

let running = false;

async function tick() {
  if (running) return;
  running = true;

  try {
    await sendDueReminders();
    await sendWaitUpdates();
  } catch (error) {
    console.error("Patient notification run failed:", error);
  } finally {
    running = false;
  }
}

export function startPatientNotifications() {
  void tick();
  setInterval(() => void tick(), 2 * 60_000).unref();
}

/*
 * Wait updates should follow check-ins quickly, not only
 * every 2 minutes: call after clinic events.
 */
let soon: NodeJS.Timeout | null = null;

export function scheduleWaitUpdateSoon() {
  if (soon) return;
  soon = setTimeout(() => {
    soon = null;
    void tick();
  }, 15_000);
  soon.unref();
}
