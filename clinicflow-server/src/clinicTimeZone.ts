import "dotenv/config";

/*
 * The clinic's time zone. Every "today", "now" and clock
 * time on the server means clinic time, whatever zone the
 * machine running the server is set to (cloud servers are
 * usually UTC).
 *
 * Importing this module pins:
 * - Node's local time (Date, toLocale* without a zone,
 *   and how pg turns DATE/TIMESTAMP columns into Dates);
 * - the database session time zone (see db.ts), used by
 *   CURRENT_DATE and timestamp conversions in SQL.
 *
 * SQL that names 'America/Toronto' explicitly must match;
 * change both together if the clinic ever moves zones.
 */
export const CLINIC_TIME_ZONE =
  process.env.CLINIC_TIME_ZONE ?? "America/Toronto";

process.env.TZ = CLINIC_TIME_ZONE;

/*
 * Today's date in the clinic, as YYYY-MM-DD.
 */
export function clinicToday(now = new Date()): string {
  return now.toLocaleDateString("en-CA", {
    timeZone: CLINIC_TIME_ZONE,
  });
}
