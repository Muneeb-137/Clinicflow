-- Email invitations for admin / receptionist logins created from the
-- Staff Directory. The admin never sets or sees a password: the new
-- staff_users row gets an unusable random hash, and the person chooses
-- their own password through /staff/accept-invite.
--
-- An account is "invite pending" while it has invites but none of them
-- has been used. Accounts with no invites at all (created before this
-- feature) are treated as active logins.
CREATE TABLE IF NOT EXISTS staff_portal_invites (
  invite_id     SERIAL PRIMARY KEY,
  staff_user_id INTEGER NOT NULL
    REFERENCES staff_users (staff_user_id) ON DELETE CASCADE,
  email         TEXT NOT NULL,
  token_hash    TEXT NOT NULL UNIQUE,
  expires_at    TIMESTAMPTZ NOT NULL,
  used_at       TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_staff_portal_invites_staff_user_id
  ON staff_portal_invites (staff_user_id);

-- The Staff Directory shows a phone number for every team member;
-- clinic_staff had one, staff_users did not.
ALTER TABLE staff_users
  ADD COLUMN IF NOT EXISTS phone VARCHAR(30);

-- Logins look emails up case-insensitively, so two accounts must not
-- differ only by letter case.
CREATE UNIQUE INDEX IF NOT EXISTS staff_users_email_lower_key
  ON staff_users (LOWER(email));
