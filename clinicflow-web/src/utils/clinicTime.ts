/*
 * The clinic's time zone. Times of real events (checked in
 * at, roomed at, "you'll be seen at") are shown in clinic
 * time, the same as the server and the wait estimates,
 * whatever time zone the viewer's device is set to.
 *
 * Booked appointment times ("09:30") are already clinic
 * wall-clock times and are shown as written.
 */
export const CLINIC_TIME_ZONE = "America/Toronto";

/*
 * Today's date in the clinic, as YYYY-MM-DD.
 */
export function clinicToday(now = new Date()): string {
  return now.toLocaleDateString("en-CA", {
    timeZone: CLINIC_TIME_ZONE,
  });
}
