/*
 * Response shape of GET /api/wait-time/analytics.
 * Every numeric stat can be null (no rows in range).
 */
export type VisitTypeKey = "walk_in" | "scheduled";

export type VisitTypeFilter = "all" | VisitTypeKey;

export type WaitStats = {
  visit_type: VisitTypeKey;
  visits: number;
  average_wait: number | null;
  median_wait: number | null;
};

export type KpiRow = {
  visit_type: "all" | VisitTypeKey;
  visits: number;
  average_wait: number | null;
  median_wait: number | null;
  p90_wait: number | null;
  max_wait: number | null;
  pct_within_15: number | null;
  pct_within_30: number | null;
};

export type DailyRow = WaitStats & { date: string };
export type HourRow = WaitStats & { hour: number };
export type WeekdayRow = WaitStats & { weekday: number };

export type DoctorRow = WaitStats & {
  doctor_id: number;
  doctor_name: string;
};

export type AppointmentTypeRow = WaitStats & {
  appointment_type: string;
};

export type DistributionBucket =
  | "0-10"
  | "10-20"
  | "20-30"
  | "30-45"
  | "45-60"
  | "60+";

export type DistributionRow = {
  visit_type: VisitTypeKey;
  bucket: DistributionBucket;
  visits: number;
};

export type FlowRow = {
  visit_type: VisitTypeKey;
  total_visits: number;
  completed: number;
  cancelled: number;
  left_without_being_seen: number;
  no_shows: number;
  average_arrival_to_checkin: number | null;
  average_arrival_to_room: number | null;
  average_delay_past_appointment: number | null;
  pct_seen_within_10_of_appointment: number | null;
};

export type ConsultAccuracyRow = {
  appointment_type: string;
  booked_minutes: number | null;
  median_actual_minutes: number | null;
  walk_in_median_minutes?: number | null;
  scheduled_median_minutes?: number | null;
  visits: number;
  walk_in_visits?: number;
  scheduled_visits?: number;
};

export type WaitTimeAnalytics = {
  filters: Record<string, unknown>;
  definitions: {
    wait?: string;
    arrivalToCheckin?: string;
    scheduledDelay?: string;
    excluded?: string;
  };
  kpis: KpiRow[];
  daily: DailyRow[];
  byHour: HourRow[];
  byWeekday: WeekdayRow[];
  byDoctor: DoctorRow[];
  byAppointmentType: AppointmentTypeRow[];
  distribution: DistributionRow[];
  flow: FlowRow[];
  consultAccuracy: ConsultAccuracyRow[];
};
