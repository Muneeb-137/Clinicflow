/*
 * Long visits (complex, mental health, physicals) take 45
 * minutes or more. Each doctor can cap how many are booked
 * per day (doctor_schedule_settings.max_long_visits_per_day)
 * so they can't crowd out 15- and 30-minute visits. The
 * suggested cap keeps about a third of booked time for them.
 */
export const LONG_VISIT_MINUTES = 45;

export const isLongVisit = (durationMinutes: number | null | undefined) =>
  (durationMinutes ?? 0) >= LONG_VISIT_MINUTES;

// A third of the day's booked minutes, in long visits.
export function suggestedLongVisitLimit(bookedMinutes: number) {
  return Math.floor(bookedMinutes / 3 / LONG_VISIT_MINUTES);
}
