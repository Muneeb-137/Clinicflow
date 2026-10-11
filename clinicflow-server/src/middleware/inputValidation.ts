import type {
  ErrorRequestHandler,
  NextFunction,
  Request,
  Response,
} from "express";

/*
 * =========================================================
 * SHARED INPUT CHECKS
 * =========================================================
 *
 * Checks that apply to every route, so bad input gets a
 * clear 400 instead of reaching the database and coming
 * back as a 500:
 * - dates must be real calendar dates (no 2026-02-31);
 * - times must be real clock times (no 25:00);
 * - login and account fields must be plain text.
 *
 * Routes still decide which fields are required.
 */

// Fields holding a calendar date (YYYY-MM-DD).
const DATE_FIELDS = new Set([
  "date",
  "startDate",
  "endDate",
  "appointment_date",
  "slot_date",
  "schedule_date",
  "date_of_birth",
]);

// Fields holding a clock time (HH:MM or HH:MM:SS).
const TIME_FIELDS = new Set([
  "start_time",
  "end_time",
]);

// Fields that must be text when sent.
const TEXT_FIELDS = new Set([
  "email",
  "password",
  "new_password",
  "current_password",
  "confirm_password",
  "token",
  "first_name",
  "last_name",
  "phone",
]);

export function isRealDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (!match) {
    return false;
  }

  const [year, month, day] = match
    .slice(1)
    .map(Number);

  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export function isRealTime(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(value);
}

const FIELD_LABELS: Record<string, string> = {
  date: "Date",
  startDate: "Start date",
  endDate: "End date",
  appointment_date: "Appointment date",
  slot_date: "Date",
  schedule_date: "Date",
  date_of_birth: "Date of birth",
  start_time: "Start time",
  end_time: "End time",
};

function findProblem(
  source: unknown,
): string | null {
  if (!source || typeof source !== "object") {
    return null;
  }

  for (const [key, value] of Object.entries(
    source as Record<string, unknown>,
  )) {
    // Empty / missing values are the route's business.
    if (value === undefined || value === null || value === "") {
      continue;
    }

    if (DATE_FIELDS.has(key)) {
      if (typeof value !== "string" || !isRealDate(value)) {
        return `${FIELD_LABELS[key] ?? key} must be a real date (YYYY-MM-DD).`;
      }
    } else if (TIME_FIELDS.has(key)) {
      if (typeof value !== "string" || !isRealTime(value)) {
        return `${FIELD_LABELS[key] ?? key} must be a valid time (HH:MM).`;
      }
    } else if (TEXT_FIELDS.has(key)) {
      if (typeof value !== "string") {
        return "Some of the details sent were not in the expected format.";
      }
    }
  }

  return null;
}

export function validateCommonInputs(
  request: Request,
  response: Response,
  next: NextFunction,
) {
  // Requests without a JSON body: let routes read
  // request.body safely.
  if (request.body === undefined) {
    request.body = {};
  }

  const problem =
    findProblem(request.body) ??
    findProblem(request.query);

  if (problem) {
    return response.status(400).json({
      message: problem,
    });
  }

  next();
}

/*
 * Unknown API paths answer in JSON like every other route.
 */
export function apiNotFound(
  _request: Request,
  response: Response,
) {
  response.status(404).json({
    message: "Not found.",
  });
}

/*
 * Last stop for errors no route handled. Answers with a
 * short message and never sends internal details (stack
 * traces, SQL) to the browser; the details go to the
 * server log.
 */
export const errorHandler: ErrorRequestHandler = (
  error,
  _request,
  response,
  next,
) => {
  if (response.headersSent) {
    return next(error);
  }

  const status =
    typeof error?.status === "number"
      ? error.status
      : typeof error?.statusCode === "number"
        ? error.statusCode
        : 500;

  if (error?.type === "entity.parse.failed") {
    return response.status(400).json({
      message: "The request body is not valid JSON.",
    });
  }

  if (error?.type === "entity.too.large") {
    return response.status(413).json({
      message: "The request is too large.",
    });
  }

  if (status >= 400 && status < 500) {
    return response.status(status).json({
      message: "The request could not be processed.",
    });
  }

  console.error("Unhandled request error:", error);

  return response.status(500).json({
    message: "Something went wrong. Please try again.",
  });
};
