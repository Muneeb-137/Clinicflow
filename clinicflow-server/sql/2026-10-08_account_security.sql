-- Account security: real sessions, two-step sign-in,
-- trusted devices and password reset. Shared by staff
-- (admins, receptionists, doctors) and patients:
-- account_type says which table account_id points to
-- (staff_users or patient_users).
--
-- Safe to run more than once.

-- One row per signed-in browser. The login cookie carries
-- the session id; signing out (or changing the password)
-- revokes the row, so the cookie stops working at once,
-- even if someone copied it.
CREATE TABLE IF NOT EXISTS auth_sessions (
  session_id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_type  VARCHAR(10) NOT NULL CHECK (account_type IN ('staff', 'patient')),
  account_id    INTEGER NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at    TIMESTAMPTZ NOT NULL,
  revoked_at    TIMESTAMPTZ,
  user_agent    VARCHAR(300),
  ip_address    VARCHAR(64)
);

CREATE INDEX IF NOT EXISTS auth_sessions_account_idx
  ON auth_sessions (account_type, account_id);

-- Second sign-in step: a 6-digit code emailed after the
-- password is accepted. Only a hash of the code is kept.
CREATE TABLE IF NOT EXISTS login_challenges (
  challenge_id  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_type  VARCHAR(10) NOT NULL CHECK (account_type IN ('staff', 'patient')),
  account_id    INTEGER NOT NULL,
  code_hash     TEXT NOT NULL,
  expires_at    TIMESTAMPTZ NOT NULL,
  attempts      INTEGER NOT NULL DEFAULT 0,
  resend_count  INTEGER NOT NULL DEFAULT 0,
  consumed_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS login_challenges_account_idx
  ON login_challenges (account_type, account_id, created_at);

-- "Trust this device for 30 days": skips the code on that
-- browser. Only a hash of the device token is kept.
CREATE TABLE IF NOT EXISTS trusted_devices (
  device_token_hash TEXT PRIMARY KEY,
  account_type  VARCHAR(10) NOT NULL CHECK (account_type IN ('staff', 'patient')),
  account_id    INTEGER NOT NULL,
  expires_at    TIMESTAMPTZ NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  user_agent    VARCHAR(300)
);

CREATE INDEX IF NOT EXISTS trusted_devices_account_idx
  ON trusted_devices (account_type, account_id);

-- "Forgot password" links (valid 30 minutes, used once).
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  token_hash    TEXT PRIMARY KEY,
  account_type  VARCHAR(10) NOT NULL CHECK (account_type IN ('staff', 'patient')),
  account_id    INTEGER NOT NULL,
  expires_at    TIMESTAMPTZ NOT NULL,
  used_at       TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS password_reset_tokens_account_idx
  ON password_reset_tokens (account_type, account_id);
