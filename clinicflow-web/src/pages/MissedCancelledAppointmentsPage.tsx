import { useClinicFlowRefresh } from "../hooks/useClinicFlowRefresh";
import { formatDoctorName } from "../utils/formatDoctorName";
import { apiFetch } from "../lib/api";
import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  CalendarDays,
  CheckCircle2,
  Clock3,
  LoaderCircle,
  Phone,
  RotateCcw,
  Stethoscope,
  UserRound,
  X,
} from "lucide-react";

import {
  useLocation,
  useNavigate,
} from "react-router-dom";
import LiveIndicator from "../components/LiveIndicator";

type FollowUpStatus =
  | "pending"
  | "resolved"
  | "rebooked"
  | null;

type Appointment = {
  appointment_id: number;

  appointment_date: string;
  start_time: string | null;
  duration_minutes: number;

  status:
    | "missed"
    | "cancelled";

  reason_for_visit:
    | string
    | null;

  missed_at:
    | string
    | null;

  missed_reason:
    | string
    | null;

  cancelled_at:
    | string
    | null;

  cancelled_by:
    | string
    | null;

  cancellation_reason:
    | string
    | null;

  follow_up_status:
    FollowUpStatus;
    
  follow_up_reason:
    | string
    | null;

  follow_up_notes:
    | string
    | null;

  followed_up_at:
    | string
    | null;

  rebooked_from_appointment_id:
    | number
    | null;

  rebooked_appointment_date:
    | string
    | null;

  rebooked_start_time:
    | string
    | null;

  rebooked_doctor_first_name:
    | string
    | null;

  rebooked_doctor_last_name:
    | string
    | null;

  patient_id: number;

  patient_first_name: string;
  patient_last_name: string;

  patient_phone:
    | string
    | null;

  doctor_id: number | null;

  doctor_first_name: string | null;
  doctor_last_name: string | null;

  appointment_type_id: number;
  appointment_type: string;
};

type TimeScope =
  | "today"
  | "total";

type CardFilter =
  | "pending"
  | "resolved"
  | "cancelled"
  | "missed";

function MissedCancelledAppointmentsPage() {
  const navigate = useNavigate();
  const location = useLocation();

  const [appointments, setAppointments] =
    useState<Appointment[]>([]);

  const [timeScope, setTimeScope] =
    useState<TimeScope>("today");

  const [cardFilter, setCardFilter] =
    useState<CardFilter>("pending");

  const [isLoading, setIsLoading] =
    useState(true);


  const [error, setError] =
    useState("");

  const [
    resolvingAppointment,
    setResolvingAppointment,
  ] =
    useState<Appointment | null>(
      null,
    );

  const [
    resolveNotes,
    setResolveNotes,
  ] =
    useState("");

  const [
      resolveReason,
      setResolveReason,
  ] = useState("");

  const [isResolving, setIsResolving] =
    useState(false);

  const [resolveError, setResolveError] =
    useState("");

  const [successMessage, setSuccessMessage] =
    useState("");

  const loadAppointments =
    async (
      showRefreshing = false,
    ) => {
      try {
        if (!showRefreshing) {
          setIsLoading(true);
        }

        setError("");

        const response =
          await apiFetch(
            "/api/appointments/missed-cancelled",
          );

        const data =
          await response.json();

        if (!response.ok) {
          throw new Error(
            data.message ||
              "Unable to load missed and cancelled appointments.",
          );
        }

        setAppointments(
          data as Appointment[],
        );
      } catch (error) {
        console.error(
          "Error loading missed/cancelled appointments:",
          error,
        );

        setError(
          error instanceof Error
            ? error.message
            : "Something went wrong while loading appointments.",
        );
      } finally {
        setIsLoading(false);
      }
    };

  const liveVersion = useClinicFlowRefresh();

  useEffect(() => {
    // Live refreshes reload quietly, without the
    // full-page spinner.
    void loadAppointments(liveVersion > 0);
  }, [liveVersion]);

  /*
   * A successful rebooking returns here.
   */
  useEffect(() => {
   const routeState =
    location.state as {
        rebookSuccess?: boolean;
        patientName?: string;

        rebookSourceStatus?:
        | "missed"
        | "cancelled";
    } | null;

    if (
    !routeState?.rebookSuccess
    ) {
    return;
    }

    setSuccessMessage(
    routeState.patientName
        ? `${routeState.patientName} was successfully rebooked.`
        : "The patient was successfully rebooked.",
    );

    setCardFilter("resolved");

    void loadAppointments();

    /*
     * Remove route state so refreshing
     * does not show the toast again.
     */
    navigate(
      "/appointments/history",
      {
        replace: true,
        state: null,
      },
    );

    const timer =
      window.setTimeout(() => {
        setSuccessMessage("");
      }, 4000);

    return () =>
      window.clearTimeout(timer);
  }, [
    location.state,
    navigate,
  ]);

  function isPendingFollowUp(
  appointment: Appointment,
) {
  return (
    !appointment.follow_up_status ||
    appointment.follow_up_status ===
      "pending"
  );
}

function isResolvedFollowUp(
  appointment: Appointment,
) {
  return (
    appointment.follow_up_status ===
      "resolved" ||
    appointment.follow_up_status ===
      "rebooked"
  );
}

function getDateOnly(
  dateString: string,
) {
  return dateString.includes("T")
    ? dateString.split("T")[0]
    : dateString;
}

function getTorontoDateString(
  date: Date,
) {
  const parts =
    new Intl.DateTimeFormat(
      "en-CA",
      {
        timeZone:
          "America/Toronto",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      },
    ).formatToParts(date);

  const year =
    parts.find(
      (part) =>
        part.type === "year",
    )?.value ?? "";

  const month =
    parts.find(
      (part) =>
        part.type === "month",
    )?.value ?? "";

  const day =
    parts.find(
      (part) =>
        part.type === "day",
    )?.value ?? "";

  return `${year}-${month}-${day}`;
}

const todayDate =
  getTorontoDateString(
    new Date(),
  );

/*
 * A missed appointment belongs to Today
 * when its appointment date is today.
 *
 * A cancellation belongs to Today
 * when it was actually cancelled today,
 * even if the appointment was scheduled
 * for a future date.
 */
function isCaseFromToday(
  appointment: Appointment,
) {
  if (
    appointment.status === "missed"
  ) {
    return (
      getDateOnly(
        appointment.appointment_date,
      ) === todayDate
    );
  }

  if (
    appointment.status ===
      "cancelled" &&
    appointment.cancelled_at
  ) {
    return (
      getTorontoDateString(
        new Date(
          appointment.cancelled_at,
        ),
      ) === todayDate
    );
  }

  return false;
}

/*
 * All cases belonging to today.
 */
const todayAppointments =
  useMemo(
    () =>
      appointments.filter(
        isCaseFromToday,
      ),
    [
      appointments,
      todayDate,
    ],
  );

/*
 * Today / Total decides which
 * collection drives both the cards
 * and the table.
 */
const scopedAppointments =
  timeScope === "today"
    ? todayAppointments
    : appointments;

/*
 * The same four categories used
 * by the dashboard cards.
 */
const pendingCases =
  useMemo(
    () =>
      scopedAppointments.filter(
        isPendingFollowUp,
      ),
    [scopedAppointments],
  );

const resolvedCases =
  useMemo(
    () =>
      scopedAppointments.filter(
        isResolvedFollowUp,
      ),
    [scopedAppointments],
  );

const cancelledAppointments =
  useMemo(
    () =>
      scopedAppointments.filter(
        (appointment) =>
          appointment.status ===
          "cancelled",
      ),
    [scopedAppointments],
  );

const missedAppointments =
  useMemo(
    () =>
      scopedAppointments.filter(
        (appointment) =>
          appointment.status ===
          "missed",
      ),
    [scopedAppointments],
  );

/*
 * Whichever card is selected controls
 * the rows shown in the table.
 */
const visibleAppointments =
  useMemo(() => {
    switch (cardFilter) {
      case "pending":
        return pendingCases;

      case "resolved":
        return resolvedCases;

      case "cancelled":
        return cancelledAppointments;

      case "missed":
        return missedAppointments;

      default:
        return [];
    }
  }, [
    cardFilter,
    pendingCases,
    resolvedCases,
    cancelledAppointments,
    missedAppointments,
  ]);

  function formatAppointmentDate(
    dateString: string,
  ) {
    if (!dateString) {
      return "Unknown date";
    }

    const cleanDate =
      dateString.includes("T")
        ? dateString.split("T")[0]
        : dateString;

    const [
      year,
      month,
      day,
    ] =
      cleanDate
        .split("-")
        .map(Number);

    if (
      !year ||
      !month ||
      !day
    ) {
      return cleanDate;
    }

    const date =
      new Date(
        year,
        month - 1,
        day,
      );

    return date.toLocaleDateString(
      "en-CA",
      {
        month: "short",
        day: "numeric",
        year: "numeric",
      },
    );
  }

  function formatAppointmentTime(
    time: string | null,
  ) {
    if (!time) {
      return "Walk-in";
    }

    const [
      hours,
      minutes,
    ] =
      time.split(":");

    const date =
      new Date();

    date.setHours(
      Number(hours),
      Number(minutes),
      0,
      0,
    );

    return date.toLocaleTimeString(
      "en-US",
      {
        hour: "numeric",
        minute: "2-digit",
      },
    );
  }

  function handleRebook(
    appointment: Appointment,
  ) {
    navigate(
      "/appointments/book",
      {
        state: {
          rebookedFromAppointment:
            appointment,
        },
      },
    );
  }

  function openResolveModal(
    appointment: Appointment,
  ) {
    setResolvingAppointment(
      appointment,
    );
    setResolveReason("");
    setResolveNotes("");
    setResolveError("");
  }

  function closeResolveModal() {
    if (isResolving) {
      return;
    }

    setResolvingAppointment(null);
    setResolveReason("");
    setResolveNotes("");
    setResolveError("");
  }

  async function handleResolve() {
    if (
      !resolvingAppointment
    ) {
      return;
    }

    if (!resolveReason) {
      setResolveError(
        "Please select a resolution reason.",
      );

      return;
    }

    if (
      resolveReason === "Other" &&
      !resolveNotes.trim()
    ) {
      setResolveError(
        "Please add a note when selecting Other.",
      );

      return;
    }

    try {
      setIsResolving(true);
      setResolveError("");

      const response =
        await apiFetch(
          `/api/appointments/${resolvingAppointment.appointment_id}/follow-up/resolve`,
          {
            method: "PATCH",

            headers: {
              "Content-Type":
                "application/json",
            },

            body: JSON.stringify({
            reason: resolveReason,
            notes: resolveNotes.trim() || null,
          }),
          },
        );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data.message ||
            "Unable to resolve the appointment.",
        );
      }

      setAppointments(
        (currentAppointments) =>
          currentAppointments.map(
            (appointment) =>
              appointment
                .appointment_id ===
              resolvingAppointment
                .appointment_id
                ? {
                    ...appointment,

                    follow_up_status:
                      "resolved",

                    follow_up_reason:
                      data.follow_up_reason ??
                      resolveReason,

                    follow_up_notes:
                      data.follow_up_notes ??
                      (resolveNotes.trim() || null),

                    followed_up_at:
                      data.followed_up_at ??
                      new Date()
                        .toISOString(),
                  }
                : appointment,
          ),
      );

      setSuccessMessage(
        `${resolvingAppointment.patient_first_name} ${resolvingAppointment.patient_last_name}'s ${
            resolvingAppointment.status ===
            "cancelled"
            ? "cancelled"
            : "missed"
        } appointment was resolved.`,
        );

      closeResolveModal();

      window.setTimeout(() => {
        setSuccessMessage("");
      }, 4000);
    } catch (error) {
      console.error(
        "Error resolving appointment:",
        error,
      );

      setResolveError(
        error instanceof Error
          ? error.message
          : "Unable to resolve this appointment.",
      );
    } finally {
      setIsResolving(false);
    }
  }

  if (isLoading) {
    return (
      <div className="flex min-h-[420px] items-center justify-center">
        <div className="flex items-center gap-3 text-slate-500">
          <LoaderCircle
            size={22}
            className="animate-spin"
          />

          <span>
            Loading appointment follow-ups...
          </span>
        </div>
      </div>
    );
  }

  return (
    <>
      <section className="space-y-6">
        {successMessage && (
          <div className="fixed right-6 top-6 z-[100] flex max-w-md items-start gap-3 rounded-2xl border border-emerald-200 bg-white px-5 py-4 shadow-xl">
            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
              <CheckCircle2
                size={18}
              />
            </div>

            <div>
              <p className="text-sm font-bold text-slate-900">
                Follow-up completed
              </p>

              <p className="mt-1 text-sm text-slate-500">
                {successMessage}
              </p>
            </div>
          </div>
        )}

        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-[#13B2B3]">
              <CalendarDays
                size={18}
              />

              Appointment follow-up
            </div>

            <h1 className="text-3xl font-bold tracking-tight text-slate-950">
              Missed & Cancellations
            </h1>

            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
            Manage missed and cancelled
            appointments, follow-ups, and
            outstanding cases.
          </p>
          </div>

          <LiveIndicator />
        </div>

        {error && (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm font-medium text-rose-700">
            {error}
          </div>
        )}

       {/* Today / Total scope */}
<div className="flex justify-center">
  <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
    <button
      type="button"
      onClick={() =>
        setTimeScope("today")
      }
      className={`rounded-lg px-5 py-2 text-sm font-semibold transition ${
        timeScope === "today"
          ? "bg-slate-950 text-white shadow-sm"
          : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
      }`}
    >
      Today
    </button>

    <button
      type="button"
      onClick={() =>
        setTimeScope("total")
      }
      className={`rounded-lg px-5 py-2 text-sm font-semibold transition ${
        timeScope === "total"
          ? "bg-slate-950 text-white shadow-sm"
          : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
      }`}
    >
      Total
    </button>
  </div>
</div>

            {/* Summary cards */}
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {/* Pending Cases */}
              <button
                type="button"
                onClick={() =>
                  setCardFilter("pending")
                }
                className={`rounded-2xl border bg-white p-5 text-left shadow-sm transition ${
                  cardFilter === "pending"
                    ? "border-amber-300 ring-2 ring-amber-100"
                    : "border-slate-200 hover:border-slate-300"
                }`}
              >
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">
                  Pending Cases
                </p>

                <p className="mt-2 text-3xl font-bold text-slate-950">
                  {pendingCases.length}
                </p>

                <p className="mt-1 text-xs text-slate-500">
                {timeScope === "today"
                  ? "Cases still requiring staff actions from today"
                  : "Total cases still requiring staff actions"}
              </p>
              </button>

              {/* Resolved Cases */}
              <button
                type="button"
                onClick={() =>
                  setCardFilter("resolved")
                }
                className={`rounded-2xl border bg-white p-5 text-left shadow-sm transition ${
                  cardFilter === "resolved"
                    ? "border-emerald-300 ring-2 ring-emerald-100"
                    : "border-slate-200 hover:border-slate-300"
                }`}
              >
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">
                  Resolved Cases
                </p>

                <p className="mt-2 text-3xl font-bold text-slate-950">
                  {resolvedCases.length}
                </p>

                <p className="mt-1 text-xs text-slate-500">
                {timeScope === "today"
                  ? "Resolved cases from today"
                  : "Total Resolved cases"}
              </p>
              </button>

              {/* Cancellations */}
              <button
                type="button"
                onClick={() =>
                  setCardFilter("cancelled")
                }
                className={`rounded-2xl border bg-white p-5 text-left shadow-sm transition ${
                  cardFilter === "cancelled"
                    ? "border-rose-300 ring-2 ring-rose-100"
                    : "border-slate-200 hover:border-slate-300"
                }`}
              >
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">
                  Cancellations
                </p>

                <p className="mt-2 text-3xl font-bold text-slate-950">
                  {
                    cancelledAppointments.length
                  }
                </p>

                <p className="mt-1 text-xs text-slate-500">
                  {timeScope === "today"
                    ? "Appointments cancelled today"
                    : "Total cancelled appointments"}
                </p>
              </button>

              {/* Missed */}
              <button
                type="button"
                onClick={() =>
                  setCardFilter("missed")
                }
                className={`rounded-2xl border bg-white p-5 text-left shadow-sm transition ${
                  cardFilter === "missed"
                    ? "border-sky-300 ring-2 ring-sky-100"
                    : "border-slate-200 hover:border-slate-300"
                }`}
              >
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">
                  Missed
                </p>

                <p className="mt-2 text-3xl font-bold text-slate-950">
                  {missedAppointments.length}
                </p>

                <p className="mt-1 text-xs text-slate-500">
                  {timeScope === "today"
                    ? "Appointments missed today"
                    : "Total missed appointments"}
                </p>
              </button>
            </div>
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
  {visibleAppointments.length === 0 ? (
    <div className="px-6 py-16 text-center">
      <CheckCircle2
        size={36}
        className="mx-auto text-slate-300"
      />

      <h3 className="mt-4 font-bold text-slate-900">
        {cardFilter === "pending" &&
          "No pending cases"}

        {cardFilter === "resolved" &&
          "No resolved cases"}

        {cardFilter === "cancelled" &&
          "No cancelled appointments"}

        {cardFilter === "missed" &&
          "No missed appointments"}
      </h3>

      <p className="mt-1 text-sm text-slate-500">
        {timeScope === "today"
          ? "There are no matching cases for today."
          : "There are no matching cases to display."}
      </p>
    </div>
  ) : (
    <>
      {/* Header */}
      <div className="grid grid-cols-[minmax(0,1.05fr)_minmax(0,1.05fr)_minmax(0,1.05fr)_minmax(0,0.8fr)_190px_300px] items-center border-b border-slate-200 bg-slate-50">
    <div className="px-6 py-4 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
      Appointment
    </div>

    <div className="px-6 py-4 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
      Patient
    </div>

    <div className="px-6 py-4 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
      Physician
    </div>

    <div className="px-6 py-4 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
      Reason
    </div>

    <div className="px-4 py-4 text-center text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
      Status
    </div>

    <div className="px-4 py-4 text-center text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
      Actions
    </div>
    
  </div>

  {/* Rows */}
  <div className="divide-y divide-slate-100">
    {visibleAppointments.map(
      (appointment) => {
        const isResolved =
          appointment.follow_up_status ===
            "resolved" ||
          appointment.follow_up_status ===
            "rebooked";

        return (
          <div
            key={appointment.appointment_id}
            className="grid grid-cols-[minmax(0,1.05fr)_minmax(0,1.05fr)_minmax(0,1.05fr)_minmax(0,0.8fr)_190px_300px] items-center transition-colors hover:bg-slate-50/80"
          >
            {/* Appointment */}
            <div className="px-6 py-5">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-[#13B2B3]">
                  <Clock3 size={19} />
                </div>

                <div className="min-w-0">
                  <p className="whitespace-nowrap font-semibold text-slate-900">
                    {formatAppointmentDate(
                      appointment.appointment_date,
                    )}
                  </p>

                  <p className="mt-0.5 whitespace-nowrap text-xs text-slate-500">
                    {formatAppointmentTime(
                      appointment.start_time,
                    )}{" "}
                    •{" "}
                    {
                      appointment.duration_minutes
                    }{" "}
                    min
                  </p>
                </div>
                
              </div>
              
            </div>

            {/* Patient */}
            <div className="px-6 py-5">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600">
                  <UserRound size={18} />
                </div>

                <div className="min-w-0">
                  <p className="whitespace-nowrap font-semibold text-slate-900">
                    {
                      appointment.patient_first_name
                    }{" "}
                    {
                      appointment.patient_last_name
                    }
                  </p>

                  <p className="mt-1 flex items-center gap-1.5 whitespace-nowrap text-xs text-slate-500">
                    <Phone
                      size={13}
                      className="shrink-0"
                    />

                    {appointment.patient_phone ||
                      "No phone number"}
                  </p>
                </div>
              </div>
            </div>

            {/* Physician */}
            <div className="px-6 py-5">
              <div className="min-w-0">
                <div className="flex items-center gap-2 whitespace-nowrap text-sm text-slate-700">
                  <Stethoscope
                    size={17}
                    className="shrink-0 text-[#13B2B3]"
                  />

                  <span>
                    {formatDoctorName(appointment.doctor_first_name, appointment.doctor_last_name)}
                  </span>
                </div>

                <p className="mt-1 whitespace-nowrap text-xs text-slate-500">
                  {
                    appointment.appointment_type
                  }
                </p>
              </div>
            </div>

            {/* Reason */}
              <div className="px-6 py-5">
                <div className="max-w-[240px]">
                  {/* Reason */}
                  <div>
                    <p className="text-xs font-semibold text-slate-700">
                      Reason:
                    </p>

                    <p className="mt-0.5 text-sm leading-5 text-slate-600">
                      {appointment.status ===
                      "missed"
                        ? appointment.missed_reason ||
                          appointment.reason_for_visit ||
                          "Missed appointment"
                        : appointment.cancellation_reason ||
                          appointment.reason_for_visit ||
                          "Cancelled appointment"}
                    </p>
                  </div>

                  {/* Rebooked follow-up */}
                  {appointment.follow_up_status ===
                    "rebooked" && (
                    <div className="mt-3 text-xs leading-5 text-slate-500">
                      <p className="font-semibold text-slate-700">
                        Follow-up:
                      </p>

                      {appointment.rebooked_appointment_date &&
                      appointment.rebooked_start_time ? (
                        <>
                          <p className="mt-0.5">
                            Rebooked{" "}
                            {formatAppointmentDate(
                              appointment.rebooked_appointment_date,
                            )}{" "}
                            ·{" "}
                            {formatAppointmentTime(
                              appointment.rebooked_start_time,
                            )}
                          </p>

                          {appointment.rebooked_doctor_first_name &&
                            appointment.rebooked_doctor_last_name && (
                              <p>
                                Dr.{" "}
                                {appointment.rebooked_doctor_first_name}{" "}
                                {appointment.rebooked_doctor_last_name}
                              </p>
                            )}
                        </>
                      ) : (
                        <p className="mt-0.5">
                          Patient rebooked
                        </p>
                      )}
                    </div>
                  )}

                  {/* Resolved follow-up */}
                  {appointment.follow_up_status ===
                    "resolved" && (
                    <div className="mt-3 text-xs leading-5 text-slate-500">
                      <p className="font-semibold text-slate-700">
                        Follow-up:
                      </p>

                      <p className="mt-0.5">
                        {appointment.follow_up_reason ||
                          "No further follow-up needed"}
                      </p>

                      {appointment.follow_up_notes && (
                        <div className="mt-2">
                          <p className="font-semibold text-slate-700">
                            Notes:
                          </p>

                          <p className="mt-0.5">
                            {appointment.follow_up_notes}
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

            {/* Status */}
            <div className="flex justify-center px-3 py-5">
              {appointment.follow_up_status ===
              "rebooked" ? (
                <span className="inline-flex whitespace-nowrap rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                  Rebooked
                </span>
              ) : appointment.follow_up_status ===
                "resolved" ? (
                <span className="inline-flex whitespace-nowrap rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                  Resolved
                </span>
              ) : appointment.status ===
                "cancelled" ? (
                <div className="inline-flex shrink-0 overflow-hidden whitespace-nowrap rounded-full border border-slate-200">
                  <span className="inline-flex items-center border-r border-rose-200 bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700">
                    Cancelled
                  </span>

                  <span className="inline-flex items-center bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
                    {appointment.cancelled_by ===
                    "patient"
                      ? "Patient"
                      : "Staff"}
                  </span>
                </div>
              ) : (
                <span className="inline-flex whitespace-nowrap rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
                  Missed
                </span>
              )}
            </div>

            {/* Actions */}
            <div className="px-4 py-5">
              <div className="flex items-center justify-center gap-2">
                {!isResolved ? (
                  <>
                    {appointment.patient_phone && (
                      <div className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 text-xs font-semibold text-slate-500">
                        <Phone size={14} />
                        Call
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={() =>
                        handleRebook(appointment)
                      }
                      className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-[#13B2B3]/30 bg-[#13B2B3]/5 px-3 text-xs font-semibold text-[#0d8587] transition hover:bg-[#13B2B3]/10"
                    >
                      <RotateCcw size={14} />
                      Rebook
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        openResolveModal(appointment)
                      }
                      className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-slate-950 px-3 text-xs font-semibold text-white transition hover:bg-slate-800"
                    >
                      <CheckCircle2 size={14} />
                      Resolve
                    </button>
                  </>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-600">
                    <CheckCircle2 size={14} />
                    Completed
                  </span>
                )}
                  </div>
            </div>
          </div>
        );
      },
    )}
  </div>

    </>
  )}
</div>

      </section>

      {/* Resolve modal */}
      {resolvingAppointment && (
        <div data-dialog className="fixed inset-0 z-[120] flex items-center justify-center overflow-y-auto bg-slate-950/40 px-4 backdrop-blur-[2px]">
          <div className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white shadow-2xl max-h-[calc(100dvh-2rem)] overflow-y-auto">
            <div className="flex items-start justify-between border-b border-slate-200 px-6 py-5">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#13B2B3]">
                  Follow-up
                </p>

                <h2 className="mt-1 text-xl font-bold text-slate-950">
                    {resolvingAppointment.status ===
                    "cancelled"
                        ? "Resolve Cancelled Appointment"
                        : "Resolve Missed Appointment"}
                    </h2>

                <p className="mt-1 text-sm text-slate-500">
                  {
                    resolvingAppointment.patient_first_name
                  }{" "}
                  {
                    resolvingAppointment.patient_last_name
                  }
                </p>
              </div>

              <button
                type="button"
                onClick={
                  closeResolveModal
                }
                className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-5 px-6 py-6">
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
                <p className="text-sm font-semibold text-amber-900">
                  Use Resolve when the
                  patient does not need
                  another appointment
                  right now.
                </p>

                <p className="mt-1 text-xs leading-5 text-amber-700">
                  If the patient wants
                  another appointment,
                  cancel this dialog and
                  use Rebook instead.
                </p>
              </div>

              <div>
                <label className="text-sm font-bold text-slate-800">
                  Resolution reason{" "}
                  <span className="text-rose-500">
                    *
                  </span>
                </label>

                <select
                  value={resolveReason}
                  onChange={(event) => {
                    setResolveReason(
                      event.target.value,
                    );

                    setResolveError("");
                  }}
                  className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-[#13B2B3] focus:ring-4 focus:ring-[#13B2B3]/10"
                >
                  <option value="">
                    Select a reason
                  </option>

                  <option value="Patient declined to rebook">
                    Patient declined to rebook
                  </option>

                  <option value="Patient will call back">
                    Patient will call back
                  </option>

                  <option value="No further follow-up needed">
                    No further follow-up needed
                  </option>

                  <option value="Other">
                    Other
                  </option>
                </select>
              </div>

              <div>
                <label className="text-sm font-bold text-slate-800">
                  Notes{" "}
                  <span className="font-normal text-slate-400">
                    {resolveReason === "Other"
                      ? "(required)"
                      : "(optional)"}
                  </span>
                </label>

                <textarea
                  rows={4}
                  value={resolveNotes}
                  onChange={(event) => {
                    setResolveNotes(
                      event.target.value,
                    );

                    setResolveError("");
                  }}
                  placeholder={
                    resolveReason === "Other"
                      ? "Describe how this follow-up was resolved."
                      : "Add any additional context for staff..."
                  }
                  className="mt-2 w-full resize-none rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-[#13B2B3] focus:ring-4 focus:ring-[#13B2B3]/10"
                />

                <p className="mt-2 text-xs text-slate-400">
                  Notes will remain with the appointment
                  follow-up history.
                </p>
              </div>

              {resolveError && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
                  {resolveError}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 border-t border-slate-200 bg-slate-50 px-6 py-4">
              <button
                type="button"
                disabled={
                  isResolving
                }
                onClick={
                  closeResolveModal
                }
                className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
              >
                Cancel
              </button>

              <button
                type="button"
                disabled={
                  isResolving
                }
                onClick={() =>
                  void handleResolve()
                }
                className="flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isResolving ? (
                  <>
                    <LoaderCircle
                      size={16}
                      className="animate-spin"
                    />
                    Resolving...
                  </>
                ) : (
                  <>
                    <CheckCircle2
                      size={16}
                    />
                    Resolve
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default MissedCancelledAppointmentsPage;