/*
 * Clinic details shown around the app. Set them in
 * clinicflow-web/.env (see .env.example) instead of
 * editing components.
 */

// Shown in page headers next to the date. Empty = hidden.
export const CLINIC_NAME: string =
  import.meta.env.VITE_CLINIC_NAME?.trim() ?? "";

// Number of examination rooms. Rooms are named
// "Examination Room 1" ... "Examination Room N"; the
// server stores the same names.
const roomCount = Number(
  import.meta.env.VITE_EXAM_ROOM_COUNT ?? 6,
);

export const EXAM_ROOM_NAMES: string[] = Array.from(
  {
    length:
      Number.isInteger(roomCount) && roomCount > 0
        ? roomCount
        : 6,
  },
  (_, index) => `Examination Room ${index + 1}`,
);

// "Examination Room 3" -> "3"
export function roomNumber(roomName: string): string {
  return roomName.replace(/^Examination Room\s*/i, "");
}
