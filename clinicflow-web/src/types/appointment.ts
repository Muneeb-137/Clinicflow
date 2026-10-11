export type AppointmentStatus =
  | "scheduled"
  | "checked_in"
  | "roomed"
  | "completed"
  | "cancelled";

export type VisitType =
  | "scheduled"
  | "walk_in";

export type FormsStatus =
  | "pending"
  | "completed";

export type ReadinessStatus =
  | "pending"
  | "ready";

export type QueueAppointment = {
  appointment_id: number;

  appointment_date: string;
  start_time: string | null;
  duration_minutes: number;

  status: AppointmentStatus;

  reason_for_visit: string | null;

  arrived_at: string | null;
  checked_in_at: string | null;
  roomed_at: string | null;
  completed_at: string | null;

  patient_id: number;
  patient_first_name: string;
  patient_last_name: string;
  patient_phone: string | null;

  doctor_id: number;
  doctor_first_name: string;
  doctor_last_name: string;

  appointment_type_id: number;
  appointment_type: string;

  /*
   * scheduled = display "Booked Patient"
   * walk_in   = display "Walk-In"
   */
  visit_type: VisitType;

  booking_channel:
    | "patient_portal"
    | "front_desk"
    | "phone";

  forms_status: FormsStatus;

  readiness_status: ReadinessStatus;

  waiting_minutes: number | string;

  provider_status:
    | "available"
    | "in_consult"
    | "unavailable"
    | null;

  provider_status_reason:
    | string
    | null;

  provider_room_name:
    | string
    | null;

  assigned_room_name:
    | string
    | null;

  room_name:
    | string
    | null;
};