/*
 * Formats an appointment's doctor for display.
 *
 * Auto-assigned walk-ins have no doctor until they are
 * roomed, so the name can be null.
 */
export function formatDoctorName(
  firstName: string | null | undefined,
  lastName: string | null | undefined,
  fallback = "Next available doctor",
): string {
  const name = [firstName, lastName]
    .filter(Boolean)
    .join(" ");

  return name ? `Dr. ${name}` : fallback;
}
