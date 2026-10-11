import { CLINIC_TIME_ZONE } from "../utils/clinicTime";
import { apiFetch } from "../lib/api";
import {
  CalendarDays,
  CheckCircle2,
  Clock3,
  DoorOpen,
  Stethoscope,
  UserRoundCheck,
  UsersRound,
} from "lucide-react";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  useNavigate,
} from "react-router-dom";

import {
  useAuth,
} from "../context/AuthContext";

import { socket } from "../socket";
import { ShortVisitBadge } from "../components/waittime/ShortVisitBadge";

type DoctorProfile = {
  doctor_id: number;
  first_name: string;
  last_name: string;
  specialty?: string | null;
  email?: string | null;
  phone?: string | null;
};

type DoctorAppointment = {
  appointment_id: number;

  appointment_date: string;

  /*
    Server returns start_time and an
    appointment_time alias of it.
    Both are NULL for walk-ins.
  */
  start_time?: string | null;
  appointment_time?: string | null;

  visit_type?: "scheduled" | "walk_in";

  status:
    | "scheduled"
    | "checked_in"
    | "roomed"
    | "completed"
    | "cancelled"
    | string;

  checked_in_at?: string | null;
  roomed_at?: string | null;
  completed_at?: string | null;

  waiting_minutes?: number | null;

  patient_id?: number;
  patient_first_name?: string;
  patient_last_name?: string;

  appointment_type?: string | null;

  assigned_room_name?: string | null;

  // Walk-in accepted near the end of walk-in hours.
  walk_in_capacity_override?: boolean;
};

type TodayResponse = {
  doctor: DoctorProfile;
  appointments: DoctorAppointment[];
};

function DoctorDashboardPage() {
  const navigate =
    useNavigate();

  const {
    staff,
    logout,
  } = useAuth();

  const [
    doctor,
    setDoctor,
  ] = useState<DoctorProfile | null>(
    null,
  );

  const [
    appointments,
    setAppointments,
  ] = useState<DoctorAppointment[]>(
    [],
  );

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    errorMessage,
    setErrorMessage,
  ] = useState("");

  async function loadDashboard(
    backgroundRefresh = false,
  ) {
    if (!staff) {
      return;
    }

    try {
      if (!backgroundRefresh) {
        setLoading(true);
      }

      setErrorMessage("");

      const response = await apiFetch(
        "/api/doctors/me/today",
        {
          headers: {
          },
        },
      );

      const data = await response.json();

      if (
        response.status === 401 ||
        response.status === 403
      ) {
        logout();

        navigate("/doctor/login", {
          replace: true,
        });

        return;
      }

      if (!response.ok) {
        throw new Error(
          data.message ??
            "Unable to load doctor dashboard.",
        );
      }

      const dashboardData =
        data as TodayResponse;

      setDoctor(dashboardData.doctor);

      setAppointments(
        dashboardData.appointments ?? [],
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to load doctor dashboard.",
      );
    } finally {
      if (!backgroundRefresh) {
        setLoading(false);
      }
    }
  }

  useEffect(() => {
    loadDashboard();

    function handleClinicFlowUpdate() {
      loadDashboard(true);
    }

    socket.on(
      "clinicflow:updated",
      handleClinicFlowUpdate,
    );

    return () => {
      socket.off(
        "clinicflow:updated",
        handleClinicFlowUpdate,
      );
    };
  }, [staff]);

  const scheduledCount =
    useMemo(
      () =>
        appointments.filter(
          (appointment) =>
            appointment.status ===
            "scheduled",
        ).length,
      [appointments],
    );

  const waitingCount =
    useMemo(
      () =>
        appointments.filter(
          (appointment) =>
            appointment.status ===
            "checked_in",
        ).length,
      [appointments],
    );

  const roomedCount =
    useMemo(
      () =>
        appointments.filter(
          (appointment) =>
            appointment.status ===
            "roomed",
        ).length,
      [appointments],
    );

  const completedCount =
    useMemo(
      () =>
        appointments.filter(
          (appointment) =>
            appointment.status ===
            "completed",
        ).length,
      [appointments],
    );

  const activeAppointments =
    useMemo(
      () =>
        appointments.filter(
          (appointment) =>
            appointment.status !==
              "completed" &&
            appointment.status !==
              "cancelled",
        ),
      [appointments],
    );

  const nextPatient =
    useMemo(() => {
      const roomedPatient =
        activeAppointments.find(
          (appointment) =>
            appointment.status ===
            "roomed",
        );

      if (roomedPatient) {
        return roomedPatient;
      }

      const checkedInPatient =
        activeAppointments.find(
          (appointment) =>
            appointment.status ===
            "checked_in",
        );

      if (checkedInPatient) {
        return checkedInPatient;
      }

      return (
        activeAppointments[0] ??
        null
      );
    }, [activeAppointments]);

  function formatTime(
    value?: string | null,
  ) {
    if (!value) {
      return "—";
    }

    /*
      Handles either:
      - "09:30:00"
      - ISO timestamp
    */

    if (
      /^\d{2}:\d{2}/.test(value)
    ) {
      const [
        hoursString,
        minutes,
      ] = value.split(":");

      let hours =
        Number(hoursString);

      const suffix =
        hours >= 12 ? "PM" : "AM";

      hours =
        hours % 12 || 12;

      return `${hours}:${minutes} ${suffix}`;
    }

    const date =
      new Date(value);

    if (
      Number.isNaN(
        date.getTime(),
      )
    ) {
      return value;
    }

    return date.toLocaleTimeString("en-US", {
      timeZone: CLINIC_TIME_ZONE,
        hour: "numeric",
        minute: "2-digit",
      },
    );
  }

  function isWalkIn(
    appointment: DoctorAppointment,
  ) {
    const scheduledTime =
      appointment.start_time ??
      appointment.appointment_time;

    return (
      appointment.visit_type ===
        "walk_in" || !scheduledTime
    );
  }

  /*
    Walk-ins have no start_time, so show
    their arrival time (or "Walk-in"
    when they have not arrived yet).
  */
  function getAppointmentTimeLabel(
    appointment: DoctorAppointment,
  ) {
    if (isWalkIn(appointment)) {
      return appointment.checked_in_at
        ? formatTime(
            appointment.checked_in_at,
          )
        : "Walk-in";
    }

    return formatTime(
      appointment.start_time ??
        appointment.appointment_time,
    );
  }

  function getWaitingMinutes(
    appointment: DoctorAppointment,
  ) {
    if (
      appointment.waiting_minutes !=
      null
    ) {
      return appointment.waiting_minutes;
    }

    if (!appointment.checked_in_at) {
      return null;
    }

    const checkedInTime = new Date(
      appointment.checked_in_at,
    ).getTime();

    if (Number.isNaN(checkedInTime)) {
      return null;
    }

    return Math.max(
      0,
      Math.floor(
        (Date.now() - checkedInTime) /
          60000,
      ),
    );
  }

  function getPatientName(
    appointment: DoctorAppointment,
  ) {
    const name = [
      appointment.patient_first_name,
      appointment.patient_last_name,
    ]
      .filter(Boolean)
      .join(" ");

    return name || "Patient";
  }

  function getStatusClasses(
    status: string,
  ) {
    switch (status) {
      case "checked_in":
        return "border-amber-200 bg-amber-50 text-amber-700";

      case "roomed":
        return "border-blue-200 bg-blue-50 text-blue-700";

      case "completed":
        return "border-emerald-200 bg-emerald-50 text-emerald-700";

      case "cancelled":
        return "border-red-200 bg-red-50 text-red-700";

      default:
        return "border-slate-200 bg-slate-50 text-slate-600";
    }
  }

  function getStatusLabel(
    status: string,
  ) {
    switch (status) {
      case "checked_in":
        return "Checked In";

      case "roomed":
        return "Roomed";

      case "completed":
        return "Completed";

      case "cancelled":
        return "Cancelled";

      case "scheduled":
        return "Scheduled";

      default:
        return status;
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center">
          <div className="mx-auto h-9 w-9 animate-spin rounded-full border-4 border-slate-200 border-t-[#13B2B3]" />

          <p className="mt-4 text-sm text-slate-500">
            Loading your dashboard...
          </p>
        </div>
      </div>
    );
  }

  if (errorMessage) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6">
        <h2 className="font-semibold text-red-800">
          Unable to load dashboard
        </h2>

        <p className="mt-2 text-sm text-red-700">
          {errorMessage}
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1600px]">
      {/* PAGE HEADER */}
      <div className="mb-8 flex flex-col justify-between gap-4 xl:flex-row xl:items-end">
        <div>
          <p className="text-sm font-semibold text-[#13B2B3]">
            Physician Portal
          </p>

          <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-950">
            Good day, Dr.{" "}
            {doctor?.last_name ??
              staff?.last_name}
          </h1>

          <p className="mt-2 text-sm text-slate-500">
            Here&apos;s an overview of
            your patients and appointments
            for today.
          </p>
        </div>

        <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
          <CalendarDays
            size={18}
            className="text-[#13B2B3]"
          />

          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
              Today
            </p>

            <p className="text-sm font-semibold text-slate-700">
              {new Date().toLocaleDateString(
                "en-CA",
                {
                  timeZone: CLINIC_TIME_ZONE,
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                },
              )}
            </p>
          </div>
        </div>
      </div>

      {/* KPI CARDS */}
      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <DashboardMetricCard
          title="Scheduled"
          value={scheduledCount}
          subtitle="Upcoming today"
          icon={CalendarDays}
        />

        <DashboardMetricCard
          title="Waiting"
          value={waitingCount}
          subtitle="Checked in"
          icon={UsersRound}
        />

        <DashboardMetricCard
          title="Roomed"
          value={roomedCount}
          subtitle="Ready for consult"
          icon={DoorOpen}
        />

        <DashboardMetricCard
          title="Completed"
          value={completedCount}
          subtitle="Consults finished"
          icon={CheckCircle2}
        />
      </div>

      {/* MAIN CONTENT */}
      <div className="mt-7 grid gap-7 xl:grid-cols-[1.65fr_0.85fr]">
        {/* TODAY'S APPOINTMENTS */}
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-200 px-6 py-5">
            <div>
              <h2 className="text-lg font-bold text-slate-900">
                Today&apos;s Appointments
              </h2>

              <p className="mt-1 text-sm text-slate-500">
                Your current appointment
                schedule and patient status.
              </p>
            </div>

            <button
              type="button"
              onClick={() =>
                navigate(
                  "/doctor/appointments",
                )
              }
              className="text-sm font-semibold text-[#13B2B3] transition hover:text-[#109c9d]"
            >
              View all
            </button>
          </div>

          {appointments.length === 0 ? (
            <div className="px-6 py-16 text-center">
              <CalendarDays
                size={34}
                className="mx-auto text-slate-300"
              />

              <h3 className="mt-4 font-semibold text-slate-700">
                No appointments today
              </h3>

              <p className="mt-1 text-sm text-slate-400">
                You don&apos;t currently
                have any appointments
                scheduled for today.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {appointments
                .slice(0, 8)
                .map(
                  (
                    appointment,
                  ) => (
                    <div
                      key={
                        appointment.appointment_id
                      }
                      className="flex flex-col gap-4 px-6 py-5 transition hover:bg-slate-50/70 lg:flex-row lg:items-center lg:justify-between"
                    >
                      <div className="flex min-w-0 items-center gap-4">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#13B2B3]/10 text-sm font-bold text-[#109c9d]">
                          {appointment.patient_first_name?.charAt(
                            0,
                          ) ?? "P"}
                          {appointment.patient_last_name?.charAt(
                            0,
                          ) ?? ""}
                        </div>

                        <div className="min-w-0">
                          <div className="flex min-w-0 flex-wrap items-center gap-2">
                            <p className="truncate font-semibold text-slate-900">
                              {getPatientName(
                                appointment,
                              )}
                            </p>

                            {appointment.walk_in_capacity_override && (
                              <ShortVisitBadge />
                            )}
                          </div>

                          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-500">
                            <span className="inline-flex items-center gap-1.5">
                              <Clock3
                                size={
                                  14
                                }
                              />

                             {getAppointmentTimeLabel(
                              appointment,
                            )}
                            </span>

                            <span className="text-xs text-slate-400">
                              {isWalkIn(appointment)
                                ? appointment.checked_in_at
                                  ? "Walk-in arrival"
                                  : "Awaiting arrival"
                                : "Scheduled"}
                            </span>

                            {appointment.appointment_type && (
                              <span>
                                {
                                  appointment.appointment_type
                                }
                              </span>
                            )}

                            {appointment.assigned_room_name && (
                              <span className="inline-flex items-center gap-1.5">
                                <DoorOpen
                                  size={
                                    14
                                  }
                                />

                                {
                                  appointment.assigned_room_name
                                }
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-3 lg:justify-end">
                        {appointment.status ===
                          "checked_in" &&
                          getWaitingMinutes(
                            appointment,
                          ) != null && (
                            <span className="text-xs font-medium text-amber-700">
                              Waiting{" "}
                              {getWaitingMinutes(
                                appointment,
                              )}{" "}
                              min
                            </span>
                          )}

                        <span
                          className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${getStatusClasses(
                            appointment.status,
                          )}`}
                        >
                          {getStatusLabel(
                            appointment.status,
                          )}
                        </span>
                      </div>
                    </div>
                  ),
                )}
            </div>
          )}
        </section>

        {/* RIGHT COLUMN */}
        <div className="space-y-7">
          {/* NEXT PATIENT */}
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#13B2B3]/10">
                <UserRoundCheck
                  size={20}
                  className="text-[#13B2B3]"
                />
              </div>

              <div>
                <h2 className="font-bold text-slate-900">
                  Current Patient
                </h2>

                <p className="text-xs text-slate-400">
                  Highest priority patient
                </p>
              </div>
            </div>

            {nextPatient ? (
              <div className="mt-6">
                <p className="text-xl font-bold text-slate-950">
                  {getPatientName(
                    nextPatient,
                  )}
                </p>

                <p className="mt-1 text-sm text-slate-500">
                  {nextPatient.appointment_type ??
                    "Appointment"}
                </p>

                {nextPatient.walk_in_capacity_override && (
                  <div className="mt-3">
                    <ShortVisitBadge />
                  </div>
                )}

                <div className="mt-5 space-y-3">
                  <InfoRow
                    label={
                      isWalkIn(nextPatient)
                        ? "Arrival"
                        : "Appointment"
                    }
                    value={getAppointmentTimeLabel(
                      nextPatient,
                    )}
                  />

                  <InfoRow
                    label="Status"
                    value={getStatusLabel(
                      nextPatient.status,
                    )}
                  />

                  {nextPatient.assigned_room_name && (
                    <InfoRow
                      label="Room"
                      value={
                        nextPatient.assigned_room_name
                      }
                    />
                  )}

                  {nextPatient.status ===
                    "checked_in" &&
                    getWaitingMinutes(
                      nextPatient,
                    ) != null && (
                      <InfoRow
                        label="Waiting"
                        value={`${getWaitingMinutes(
                          nextPatient,
                        )} min`}
                      />
                    )}
                </div>

                <button
                  type="button"
                  onClick={() =>
                    navigate(
                      "/doctor/queue",
                    )
                  }
                  className="mt-6 w-full rounded-xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
                >
                  View My Queue
                </button>
              </div>
            ) : (
              <div className="mt-6 rounded-xl bg-slate-50 px-4 py-6 text-center">
                <p className="text-sm font-medium text-slate-600">
                  No active patients
                </p>

                <p className="mt-1 text-xs text-slate-400">
                  Your active queue is
                  currently clear.
                </p>
              </div>
            )}
          </section>

          {/* PROVIDER */}
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50">
                <Stethoscope
                  size={20}
                  className="text-blue-600"
                />
              </div>

              <div>
                <h2 className="font-bold text-slate-900">
                  Physician Profile
                </h2>

                <p className="text-xs text-slate-400">
                  Your ClinicFlow profile
                </p>
              </div>
            </div>

            <div className="mt-6 space-y-3">
              <InfoRow
                label="Physician"
                value={`Dr. ${
                  doctor?.first_name ??
                  staff?.first_name ??
                  ""
                } ${
                  doctor?.last_name ??
                  staff?.last_name ??
                  ""
                }`}
              />

              <InfoRow
                label="Specialty"
                value={
                  doctor?.specialty ??
                  "Physician"
                }
              />

              <InfoRow
                label="Appointments"
                value={`${appointments.length} today`}
              />
            </div>

            <button
              type="button"
              onClick={() =>
                navigate(
                  "/doctor/status",
                )
              }
              className="mt-6 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Manage My Status
            </button>
          </section>
        </div>
      </div>
    </div>
  );
}

type DashboardMetricCardProps = {
  title: string;
  value: number;
  subtitle: string;
  icon: React.ElementType;
};

function DashboardMetricCard({
  title,
  value,
  subtitle,
  icon: Icon,
}: DashboardMetricCardProps) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-slate-500">
            {title}
          </p>

          <p className="mt-2 text-3xl font-bold tracking-tight text-slate-950">
            {value}
          </p>
        </div>

        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#13B2B3]/10">
          <Icon
            size={21}
            className="text-[#13B2B3]"
          />
        </div>
      </div>

      <p className="mt-3 text-xs text-slate-400">
        {subtitle}
      </p>
    </div>
  );
}

type InfoRowProps = {
  label: string;
  value: string;
};

function InfoRow({
  label,
  value,
}: InfoRowProps) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-slate-100 pb-3 last:border-b-0 last:pb-0">
      <span className="text-sm text-slate-500">
        {label}
      </span>

      <span className="text-right text-sm font-semibold text-slate-800">
        {value}
      </span>
    </div>
  );
}

export default DoctorDashboardPage;