/*
 * Single entry point for talking to the ClinicFlow API.
 *
 * - The server address comes from VITE_API_URL (falls back
 *   to the local dev server).
 * - The login session is an httpOnly cookie set by the
 *   server. Page JavaScript never sees the token; the
 *   browser attaches the cookie because of
 *   credentials: "include".
 */
export const API_BASE_URL: string =
  import.meta.env.VITE_API_URL ??
  "http://localhost:5000";

export type Portal = "staff" | "patient";

/*
 * Staff and patients can be signed in at the same time in
 * one browser, so tell the server which portal is open:
 * "/patient" and "/patient/..." pages are the patient
 * portal, everything else (staff and doctor portals,
 * including "/patients") is staff.
 */
export function getPortal(): Portal {
  const pathname = window.location.pathname;

  return pathname === "/patient" ||
    pathname.startsWith("/patient/")
    ? "patient"
    : "staff";
}

/*
 * =========================================================
 * EXPIRED SESSIONS
 * =========================================================
 *
 * When a signed-in session runs out, API calls answer 401.
 * apiFetch announces it with SESSION_EXPIRED_EVENT; the
 * auth contexts sign the user out locally, the route
 * guards send them to their login page, and the login page
 * says why and returns them to where they were.
 *
 * Sign-in endpoints answer 401 for a wrong password or
 * "not signed in", which is not an expiry.
 */
export const SESSION_EXPIRED_EVENT =
  "clinicflow:session-expired";

const SESSION_EXPIRED_KEY = "clinicflow_session_expired";

const SIGN_IN_PATHS =
  /^\/api\/(auth|doctor-auth|staff-auth)\/|^\/api\/patient-auth\/(login|logout|register|verify-email|resend-verification|me)$/;

type ExpiredSession = {
  portal: Portal;
  returnTo: string;
};

export function markSessionExpired(portal: Portal) {
  try {
    sessionStorage.setItem(
      SESSION_EXPIRED_KEY,
      JSON.stringify({
        portal,
        returnTo:
          window.location.pathname + window.location.search,
      } satisfies ExpiredSession),
    );
  } catch {
    // Storage unavailable: the user still lands on login.
  }
}

/*
 * The expired session for this portal, if any (not
 * cleared; call clearSessionExpired after signing in).
 */
export function getSessionExpired(
  portal: Portal,
): ExpiredSession | null {
  try {
    const value = JSON.parse(
      sessionStorage.getItem(SESSION_EXPIRED_KEY) ?? "null",
    ) as ExpiredSession | null;

    return value?.portal === portal ? value : null;
  } catch {
    return null;
  }
}

export function clearSessionExpired() {
  try {
    sessionStorage.removeItem(SESSION_EXPIRED_KEY);
  } catch {
    // nothing to clear
  }
}

/*
 * Some failures return an HTML page instead of JSON (e.g. a
 * proxy error). response.json() would then fail with
 * "Unexpected token <"; give a readable message instead.
 */
function withFriendlyJson(response: Response): Response {
  const readJson = response.json.bind(response);

  response.json = async () => {
    try {
      return await readJson();
    } catch {
      throw new Error(
        response.ok
          ? "The server sent an unexpected response. Please try again."
          : `The server had a problem (error ${response.status}). Please try again.`,
      );
    }
  };

  return response;
}

function checkResponse(
  response: Response,
  path: string,
  portal: Portal,
): Response {
  const pathname = path.replace(/^https?:\/\/[^/]+/, "").split("?")[0];

  if (
    response.status === 401 &&
    !SIGN_IN_PATHS.test(pathname)
  ) {
    window.dispatchEvent(
      new CustomEvent(SESSION_EXPIRED_EVENT, {
        detail: { portal },
      }),
    );
  }

  return withFriendlyJson(response);
}

const NETWORK_ERROR_MESSAGE =
  "Can't reach the ClinicFlow server. Check your connection and try again in a moment.";

const RETRY_DELAY_MS = 1000;

export async function apiFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  const portal = getPortal();

  headers.set(
    "X-ClinicFlow-Portal",
    portal,
  );

  const url = /^https?:\/\//.test(path)
    ? path
    : `${API_BASE_URL}${path}`;

  const send = () =>
    fetch(url, {
      ...init,
      headers,
      credentials: "include",
    });

  try {
    return checkResponse(await send(), path, portal);
  } catch (error) {
    // A cancelled request is not a network problem.
    if (
      error instanceof DOMException &&
      error.name === "AbortError"
    ) {
      throw error;
    }

    /*
     * The server could not be reached (e.g. it was
     * restarting). Reads are retried once after a short
     * pause; writes are not, so nothing is saved twice.
     */
    const method = (init.method ?? "GET").toUpperCase();

    if (method === "GET") {
      await new Promise((resolve) =>
        setTimeout(resolve, RETRY_DELAY_MS),
      );

      try {
        return checkResponse(await send(), path, portal);
      } catch {
        // fall through to the friendly error
      }
    }

    throw new Error(NETWORK_ERROR_MESSAGE);
  }
}

/*
 * Tokens used to live in localStorage. Remove any left
 * over from before the switch to cookies.
 */
try {
  localStorage.removeItem("clinicflow_token");
  localStorage.removeItem("clinicflow_patient_token");
  localStorage.removeItem("clinicflow_patient");
} catch {
  // Storage can be unavailable (private mode); nothing to clean.
}
