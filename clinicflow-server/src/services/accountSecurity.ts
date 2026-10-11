import {
  createHash,
  randomBytes,
  randomInt,
  randomUUID,
  timingSafeEqual,
} from "crypto";
import type { Request, Response } from "express";
import jwt from "jsonwebtoken";

import { pool } from "../db.js";
import {
  PATIENT_COOKIE,
  readRequestCookie,
  setSessionCookie,
  STAFF_COOKIE,
} from "../middleware/authCookies.js";
import { sendLoginCodeEmail } from "./emailService.js";

/*
 * =========================================================
 * ACCOUNT SECURITY (staff, doctors and patients)
 * =========================================================
 *
 * - Sessions: each sign-in opens an auth_sessions row whose
 *   id is inside the login cookie. Signing out closes it, so
 *   the cookie stops working everywhere at once.
 * - Two-step sign-in: after the password, a 6-digit code is
 *   emailed (valid 10 minutes, 5 tries).
 * - Trusted devices: "Trust this device for 30 days" skips
 *   the code on that browser.
 * - Password reset links (30 minutes, single use).
 *
 * Only hashes of codes, device tokens and reset tokens are
 * stored.
 */

export type AccountType = "staff" | "patient";

const SESSION_HOURS = 8;
const CODE_MINUTES = 10;
const MAX_CODE_ATTEMPTS = 5;
const MAX_RESENDS = 3;
const MAX_CODES_PER_15_MIN = 10;
const TRUSTED_DEVICE_DAYS = 30;
const RESET_MINUTES = 30;

const SESSION_COOKIES: Record<AccountType, string> = {
  staff: STAFF_COOKIE,
  patient: PATIENT_COOKIE,
};

const DEVICE_COOKIES: Record<AccountType, string> = {
  staff: "cf_staff_device",
  patient: "cf_patient_device",
};

function jwtSecret(type: AccountType) {
  const secret =
    type === "staff" ? process.env.JWT_SECRET : process.env.PATIENT_JWT_SECRET;

  if (!secret) {
    throw new Error(`${type === "staff" ? "JWT_SECRET" : "PATIENT_JWT_SECRET"} is not configured.`);
  }

  return secret;
}

const sha256 = (value: string) =>
  createHash("sha256").update(value).digest("hex");

// Codes are hashed with the challenge id and a server
// secret, so a leaked table can't be brute-forced offline.
const codeHash = (challengeId: string, code: string) =>
  sha256(`${challengeId}:${code}:${process.env.JWT_SECRET ?? ""}`);

function sameHash(a: string, b: string) {
  const left = Buffer.from(a, "hex");
  const right = Buffer.from(b, "hex");
  return left.length === right.length && timingSafeEqual(left, right);
}

const clientInfo = (req: Request) => ({
  userAgent: (req.get("user-agent") ?? "").slice(0, 300) || null,
  ip: (req.ip ?? "").slice(0, 64) || null,
});

// "muneeb@yahoo.com" -> "m•••••@yahoo.com"
export function emailHint(email: string) {
  const [name, domain] = email.split("@");
  if (!domain) return email;
  return `${name.slice(0, 1)}${"•".repeat(Math.max(name.length - 1, 3))}@${domain}`;
}

/* ---------------------------------------------------------
 * Sessions
 * ------------------------------------------------------- */

/*
 * Opens a session and sets the login cookie. claims are the
 * account's usual token fields (staffUserId, role... or
 * patientUserId...).
 */
export async function issueSession(
  type: AccountType,
  accountId: number,
  claims: Record<string, unknown>,
  req: Request,
  res: Response,
) {
  const { userAgent, ip } = clientInfo(req);

  const result = await pool.query<{ session_id: string }>(
    `
      INSERT INTO auth_sessions (account_type, account_id, expires_at, user_agent, ip_address)
      VALUES ($1, $2, CURRENT_TIMESTAMP + make_interval(hours => $3), $4, $5)
      RETURNING session_id
    `,
    [type, accountId, SESSION_HOURS, userAgent, ip],
  );

  const sessionId = result.rows[0].session_id;

  const token = jwt.sign({ ...claims, sid: sessionId }, jwtSecret(type), {
    expiresIn: `${SESSION_HOURS}h`,
  });

  setSessionCookie(res, SESSION_COOKIES[type], token);

  return sessionId;
}

/*
 * Closes the session behind the request's login cookie
 * (sign out). Works even if the account was archived.
 */
export async function revokeSessionFromRequest(type: AccountType, req: Request) {
  const token = readRequestCookie(req, SESSION_COOKIES[type]);

  if (!token) return;

  try {
    const decoded = jwt.verify(token, jwtSecret(type)) as { sid?: unknown };

    if (typeof decoded.sid === "string") {
      await pool.query(
        `UPDATE auth_sessions SET revoked_at = CURRENT_TIMESTAMP
         WHERE session_id = $1::uuid AND account_type = $2 AND revoked_at IS NULL`,
        [decoded.sid, type],
      );
    }
  } catch {
    // Expired or invalid cookie: nothing to close.
  }
}

/*
 * Closes every open session of an account, optionally
 * keeping the current one.
 */
export async function revokeAllSessions(
  type: AccountType,
  accountId: number,
  exceptSessionId: string | null = null,
) {
  const result = await pool.query(
    `
      UPDATE auth_sessions SET revoked_at = CURRENT_TIMESTAMP
      WHERE account_type = $1 AND account_id = $2 AND revoked_at IS NULL
        AND ($3::uuid IS NULL OR session_id <> $3::uuid)
    `,
    [type, accountId, exceptSessionId],
  );

  return result.rowCount ?? 0;
}

export async function countOpenSessions(type: AccountType, accountId: number) {
  const result = await pool.query<{ n: number }>(
    `
      SELECT COUNT(*)::integer AS n FROM auth_sessions
      WHERE account_type = $1 AND account_id = $2
        AND revoked_at IS NULL AND expires_at > CURRENT_TIMESTAMP
    `,
    [type, accountId],
  );

  return result.rows[0].n;
}

/* ---------------------------------------------------------
 * Trusted devices
 * ------------------------------------------------------- */

export async function isTrustedDevice(type: AccountType, accountId: number, req: Request) {
  const token = readRequestCookie(req, DEVICE_COOKIES[type]);

  if (!token || token.length > 200) return false;

  const result = await pool.query(
    `
      SELECT 1 FROM trusted_devices
      WHERE device_token_hash = $1 AND account_type = $2 AND account_id = $3
        AND expires_at > CURRENT_TIMESTAMP
    `,
    [sha256(token), type, accountId],
  );

  return result.rows.length > 0;
}

export async function trustThisDevice(
  type: AccountType,
  accountId: number,
  req: Request,
  res: Response,
) {
  const token = randomBytes(32).toString("base64url");

  await pool.query(
    `
      INSERT INTO trusted_devices (device_token_hash, account_type, account_id, expires_at, user_agent)
      VALUES ($1, $2, $3, CURRENT_TIMESTAMP + make_interval(days => $4), $5)
    `,
    [sha256(token), type, accountId, TRUSTED_DEVICE_DAYS, clientInfo(req).userAgent],
  );

  res.cookie(DEVICE_COOKIES[type], token, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/api",
    maxAge: TRUSTED_DEVICE_DAYS * 86_400_000,
  });
}

export async function forgetTrustedDevices(type: AccountType, accountId: number) {
  const result = await pool.query(
    "DELETE FROM trusted_devices WHERE account_type = $1 AND account_id = $2",
    [type, accountId],
  );

  return result.rowCount ?? 0;
}

export async function countTrustedDevices(type: AccountType, accountId: number) {
  const result = await pool.query<{ n: number }>(
    `SELECT COUNT(*)::integer AS n FROM trusted_devices
     WHERE account_type = $1 AND account_id = $2 AND expires_at > CURRENT_TIMESTAMP`,
    [type, accountId],
  );

  return result.rows[0].n;
}

/* ---------------------------------------------------------
 * Two-step sign-in codes
 * ------------------------------------------------------- */

export class SignInError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

function newCode() {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

async function deliverCode(email: string, firstName: string, code: string) {
  // Local development without email: print the code.
  if (
    process.env.LOG_LOGIN_CODES === "true" &&
    process.env.NODE_ENV !== "production"
  ) {
    console.log(`[dev] Sign-in code for ${email}: ${code}`);
    return;
  }

  await sendLoginCodeEmail(email, firstName, code);
}

/*
 * Password accepted: email a code and return the challenge
 * the browser answers with.
 */
export async function startLoginChallenge(
  type: AccountType,
  account: { id: number; email: string; firstName: string },
) {
  const recent = await pool.query<{ n: number }>(
    `
      SELECT COUNT(*)::integer AS n FROM login_challenges
      WHERE account_type = $1 AND account_id = $2
        AND created_at > CURRENT_TIMESTAMP - INTERVAL '15 minutes'
    `,
    [type, account.id],
  );

  if (recent.rows[0].n >= MAX_CODES_PER_15_MIN) {
    throw new SignInError(
      "Too many sign-in codes were requested. Please wait 15 minutes and try again.",
      429,
    );
  }

  const challengeId = randomUUID();
  const code = newCode();

  await pool.query(
    `
      INSERT INTO login_challenges (challenge_id, account_type, account_id, code_hash, expires_at)
      VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP + make_interval(mins => $5))
    `,
    [challengeId, type, account.id, codeHash(challengeId, code), CODE_MINUTES],
  );

  try {
    await deliverCode(account.email, account.firstName, code);
  } catch (error) {
    await pool.query("DELETE FROM login_challenges WHERE challenge_id = $1", [challengeId]);
    console.error("Sign-in code email failed:", error);
    throw new SignInError(
      "We couldn't send your sign-in code. Please try again in a moment.",
      502,
    );
  }

  return {
    two_step_required: true as const,
    challenge_id: challengeId,
    email_hint: emailHint(account.email),
    expires_in_minutes: CODE_MINUTES,
  };
}

/*
 * Checks the emailed code. Returns the account id when it
 * matches; the challenge can then not be used again.
 */
export async function verifyLoginChallenge(
  type: AccountType,
  challengeId: string,
  code: string,
) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const result = await client.query<{
      account_id: number;
      code_hash: string;
      attempts: number;
      expired: boolean;
      consumed: boolean;
    }>(
      `
        SELECT account_id, code_hash, attempts,
               expires_at <= CURRENT_TIMESTAMP AS expired,
               consumed_at IS NOT NULL AS consumed
        FROM login_challenges
        WHERE challenge_id = $1::uuid AND account_type = $2
        FOR UPDATE
      `,
      [challengeId, type],
    );

    const challenge = result.rows[0];

    if (!challenge || challenge.consumed) {
      throw new SignInError("This sign-in has ended. Please sign in again.", 410);
    }

    if (challenge.expired) {
      throw new SignInError("This code has expired. Send a new code or sign in again.", 410);
    }

    if (challenge.attempts >= MAX_CODE_ATTEMPTS) {
      throw new SignInError("Too many wrong codes. Please sign in again.", 429);
    }

    if (!/^\d{6}$/.test(code) || !sameHash(codeHash(challengeId, code), challenge.code_hash)) {
      await client.query(
        "UPDATE login_challenges SET attempts = attempts + 1 WHERE challenge_id = $1::uuid",
        [challengeId],
      );
      await client.query("COMMIT");

      const left = MAX_CODE_ATTEMPTS - challenge.attempts - 1;

      throw new SignInError(
        left > 0
          ? `That code isn't right. ${left} ${left === 1 ? "try" : "tries"} left.`
          : "Too many wrong codes. Please sign in again.",
        left > 0 ? 401 : 429,
      );
    }

    await client.query(
      "UPDATE login_challenges SET consumed_at = CURRENT_TIMESTAMP WHERE challenge_id = $1::uuid",
      [challengeId],
    );
    await client.query("COMMIT");

    return challenge.account_id;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

/*
 * Emails a fresh code for the same sign-in (the old code
 * stops working).
 */
export async function resendLoginChallenge(
  type: AccountType,
  challengeId: string,
  loadAccount: (accountId: number) => Promise<{ email: string; firstName: string } | null>,
) {
  const result = await pool.query<{ account_id: number; resend_count: number }>(
    `
      SELECT account_id, resend_count FROM login_challenges
      WHERE challenge_id = $1::uuid AND account_type = $2
        AND consumed_at IS NULL
        AND created_at > CURRENT_TIMESTAMP - INTERVAL '30 minutes'
    `,
    [challengeId, type],
  );

  const challenge = result.rows[0];

  if (!challenge) {
    throw new SignInError("This sign-in has ended. Please sign in again.", 410);
  }

  if (challenge.resend_count >= MAX_RESENDS) {
    throw new SignInError("No more codes can be sent for this sign-in. Please sign in again.", 429);
  }

  const account = await loadAccount(challenge.account_id);

  if (!account) {
    throw new SignInError("This sign-in has ended. Please sign in again.", 410);
  }

  const code = newCode();

  await pool.query(
    `
      UPDATE login_challenges
      SET code_hash = $2,
          attempts = 0,
          resend_count = resend_count + 1,
          expires_at = CURRENT_TIMESTAMP + make_interval(mins => $3)
      WHERE challenge_id = $1::uuid
    `,
    [challengeId, codeHash(challengeId, code), CODE_MINUTES],
  );

  try {
    await deliverCode(account.email, account.firstName, code);
  } catch (error) {
    console.error("Sign-in code email failed:", error);
    throw new SignInError("We couldn't send a new code. Please try again in a moment.", 502);
  }

  return { email_hint: emailHint(account.email), expires_in_minutes: CODE_MINUTES };
}

/* ---------------------------------------------------------
 * Password reset links
 * ------------------------------------------------------- */

export async function createPasswordResetToken(type: AccountType, accountId: number) {
  const token = randomBytes(32).toString("base64url");

  // Only the newest link works.
  await pool.query(
    `UPDATE password_reset_tokens SET used_at = CURRENT_TIMESTAMP
     WHERE account_type = $1 AND account_id = $2 AND used_at IS NULL`,
    [type, accountId],
  );

  await pool.query(
    `
      INSERT INTO password_reset_tokens (token_hash, account_type, account_id, expires_at)
      VALUES ($1, $2, $3, CURRENT_TIMESTAMP + make_interval(mins => $4))
    `,
    [sha256(token), type, accountId, RESET_MINUTES],
  );

  return token;
}

/*
 * Uses up a reset link. Returns the account id, or null if
 * the link is unknown, used or expired.
 */
export async function consumePasswordResetToken(type: AccountType, token: string) {
  if (token.length > 200) return null;

  const result = await pool.query<{ account_id: number }>(
    `
      UPDATE password_reset_tokens SET used_at = CURRENT_TIMESTAMP
      WHERE token_hash = $1 AND account_type = $2
        AND used_at IS NULL AND expires_at > CURRENT_TIMESTAMP
      RETURNING account_id
    `,
    [sha256(token), type],
  );

  return result.rows[0]?.account_id ?? null;
}

export const PASSWORD_MIN_LENGTH = 8;

export function passwordProblem(password: unknown): string | null {
  if (typeof password !== "string" || password.length < PASSWORD_MIN_LENGTH) {
    return `Use at least ${PASSWORD_MIN_LENGTH} characters.`;
  }

  if (password.length > 200) {
    return "That password is too long.";
  }

  return null;
}
