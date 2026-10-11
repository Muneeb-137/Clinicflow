import type {
  CookieOptions,
  Request,
  Response,
} from "express";

/*
 * Login sessions are stored in httpOnly cookies, so page
 * JavaScript can never read the token (unlike
 * localStorage). Staff/doctors and patients get separate
 * cookies because one browser can be signed in to both
 * portals.
 */
export const STAFF_COOKIE = "cf_staff_session";
export const PATIENT_COOKIE = "cf_patient_session";

// Matches the JWT lifetime.
const SESSION_MAX_AGE_MS = 8 * 60 * 60 * 1000;

function cookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    // Never sent on requests started by other sites,
    // which blocks cross-site request forgery.
    sameSite: "strict",
    // HTTPS-only outside local development.
    secure: process.env.NODE_ENV === "production",
    // Path "/" so the Socket.IO handshake receives it too.
    path: "/",
  };
}

export function setSessionCookie(
  res: Response,
  name: string,
  token: string,
) {
  res.cookie(name, token, {
    ...cookieOptions(),
    maxAge: SESSION_MAX_AGE_MS,
  });
}

export function clearSessionCookie(
  res: Response,
  name: string,
) {
  res.clearCookie(name, cookieOptions());
}

/*
 * Minimal Cookie header parser (avoids adding the
 * cookie-parser dependency for two cookies).
 */
export function readCookie(
  cookieHeader: string | undefined,
  name: string,
): string | null {
  if (!cookieHeader) {
    return null;
  }

  for (const part of cookieHeader.split(";")) {
    const separatorIndex = part.indexOf("=");

    if (separatorIndex === -1) {
      continue;
    }

    const key = part
      .slice(0, separatorIndex)
      .trim();

    if (key !== name) {
      continue;
    }

    const value = part
      .slice(separatorIndex + 1)
      .trim();

    try {
      return decodeURIComponent(value) || null;
    } catch {
      return null;
    }
  }

  return null;
}

export function readRequestCookie(
  req: Request,
  name: string,
): string | null {
  return readCookie(req.headers.cookie, name);
}
