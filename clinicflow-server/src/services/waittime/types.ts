export type VisitType =
  | "scheduled"
  | "walk_in";

/*
 * scheduled  = walk-in who has arrived but is not checked
 *              in yet (forms pending), or a booked patient
 *              who has not arrived
 * checked_in = waiting in the lobby
 * roomed     = with the doctor
 */
export type QueueStatus =
  | "scheduled"
  | "checked_in"
  | "roomed";

export type ProviderStatus =
  | "available"
  | "in_consult"
  | "unavailable";

/*
 * All *At fields are absolute ISO-8601 instants (UTC),
 * converted from clinic (Toronto) time in SQL, so the
 * engine never does time-zone arithmetic itself.
 */
export type ClinicStatePatient = {
  appointmentId: number;
  patientId: number;

  doctorId: number | null;
  assignmentMode: "auto" | "manual";
  appointmentTypeId: number | null;

  visitType: VisitType;
  status: QueueStatus;

  // Booked appointments only: the appointment time.
  scheduledStartAt: string | null;
  durationMinutes: number | null;

  arrivedAt: string | null;
  checkedInAt: string | null;
  roomedAt: string | null;
  consultStartedAt: string | null;
};

/*
 * One of a doctor's schedule blocks today, as absolute
 * instants. block_type is "scheduled", "walk_in", or a
 * non-bookable type such as "blocked" (lunch etc.).
 */
export type ScheduleBlock = {
  blockType: string;
  startAt: string;
  endAt: string;
};

export type ClinicStateProvider = {
  doctorId: number;

  firstName: string;
  lastName: string;

  status: ProviderStatus;
  statusReason: string | null;

  currentAppointmentId: number | null;

  roomName: string | null;

  walkInEligibleNow: boolean;
  walkInBlockEndsAt: string | null;

  // The doctor's whole schedule for today, so the engine
  // can plan into later walk-in blocks, know when a shift
  // starts, and avoid lunch/blocked time.
  todayBlocks: ScheduleBlock[];

  estimatedReadyAt: string | null;
  readinessEstimateMinutes: number | null;
  readinessEstimateUpdatedAt: string | null;
};

/*
 * Historical consult lengths for one appointment type,
 * learned from completed visits.
 */
export type DurationStats = {
  medianMinutes: number;
  p25Minutes: number;
  p75Minutes: number;
  sampleSize: number;
};

export type ClinicState = {
  generatedAt: string;

  providers: ClinicStateProvider[];

  // Checked in and waiting.
  scheduledQueue: ClinicStatePatient[];
  walkInQueue: ClinicStatePatient[];

  // Walk-ins who arrived but are not checked in yet.
  pendingWalkIns: ClinicStatePatient[];

  // Roomed (with the doctor).
  activeVisits: ClinicStatePatient[];

  /*
   * Booked appointments later today whose patient has
   * not arrived yet. Used to protect scheduled capacity.
   */
  upcomingScheduledAppointments:
    ClinicStatePatient[];

  // Keyed by appointment_type_id.
  durationStats: Record<number, DurationStats>;

  /*
   * Typical minutes from walk-in arrival to check-in
   * (registration/forms). A walk-in who has not checked
   * in yet cannot be roomed before this. Learned from
   * history; optional for callers that do not load it.
   */
  checkInMinutes?: number;
};
