import { CLINIC_TIME_ZONE } from "../utils/clinicTime";
import { apiFetch } from "../lib/api";
import {
  Clock3,
  DoorOpen,
  Stethoscope,
  UsersRound,
  X,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useState,
} from "react";

import { socket } from "../socket";
import { ShortVisitBadge } from "../components/waittime/ShortVisitBadge";
import LiveIndicator from "../components/LiveIndicator";

type DoctorQueueAppointment = {
  appointment_id: number;
  appointment_date: string;
  start_time: string | null;
  duration_minutes: number;
  status: "checked_in" | "roomed";

  reason_for_visit: string | null;

 checked_in_at: string | null;
  roomed_at: string | null;
  consult_started_at: string | null;
  consult_ended_at: string | null;
  completed_at: string | null;

  patient_id: number;
  patient_first_name: string;
  patient_last_name: string;
  patient_phone: string | null;

  doctor_id: number;
  doctor_first_name: string;
  doctor_last_name: string;

  appointment_type_id: number | null;
  appointment_type: string | null;

  waiting_minutes: number | string;
  visit_type:
  | "scheduled"
  | "walk_in";

  booking_channel:
  | "patient_portal"
  | "front_desk"
  | "phone";

  forms_status:
  | "pending"
  | "completed";

  readiness_status:
  | "pending"
  | "ready";

  // Walk-in accepted near the end of walk-in hours.
  walk_in_capacity_override?: boolean;
};

function DoctorQueuePage() {
  const [appointments, setAppointments] =
    useState<DoctorQueueAppointment[]>([]);

  const [loading, setLoading] =
    useState(true);


  const [error, setError] =
    useState("");

  // Failed actions (e.g. complete visit) show as a
  // dismissible banner; the queue stays visible.
  const [actionError, setActionError] =
    useState("");

  const [
    updatingAppointmentId,
    setUpdatingAppointmentId,
  ] = useState<number | null>(null);

  useEffect(() => {
    loadQueue();

    function handleClinicFlowUpdate() {
      loadQueue(true);
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
  }, []);

  async function loadQueue(
    backgroundRefresh = false,
  ) {
    try {
      if (!backgroundRefresh) {
        setLoading(true);
      }

      setError("");

      const response =
        await apiFetch(
          "/api/doctors/me/queue",
          {
            headers: {
            },
          },
        );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data.message ??
            "Unable to load your queue.",
        );
      }

      setAppointments(
        data as DoctorQueueAppointment[],
      );
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Unable to load your queue.",
      );
    } finally {
      setLoading(false);
    }
  }

async function completeVisit(
  appointmentId: number,
) {
  try {
    setUpdatingAppointmentId(
      appointmentId,
    );

    setActionError("");

      const response = await apiFetch(
      `/api/appointments/${appointmentId}/status`,
      {
        method: "PATCH",

        headers: {
          "Content-Type":
            "application/json",
        },

        body: JSON.stringify({
          status: "completed",
        }),
      },
    );

    const data =
      await response.json();

    if (!response.ok) {
      throw new Error(
        data.message ??
          "Unable to complete the visit.",
      );
    }

    await loadQueue(true);
  } catch (error) {
    setActionError(
      error instanceof Error
        ? error.message
        : "Unable to complete the visit.",
    );
  } finally {
    setUpdatingAppointmentId(null);
  }
}

  function formatTime(
    value: string | null,
  ) {
    if (!value) {
      return "Not available";
    }

    const date =
      new Date(value);

    if (
      !Number.isNaN(
        date.getTime(),
      )
    ) {
      return date.toLocaleTimeString("en-US", {
      timeZone: CLINIC_TIME_ZONE,
          hour: "numeric",
          minute: "2-digit",
        },
      );
    }

    const [
      hourString,
      minuteString,
    ] = value.split(":");

    const hour =
      Number(hourString);

    if (
      Number.isNaN(hour) ||
      !minuteString
    ) {
      return value;
    }

    const suffix =
      hour >= 12 ? "PM" : "AM";

    const displayHour =
      hour % 12 || 12;

    return `${displayHour}:${minuteString} ${suffix}`;
  }

  function getInitials(
    firstName: string,
    lastName: string,
  ) {
    return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
  }

  const waitingAppointments =
    useMemo(
      () =>
        appointments.filter(
          (appointment) =>
            appointment.status ===
            "checked_in",
        ),
      [appointments],
    );

  const roomedAppointments =
    useMemo(
      () =>
        appointments.filter(
          (appointment) =>
            appointment.status ===
            "roomed",
        ),
      [appointments],
    );

 

  return (
    <section className="space-y-6">

      {/* HEADER */}

      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-[#13B2B3]">
            <UsersRound size={18} />

            Physician queue
          </div>

          <h1 className="text-3xl font-bold text-slate-950">
            My Queue
          </h1>

          <p className="mt-1 text-slate-500">
            Patients currently waiting
            for you or already in your
            care.
          </p>
        </div>

        <LiveIndicator />
      </div>

      {/* SUMMARY */}

      <div className="grid gap-4 sm:grid-cols-2">

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-slate-500">
              Waiting for me
            </p>

            <UsersRound
              size={19}
              className="text-[#13B2B3]"
            />
          </div>

          <p className="mt-3 text-3xl font-bold text-slate-950">
            {
              waitingAppointments.length
            }
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-slate-500">
              In visit
            </p>

            <DoorOpen
              size={19}
              className="text-[#13B2B3]"
            />
          </div>

          <p className="mt-3 text-3xl font-bold text-slate-950">
            {
              roomedAppointments.length
            }
          </p>
        </div>
        </div>

     
      {/* ERROR */}

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          {error}
        </div>
      )}

      {actionError && (
        <div className="flex items-start justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          <span>{actionError}</span>

          <button
            type="button"
            onClick={() =>
              setActionError("")
            }
            aria-label="Dismiss error"
            className="shrink-0 rounded-md text-red-400 transition hover:text-red-700"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* LOADING */}

      {loading && (
        <div className="flex min-h-[280px] items-center justify-center rounded-2xl border border-slate-200 bg-white">
          <div className="flex items-center gap-3 text-sm font-medium text-slate-500">
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-slate-200 border-t-[#13B2B3]" />

            Loading your queue...
          </div>
        </div>
      )}

      {!loading && !error && (
        <div className="grid gap-6 xl:grid-cols-2">

          {/* WAITING */}

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-6 py-5">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-bold text-slate-950">
                    Waiting for You
                  </h2>

                  <p className="mt-1 text-sm text-slate-500">
                    Checked-in patients
                    waiting to be seen.
                  </p>
                </div>

                <span className="rounded-full bg-[#13B2B3]/10 px-3 py-1 text-xs font-bold text-[#0d8587]">
                  {
                    waitingAppointments.length
                  }
                </span>
              </div>
            </div>

            {waitingAppointments.length ===
            0 ? (
              <div className="flex min-h-[240px] flex-col items-center justify-center px-6 text-center">
                <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
                  <UsersRound
                    size={26}
                  />
                </div>

                <p className="font-bold text-slate-900">
                  No patients waiting
                </p>

                <p className="mt-1 text-sm text-slate-500">
                  Patients will appear
                  here after staff checks
                  them in.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {waitingAppointments.map(
                  (
                    appointment,
                    index,
                  ) => (
                    <div
                      key={
                        appointment.appointment_id
                      }
                      className="px-6 py-5"
                    >
                      <div className="flex items-start gap-4">

                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-950 text-sm font-bold text-white">
                          {index + 1}
                        </div>

                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#13B2B3]/10 text-sm font-bold text-[#13B2B3]">
                          {getInitials(
                            appointment.patient_first_name,
                            appointment.patient_last_name,
                          )}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="font-bold text-slate-950">
                              {
                                appointment.patient_first_name
                              }{" "}
                              {
                                appointment.patient_last_name
                              }
                            </p>

                            <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-700">
                              {Math.floor(
                                Number(
                                  appointment.waiting_minutes,
                                ) ||
                                  0,
                              )}{" "}
                              min
                            </span>
                          </div>

                          <div className="mt-2 space-y-1 text-sm text-slate-500">
                            <p className="flex items-center gap-2">
                              <Clock3
                                size={15}
                                className="text-[#13B2B3]"
                              />

                              Checked in{" "}
                              {formatTime(
                                appointment.checked_in_at,
                              )}
                            </p>

                            <p className="flex items-center gap-2">
                              <Stethoscope
                                size={15}
                                className="text-[#13B2B3]"
                              />

                              {appointment.appointment_type ??
                                "Appointment"}
                            </p>
                          </div>

                          <div className="mt-3 flex flex-wrap items-center gap-2">
                            <span
                                className={`rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${
                                appointment.visit_type === "walk_in"
                                    ? "border-amber-200 bg-amber-50 text-amber-700"
                                    : "border-slate-200 bg-slate-50 text-slate-600"
                                }`}
                            >
                                {appointment.visit_type === "walk_in"
                                ? "Walk-In"
                                : "Booked Patient"}
                            </span>

                            {appointment.walk_in_capacity_override && (
                              <ShortVisitBadge variant="label" />
                            )}

                            <span
                                className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                                appointment.forms_status === "completed"
                                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                    : "border-amber-200 bg-amber-50 text-amber-700"
                                }`}
                            >
                                Forms:{" "}
                                {appointment.forms_status === "completed"
                                ? "Completed"
                                : "Pending"}
                            </span>

                            <span
                                className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                                appointment.readiness_status === "ready"
                                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                    : "border-slate-200 bg-slate-50 text-slate-600"
                                }`}
                            >
                                {appointment.readiness_status === "ready"
                                ? "Ready"
                                : "Pending"}
                            </span>
                            </div>

                          {appointment.reason_for_visit && (
                            <p className="mt-3 text-sm text-slate-600">
                              {
                                appointment.reason_for_visit
                              }
                            </p>
                          )}
                          
                        </div>
                      </div>
                    </div>
                  ),
                )}
              </div>
            )}
          </div>

          {/* IN VISIT */}

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-6 py-5">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-bold text-slate-950">
                    In Visit
                  </h2>

                  <p className="mt-1 text-sm text-slate-500">
                    Patients currently
                    roomed with you.
                  </p>
                </div>

                <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">
                  {
                    roomedAppointments.length
                  }
                </span>
              </div>
            </div>

            {roomedAppointments.length ===
            0 ? (
              <div className="flex min-h-[240px] flex-col items-center justify-center px-6 text-center">
                <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-500">
                  <DoorOpen
                    size={26}
                  />
                </div>

                <p className="font-bold text-slate-900">
                  No active visits
                </p>

                <p className="mt-1 text-sm text-slate-500">
                  Roomed patients will
                  appear here.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {roomedAppointments.map(
                  (appointment) => (
                    <div
                      key={
                        appointment.appointment_id
                      }
                      className="px-6 py-5"
                    >
                      <div className="flex items-start gap-4">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-sm font-bold text-blue-700">
                          {getInitials(
                            appointment.patient_first_name,
                            appointment.patient_last_name,
                          )}
                        </div>

                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-bold text-slate-950">
                              {
                                appointment.patient_first_name
                              }{" "}
                              {
                                appointment.patient_last_name
                              }
                            </p>

                            {appointment.walk_in_capacity_override && (
                              <ShortVisitBadge variant="label" />
                            )}
                          </div>

                          <p className="mt-2 flex items-center gap-2 text-sm text-slate-500">
                            <DoorOpen
                              size={15}
                              className="text-blue-500"
                            />

                            Roomed{" "}
                            {formatTime(
                              appointment.roomed_at,
                            )}
                          </p>

                          <p className="mt-1 text-sm text-slate-500">
                            {appointment.appointment_type ??
                              "Appointment"}
                          </p>

                          {appointment.consult_started_at ? (
                            <p className="mt-1 flex items-center gap-2 text-sm font-medium text-emerald-700">
                              <Stethoscope size={15} />

                              Visit started{" "}
                              {formatTime(
                                appointment.consult_started_at,
                              )}
                            </p>
                          ) : (
                            <p className="mt-1 text-sm font-medium text-amber-700">
                              Waiting for visit to start
                            </p>
                          )}

                          {appointment.reason_for_visit && (
                            <p className="mt-3 text-sm text-slate-600">
                              {
                                appointment.reason_for_visit
                              }
                            </p>
                          )}

                          <div className="mt-4">
                              <button
                                type="button"
                                onClick={() =>
                                  completeVisit(
                                    appointment.appointment_id,
                                  )
                                }
                                disabled={
                                  updatingAppointmentId ===
                                  appointment.appointment_id
                                }
                                className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                {updatingAppointmentId ===
                                appointment.appointment_id
                                  ? "Completing..."
                                  : "Complete Visit"}
                              </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ),
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

export default DoctorQueuePage;