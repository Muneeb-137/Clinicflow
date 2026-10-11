-- Patient self-service (profile, rescheduling) and SMS
-- notifications. Safe to run more than once.

-- Email change: the new address must be confirmed (link
-- sent to it) before it replaces the sign-in email.
CREATE TABLE IF NOT EXISTS patient_email_changes (
  token_hash       TEXT PRIMARY KEY,
  patient_user_id  INTEGER NOT NULL REFERENCES patient_users (patient_user_id) ON DELETE CASCADE,
  new_email        VARCHAR(255) NOT NULL,
  expires_at       TIMESTAMPTZ NOT NULL,
  used_at          TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Rescheduling: the old visit is cancelled and points at
-- the new one, so it is shown as "moved" rather than as a
-- cancellation needing follow-up.
ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS rescheduled_to_appointment_id INTEGER
    REFERENCES appointments (appointment_id);

-- Text messages: opt-in, a confirmed mobile number, and
-- what to receive.
ALTER TABLE patients
  ADD COLUMN IF NOT EXISTS sms_phone              VARCHAR(20),
  ADD COLUMN IF NOT EXISTS sms_phone_verified_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sms_opt_in             BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS sms_reminders          BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS sms_booking_updates    BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS sms_wait_updates       BOOLEAN NOT NULL DEFAULT TRUE,
  -- Set when the patient replies STOP (cleared by START).
  ADD COLUMN IF NOT EXISTS sms_stopped_at         TIMESTAMPTZ;

-- Confirming a mobile number with a texted code.
CREATE TABLE IF NOT EXISTS sms_phone_verifications (
  patient_id   INTEGER PRIMARY KEY REFERENCES patients (patient_id) ON DELETE CASCADE,
  phone        VARCHAR(20) NOT NULL,
  code_hash    TEXT NOT NULL,
  expires_at   TIMESTAMPTZ NOT NULL,
  attempts     INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Every text sent (or skipped), for support and so the
-- same reminder is never sent twice (dedupe_key).
CREATE TABLE IF NOT EXISTS sms_messages (
  message_id      INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  patient_id      INTEGER REFERENCES patients (patient_id) ON DELETE SET NULL,
  appointment_id  INTEGER REFERENCES appointments (appointment_id) ON DELETE SET NULL,
  kind            VARCHAR(40) NOT NULL,
  dedupe_key      VARCHAR(120) UNIQUE,
  to_phone        VARCHAR(20) NOT NULL,
  body            TEXT NOT NULL,
  status          VARCHAR(20) NOT NULL DEFAULT 'queued'
                    CHECK (status IN ('queued', 'sent', 'failed', 'logged')),
  provider_sid    VARCHAR(64),
  error           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  sent_at         TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS sms_messages_appointment_idx
  ON sms_messages (appointment_id, kind);
