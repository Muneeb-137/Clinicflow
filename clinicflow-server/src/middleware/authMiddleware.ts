import type {
  NextFunction,
  Request,
  Response,
} from "express";

import jwt from "jsonwebtoken";

import { pool } from "../db.js";
import {
  PATIENT_COOKIE,
  readRequestCookie,
  STAFF_COOKIE,
} from "./authCookies.js";

export type StaffRole =
  | "admin"
  | "receptionist"
  | "doctor";

export type StaffAuthPayload = {
  staffUserId: number;
  role: StaffRole;
  doctorId: number | null;
  // auth_sessions row behind this login.
  sessionId: string;
};

export type PatientAuthPayload = {
  patientUserId: number;
  patientId: number;
  role: "patient";
  sessionId: string;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/*
 * The login token names its session (sid). The session
 * must still be open: signing out, "sign out everywhere"
 * and password changes close it, so a copied token stops
 * working straight away.
 */
const OPEN_SESSION_SQL = (accountType: "staff" | "patient", idColumn: string) => `
  EXISTS (
    SELECT 1
    FROM auth_sessions AS s
    WHERE s.session_id = $2::uuid
      AND s.account_type = '${accountType}'
      AND s.account_id = ${idColumn}
      AND s.revoked_at IS NULL
      AND s.expires_at > CURRENT_TIMESTAMP
  )`;

export interface AuthenticatedRequest
  extends Request {
  staff?: StaffAuthPayload;
  patientAuth?: PatientAuthPayload;
}

const STAFF_ROLES: StaffRole[] = [
  "admin",
  "receptionist",
  "doctor",
];

function getBearerToken(
  req: Request,
): string | null {
  const authorizationHeader =
    req.headers.authorization;

  if (
    !authorizationHeader ||
    !authorizationHeader.startsWith("Bearer ")
  ) {
    return null;
  }

  return authorizationHeader.slice(7);
}

/*
 * The browser sends its session in an httpOnly cookie.
 * A Bearer header is still accepted for scripts and
 * tests.
 */
export function getStaffToken(
  req: Request,
): string | null {
  return (
    getBearerToken(req) ??
    readRequestCookie(req, STAFF_COOKIE)
  );
}

export function getPatientToken(
  req: Request,
): string | null {
  return (
    getBearerToken(req) ??
    readRequestCookie(req, PATIENT_COOKIE)
  );
}

/*
 * Verifies a staff JWT and re-loads the account from the
 * database, so that deactivated accounts (and archived
 * doctors) lose access immediately instead of when their
 * token expires. Role and doctor_id also come from the
 * database rather than the token.
 *
 * Returns null when the token is invalid or the account
 * is no longer active.
 */
export async function resolveStaffToken(
  token: string,
): Promise<StaffAuthPayload | null> {
  const jwtSecret = process.env.JWT_SECRET;

  if (!jwtSecret) {
    throw new Error("JWT_SECRET is not configured.");
  }

  let decoded: StaffAuthPayload & { sid?: unknown };

  try {
    decoded = jwt.verify(
      token,
      jwtSecret,
    ) as StaffAuthPayload & { sid?: unknown };
  } catch {
    return null;
  }

  if (
    !Number.isInteger(decoded.staffUserId) ||
    typeof decoded.sid !== "string" ||
    !UUID_PATTERN.test(decoded.sid)
  ) {
    return null;
  }

  const result = await pool.query<{
    role: StaffRole;
    doctor_id: number | null;
  }>(
    `
      SELECT
        su.role,
        su.doctor_id
      FROM staff_users AS su
      LEFT JOIN doctors AS d
        ON d.doctor_id = su.doctor_id
      WHERE su.staff_user_id = $1
        AND su.is_active = TRUE
        AND (
          su.doctor_id IS NULL
          OR d.is_active = TRUE
        )
        AND ${OPEN_SESSION_SQL("staff", "su.staff_user_id")}
      LIMIT 1
    `,
    [decoded.staffUserId, decoded.sid],
  );

  const account = result.rows[0];

  if (
    !account ||
    !STAFF_ROLES.includes(account.role)
  ) {
    return null;
  }

  return {
    staffUserId: decoded.staffUserId,
    role: account.role,
    doctorId: account.doctor_id ?? null,
    sessionId: decoded.sid,
  };
}

/*
 * Verifies a patient JWT and confirms the patient account
 * is still active and verified.
 */
export async function resolvePatientToken(
  token: string,
): Promise<PatientAuthPayload | null> {
  const jwtSecret =
    process.env.PATIENT_JWT_SECRET;

  if (!jwtSecret) {
    throw new Error(
      "PATIENT_JWT_SECRET is not configured.",
    );
  }

  let decoded: PatientAuthPayload & { sid?: unknown };

  try {
    decoded = jwt.verify(
      token,
      jwtSecret,
    ) as PatientAuthPayload & { sid?: unknown };
  } catch {
    return null;
  }

  if (
    decoded.role !== "patient" ||
    !Number.isInteger(decoded.patientUserId) ||
    typeof decoded.sid !== "string" ||
    !UUID_PATTERN.test(decoded.sid)
  ) {
    return null;
  }

  const result = await pool.query<{
    patient_id: number;
  }>(
    `
      SELECT patient_id
      FROM patient_users
      WHERE patient_user_id = $1
        AND is_active = TRUE
        AND email_verified = TRUE
        AND ${OPEN_SESSION_SQL("patient", "patient_user_id")}
      LIMIT 1
    `,
    [decoded.patientUserId, decoded.sid],
  );

  const account = result.rows[0];

  if (!account) {
    return null;
  }

  return {
    patientUserId: decoded.patientUserId,
    patientId: account.patient_id,
    role: "patient",
    sessionId: decoded.sid,
  };
}

export async function requireStaffAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
) {
  const token = getStaffToken(req);

  if (!token) {
    return res.status(401).json({
      message: "Authentication required.",
    });
  }

  try {
    const staff =
      await resolveStaffToken(token);

    if (!staff) {
      return res.status(401).json({
        message:
          "Invalid or expired token.",
      });
    }

    req.staff = staff;

    next();
  } catch (error) {
    console.error(
      "Staff authentication error:",
      error,
    );

    return res.status(500).json({
      message:
        "Authentication is not available.",
    });
  }
}

/*
 * Accepts either a staff session or a patient session.
 * Used for endpoints shared by the staff portal and the
 * patient portal (booking availability, holds, the
 * dashboard summary).
 *
 * One browser can hold both cookies, so the web app
 * sends X-ClinicFlow-Portal to say which portal the
 * request comes from; that session is tried first.
 */
export async function requireAnyAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
) {
  const staffToken = getStaffToken(req);
  const patientToken = getPatientToken(req);

  if (!staffToken && !patientToken) {
    return res.status(401).json({
      message: "Authentication required.",
    });
  }

  const preferPatient =
    req.get("x-clinicflow-portal") ===
    "patient";

  try {
    const tryStaff = async () => {
      const staff = staffToken
        ? await resolveStaffToken(staffToken)
        : null;

      if (staff) {
        req.staff = staff;
      }

      return Boolean(staff);
    };

    const tryPatient = async () => {
      const patientAuth = patientToken
        ? await resolvePatientToken(patientToken)
        : null;

      if (patientAuth) {
        req.patientAuth = patientAuth;
      }

      return Boolean(patientAuth);
    };

    const authenticated = preferPatient
      ? (await tryPatient()) ||
        (await tryStaff())
      : (await tryStaff()) ||
        (await tryPatient());

    if (authenticated) {
      return next();
    }

    return res.status(401).json({
      message:
        "Invalid or expired token.",
    });
  } catch (error) {
    console.error(
      "Authentication error:",
      error,
    );

    return res.status(500).json({
      message:
        "Authentication is not available.",
    });
  }
}
