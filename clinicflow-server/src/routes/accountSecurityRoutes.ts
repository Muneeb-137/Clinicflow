import express from "express";
import type { Request, Response } from "express";
import bcrypt from "bcrypt";

import { pool } from "../db.js";
import {
  type AuthenticatedRequest,
  requireStaffAuth,
} from "../middleware/authMiddleware.js";
import { requirePatientAuth } from "../middleware/requirePatientAuth.js";
import {
  clearSessionCookie,
  PATIENT_COOKIE,
  STAFF_COOKIE,
} from "../middleware/authCookies.js";
import { authRateLimit } from "../middleware/rateLimit.js";
import {
  type AccountType,
  consumePasswordResetToken,
  countOpenSessions,
  countTrustedDevices,
  createPasswordResetToken,
  forgetTrustedDevices,
  isTrustedDevice,
  issueSession,
  passwordProblem,
  resendLoginChallenge,
  revokeAllSessions,
  SignInError,
  startLoginChallenge,
  trustThisDevice,
  verifyLoginChallenge,
} from "../services/accountSecurity.js";
import {
  sendPasswordChangedEmail,
  sendPasswordResetEmail,
} from "../services/emailService.js";

/*
 * =========================================================
 * SIGN-IN SECOND STEP, PASSWORDS AND SESSIONS
 * =========================================================
 *
 * The same routes for both portals, mounted next to the
 * existing sign-in routes:
 *   /api/auth/...          staff, admins and doctors
 *   /api/patient-auth/...  patients
 *
 *   POST /login/verify      { challenge_id, code, trust_device }
 *   POST /login/resend      { challenge_id }
 *   POST /forgot-password   { email }
 *   POST /reset-password    { token, password }
 *   POST /change-password   { current_password, new_password }   (signed in)
 *   POST /logout-everywhere                                       (signed in)
 *   GET  /security          open sessions, trusted devices        (signed in)
 */

type Account = {
  id: number;
  email: string;
  firstName: string;
  passwordHash: string;
  // Active (and, for patients, email verified; for staff,
  // invite accepted).
  usable: boolean;
  claims: Record<string, unknown>;
  publicUser: Record<string, unknown>;
};

type Adapter = {
  type: AccountType;
  // Key of the signed-in user in JSON responses.
  responseKey: "staff" | "patient";
  sessionCookie: string;
  loadById: (id: number) => Promise<Account | null>;
  loadByEmail: (email: string) => Promise<Account | null>;
  updatePassword: (id: number, hash: string) => Promise<void>;
  signedInId: (req: AuthenticatedRequest) => { id: number; sessionId: string } | null;
  requireAuth: express.RequestHandler;
};

/* ---------------------------------------------------------
 * Staff (admins, receptionists, doctors)
 * ------------------------------------------------------- */

const STAFF_SELECT = `
  SELECT
    su.staff_user_id,
    su.first_name,
    su.last_name,
    su.email,
    su.password_hash,
    su.role,
    su.doctor_id,
    (
      su.is_active
      AND (su.doctor_id IS NULL OR d.is_active = TRUE)
      AND NOT (
        EXISTS (SELECT 1 FROM staff_portal_invites AS spi WHERE spi.staff_user_id = su.staff_user_id)
        AND NOT EXISTS (
          SELECT 1 FROM staff_portal_invites AS spi
          WHERE spi.staff_user_id = su.staff_user_id AND spi.used_at IS NOT NULL
        )
      )
    ) AS usable
  FROM staff_users AS su
  LEFT JOIN doctors AS d ON d.doctor_id = su.doctor_id
`;

function staffAccount(row: Record<string, unknown> | undefined): Account | null {
  if (!row) return null;

  return {
    id: row.staff_user_id as number,
    email: row.email as string,
    firstName: row.first_name as string,
    passwordHash: row.password_hash as string,
    usable: row.usable as boolean,
    claims: {
      staffUserId: row.staff_user_id,
      role: row.role,
      doctorId: row.doctor_id,
    },
    publicUser: {
      staff_user_id: row.staff_user_id,
      first_name: row.first_name,
      last_name: row.last_name,
      email: row.email,
      role: row.role,
      doctor_id: row.doctor_id,
    },
  };
}

export const staffAdapter: Adapter = {
  type: "staff",
  responseKey: "staff",
  sessionCookie: STAFF_COOKIE,
  loadById: async (id) =>
    staffAccount((await pool.query(`${STAFF_SELECT} WHERE su.staff_user_id = $1`, [id])).rows[0]),
  loadByEmail: async (email) =>
    staffAccount(
      (await pool.query(`${STAFF_SELECT} WHERE LOWER(su.email) = LOWER($1) LIMIT 1`, [email]))
        .rows[0],
    ),
  updatePassword: async (id, hash) => {
    await pool.query(
      "UPDATE staff_users SET password_hash = $2, updated_at = CURRENT_TIMESTAMP WHERE staff_user_id = $1",
      [id, hash],
    );
  },
  signedInId: (req) =>
    req.staff ? { id: req.staff.staffUserId, sessionId: req.staff.sessionId } : null,
  requireAuth: requireStaffAuth as express.RequestHandler,
};

/* ---------------------------------------------------------
 * Patients
 * ------------------------------------------------------- */

const PATIENT_SELECT = `
  SELECT
    pu.patient_user_id,
    pu.patient_id,
    pu.email,
    pu.password_hash,
    (pu.is_active AND pu.email_verified) AS usable,
    p.first_name,
    p.last_name
  FROM patient_users AS pu
  JOIN patients AS p ON p.patient_id = pu.patient_id
`;

function patientAccount(row: Record<string, unknown> | undefined): Account | null {
  if (!row) return null;

  return {
    id: row.patient_user_id as number,
    email: row.email as string,
    firstName: row.first_name as string,
    passwordHash: row.password_hash as string,
    usable: row.usable as boolean,
    claims: {
      patientUserId: row.patient_user_id,
      patientId: row.patient_id,
      role: "patient",
    },
    publicUser: {
      patient_user_id: row.patient_user_id,
      patient_id: row.patient_id,
      first_name: row.first_name,
      last_name: row.last_name,
      email: row.email,
    },
  };
}

export const patientAdapter: Adapter = {
  type: "patient",
  responseKey: "patient",
  sessionCookie: PATIENT_COOKIE,
  loadById: async (id) =>
    patientAccount(
      (await pool.query(`${PATIENT_SELECT} WHERE pu.patient_user_id = $1`, [id])).rows[0],
    ),
  loadByEmail: async (email) =>
    patientAccount(
      (await pool.query(`${PATIENT_SELECT} WHERE LOWER(pu.email) = LOWER($1) LIMIT 1`, [email]))
        .rows[0],
    ),
  updatePassword: async (id, hash) => {
    await pool.query(
      "UPDATE patient_users SET password_hash = $2, updated_at = CURRENT_TIMESTAMP WHERE patient_user_id = $1",
      [id, hash],
    );
  },
  signedInId: (req) =>
    req.patientAuth
      ? { id: req.patientAuth.patientUserId, sessionId: req.patientAuth.sessionId }
      : null,
  requireAuth: requirePatientAuth as express.RequestHandler,
};

/* ---------------------------------------------------------
 * Sign-in, step two
 * ------------------------------------------------------- */

/*
 * Called by the login routes once the password is right
 * and the account may sign in. On a trusted device the
 * session opens straight away; otherwise a code is emailed.
 */
export async function finishPasswordSignIn(
  adapter: Adapter,
  account: Account,
  req: Request,
  res: Response,
) {
  try {
    if (await isTrustedDevice(adapter.type, account.id, req)) {
      await issueSession(adapter.type, account.id, account.claims, req, res);
      return res.json({ [adapter.responseKey]: account.publicUser });
    }

    return res.json(
      await startLoginChallenge(adapter.type, {
        id: account.id,
        email: account.email,
        firstName: account.firstName,
      }),
    );
  } catch (error) {
    if (error instanceof SignInError) {
      return res.status(error.status).json({ message: error.message });
    }

    throw error;
  }
}

const resetUrl = (type: AccountType, token: string) =>
  `${process.env.CLIENT_URL ?? "http://localhost:5173"}/reset-password?portal=${type}&token=${encodeURIComponent(token)}`;

export function createAccountSecurityRouter(adapter: Adapter) {
  const router = express.Router();
  const name = adapter.type;

  const verifyLimit = authRateLimit({
    name: `${name}-login-verify`,
    windowMs: 15 * 60_000,
    maxPerAccount: 10,
    maxPerIp: 30,
    accountField: "challenge_id",
    failureStatuses: [401, 410, 429],
  });

  const resendLimit = authRateLimit({
    name: `${name}-login-resend`,
    windowMs: 15 * 60_000,
    maxPerAccount: 4,
    maxPerIp: 15,
    accountField: "challenge_id",
    countAllAttempts: true,
  });

  // Each request may send an email.
  const forgotLimit = authRateLimit({
    name: `${name}-forgot-password`,
    windowMs: 60 * 60_000,
    maxPerAccount: 3,
    maxPerIp: 10,
    countAllAttempts: true,
  });

  const resetLimit = authRateLimit({
    name: `${name}-reset-password`,
    windowMs: 15 * 60_000,
    maxPerAccount: 10,
    maxPerIp: 20,
    accountField: "token",
    failureStatuses: [400, 410],
  });

  const changeLimit = authRateLimit({
    name: `${name}-change-password`,
    windowMs: 15 * 60_000,
    maxPerAccount: 5,
    maxPerIp: 20,
    accountField: "__none",
    failureStatuses: [401],
  });

  const signInError = (res: Response, error: unknown) => {
    if (error instanceof SignInError) {
      return res.status(error.status).json({ message: error.message });
    }

    console.error(`${name} account security error:`, error);
    return res.status(500).json({ message: "Something went wrong. Please try again." });
  };

  router.post("/login/verify", verifyLimit, async (req, res) => {
    const challengeId = String(req.body?.challenge_id ?? "");
    const code = String(req.body?.code ?? "").replace(/\s/g, "");

    if (!/^[0-9a-f-]{36}$/i.test(challengeId)) {
      return res.status(410).json({ message: "This sign-in has ended. Please sign in again." });
    }

    try {
      const accountId = await verifyLoginChallenge(adapter.type, challengeId, code);
      const account = await adapter.loadById(accountId);

      if (!account?.usable) {
        return res.status(403).json({ message: "This account can't sign in right now." });
      }

      await issueSession(adapter.type, account.id, account.claims, req, res);

      if (req.body?.trust_device === true) {
        await trustThisDevice(adapter.type, account.id, req, res);
      }

      return res.json({ [adapter.responseKey]: account.publicUser });
    } catch (error) {
      return signInError(res, error);
    }
  });

  router.post("/login/resend", resendLimit, async (req, res) => {
    const challengeId = String(req.body?.challenge_id ?? "");

    if (!/^[0-9a-f-]{36}$/i.test(challengeId)) {
      return res.status(410).json({ message: "This sign-in has ended. Please sign in again." });
    }

    try {
      return res.json(
        await resendLoginChallenge(adapter.type, challengeId, async (id) => {
          const account = await adapter.loadById(id);
          return account?.usable ? account : null;
        }),
      );
    } catch (error) {
      return signInError(res, error);
    }
  });

  /*
   * Always the same answer, so the page can't be used to
   * find out which emails have accounts.
   */
  router.post("/forgot-password", forgotLimit, async (req, res) => {
    const email = String(req.body?.email ?? "").trim();
    const answer = {
      message:
        "If an account uses that email, we've sent a link to reset the password. It expires in 30 minutes.",
    };

    if (!email || email.length > 255) {
      return res.status(400).json({ message: "Enter your email address." });
    }

    try {
      const account = await adapter.loadByEmail(email);

      if (account?.usable) {
        const token = await createPasswordResetToken(adapter.type, account.id);

        try {
          await sendPasswordResetEmail(account.email, account.firstName, resetUrl(adapter.type, token));
        } catch (error) {
          console.error("Password reset email failed:", error);
          return res.status(502).json({
            message: "We couldn't send the email right now. Please try again in a moment.",
          });
        }
      }

      return res.json(answer);
    } catch (error) {
      return signInError(res, error);
    }
  });

  router.post("/reset-password", resetLimit, async (req, res) => {
    const token = String(req.body?.token ?? "");
    const password = req.body?.password;
    const problem = passwordProblem(password);

    if (problem) {
      return res.status(400).json({ message: problem });
    }

    try {
      const accountId = token ? await consumePasswordResetToken(adapter.type, token) : null;

      if (!accountId) {
        return res.status(410).json({
          message: "This reset link has expired or was already used. Ask for a new one.",
        });
      }

      const account = await adapter.loadById(accountId);

      if (!account?.usable) {
        return res.status(403).json({ message: "This account can't sign in right now." });
      }

      await adapter.updatePassword(account.id, await bcrypt.hash(password as string, 12));

      // Anyone who knew the old password is signed out.
      await revokeAllSessions(adapter.type, account.id);
      await forgetTrustedDevices(adapter.type, account.id);

      sendPasswordChangedEmail(account.email, account.firstName).catch((error) =>
        console.error("Password changed email failed:", error),
      );

      return res.json({ message: "Your password has been changed. You can sign in now." });
    } catch (error) {
      return signInError(res, error);
    }
  });

  router.post(
    "/change-password",
    adapter.requireAuth,
    changeLimit,
    async (req: AuthenticatedRequest, res) => {
      const me = adapter.signedInId(req);
      const current = req.body?.current_password;
      const next = req.body?.new_password;
      const problem = passwordProblem(next);

      if (!me) {
        return res.status(401).json({ message: "Authentication required." });
      }

      if (typeof current !== "string" || !current) {
        return res.status(400).json({ message: "Enter your current password." });
      }

      if (problem) {
        return res.status(400).json({ message: problem });
      }

      if (current === next) {
        return res.status(400).json({ message: "Choose a password different from your current one." });
      }

      try {
        const account = await adapter.loadById(me.id);

        if (!account || !(await bcrypt.compare(current, account.passwordHash))) {
          return res.status(401).json({ message: "Your current password isn't right." });
        }

        await adapter.updatePassword(account.id, await bcrypt.hash(next as string, 12));

        // Other devices are signed out; this one stays.
        const signedOut = await revokeAllSessions(adapter.type, account.id, me.sessionId);
        await forgetTrustedDevices(adapter.type, account.id);

        sendPasswordChangedEmail(account.email, account.firstName).catch((error) =>
          console.error("Password changed email failed:", error),
        );

        return res.json({
          message:
            signedOut > 0
              ? `Password changed. You were signed out on ${signedOut} other ${signedOut === 1 ? "device" : "devices"}.`
              : "Password changed.",
        });
      } catch (error) {
        return signInError(res, error);
      }
    },
  );

  router.post(
    "/logout-everywhere",
    adapter.requireAuth,
    async (req: AuthenticatedRequest, res) => {
      const me = adapter.signedInId(req);

      if (!me) {
        return res.status(401).json({ message: "Authentication required." });
      }

      try {
        await revokeAllSessions(adapter.type, me.id);
        await forgetTrustedDevices(adapter.type, me.id);
        clearSessionCookie(res, adapter.sessionCookie);

        return res.json({ message: "Signed out on all devices." });
      } catch (error) {
        return signInError(res, error);
      }
    },
  );

  router.get("/security", adapter.requireAuth, async (req: AuthenticatedRequest, res) => {
    const me = adapter.signedInId(req);

    if (!me) {
      return res.status(401).json({ message: "Authentication required." });
    }

    try {
      const [openSessions, trustedDevices] = await Promise.all([
        countOpenSessions(adapter.type, me.id),
        countTrustedDevices(adapter.type, me.id),
      ]);

      return res.json({ open_sessions: openSessions, trusted_devices: trustedDevices });
    } catch (error) {
      return signInError(res, error);
    }
  });

  return router;
}
