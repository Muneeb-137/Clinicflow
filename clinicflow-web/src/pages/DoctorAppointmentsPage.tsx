import { CLINIC_TIME_ZONE } from "../utils/clinicTime";
import { apiFetch } from "../lib/api";
import { useEffect, useState } from "react";
import {
  CalendarDays,
  Clock3,
  LoaderCircle,
  Phone,
  UserRound,
} from "lucide-react";

type Appointment = {
  appointment_id: number;
  appointment_date: string;
  /*
   * NULL for walk-ins.
   */
  start_time: string | null;
  duration_minutes: number;
  status: string;
  reason_for_visit: string | null;

  checked_in_at?: string | null;
  roomed_at?: string | null;
  completed_at?: string | null;

  patient_id: number;
  patient_first_name: string;
  patient_last_name: string;
  patient_phone: string | null;

  appointment_type_id: number;
  appointment_type: string;

  visit_type:
  | "scheduled"
  | "walk_in";

  forms_status:
  | "pending"
  | "completed";

  readiness_status:
  | "pending"
  | "ready";
};

type DoctorTodayResponse = {
  doctor?: {
    doctor_id: number;
    first_name: string;
    last_name: string;
    specialty?: string | null;
  };

  appointments?: Appointment[];
};

function DoctorAppointmentsPage() {
  const [appointments, setAppointments] =
    useState<Appointment[]>([]);

  const [isLoading, setIsLoading] =
    useState(true);

  const [error, setError] =
    useState("");

  useEffect(() => {
    const getTodaysAppointments =
      async () => {
        try {
          setIsLoading(true);
          setError("");

      const response =
            await apiFetch(
              "/api/doctors/me/today",
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
                "Unable to load today's appointments.",
            );
          }

          /*
           * Supports either:
           *
           * [
           *   appointment,
           *   appointment
           * ]
           *
           * OR:
           *
           * {
           *   doctor: {...},
           *   appointments: [...]
           * }
           */

          if (Array.isArray(data)) {
            setAppointments(
              data as Appointment[],
            );
          } else {
            const typedData =
              data as DoctorTodayResponse;

            setAppointments(
              typedData.appointments ??
                [],
            );
          }
        } catch (error) {
          console.error(
            "Error fetching doctor appointments:",
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

    getTodaysAppointments();
  }, []);

  const formatAppointmentTime = (
    time?: string | null,
  ) => {
    if (!time) {
      return "—";
    }

    const [hours, minutes] =
      time.split(":");

    const date = new Date();

    date.setHours(
      Number(hours),
      Number(minutes),
      0,
    );

    return date.toLocaleTimeString(
      "en-US",
      {
        hour: "numeric",
        minute: "2-digit",
      },
    );
  };

  const formatTimestampTime = (
  timestamp?: string | null,
) => {
  if (!timestamp) {
    return "—";
  }

  const date = new Date(timestamp);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return date.toLocaleTimeString("en-US", {
      timeZone: CLINIC_TIME_ZONE,
      hour: "numeric",
      minute: "2-digit",
    },
  );
};

  const formatStatus = (
    status: string,
  ) => {
    return status
      .split("_")
      .map(
        (word) =>
          word.charAt(0).toUpperCase() +
          word.slice(1),
      )
      .join(" ");
  };

  const getStatusClasses = (
    status: string,
  ) => {
    switch (status) {
      case "scheduled":
        return "border-slate-200 bg-white text-slate-700";

      case "confirmed":
        return "border-blue-200 bg-blue-50 text-blue-700";

      case "checked_in":
        return "border-violet-200 bg-violet-50 text-violet-700";

      case "waiting":
        return "border-amber-200 bg-amber-50 text-amber-700";

      case "called":
        return "border-cyan-200 bg-cyan-50 text-cyan-700";

      case "roomed":
        return "border-indigo-200 bg-indigo-50 text-indigo-700";

      case "in_progress":
        return "border-teal-200 bg-teal-50 text-teal-700";

      case "completed":
        return "border-emerald-200 bg-emerald-50 text-emerald-700";

      case "cancelled":
        return "border-rose-200 bg-rose-50 text-rose-700";

      case "no_show":
        return "border-slate-300 bg-slate-100 text-slate-600";

      default:
        return "border-slate-200 bg-white text-slate-600";
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="flex items-center gap-3 text-slate-500">
          <LoaderCircle
            className="animate-spin"
            size={22}
          />

          <span>
            Loading today's
            appointments...
          </span>
        </div>
      </div>
    );
  }

  return (
    <section className="space-y-6">

      {/* PAGE HEADER */}

      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-[#13B2B3]">
            <CalendarDays
              size={18}
            />

            Daily schedule
          </div>

          <h1 className="text-3xl font-bold tracking-tight text-slate-950">
            My Appointments
          </h1>

          <p className="mt-2 text-sm text-slate-500">
            View every patient
            scheduled with you today.
          </p>
        </div>

        <div className="w-fit rounded-2xl border border-slate-200 bg-white px-5 py-3 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
            Total appointments
          </p>

          <p className="mt-1 text-2xl font-bold text-slate-950">
            {appointments.length}
          </p>
        </div>
      </div>

      {/* ERROR */}

      {error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-700">
          {error}
        </div>
      )}

      {/* EMPTY */}

      {!error &&
        appointments.length === 0 && (
          <div className="rounded-3xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-teal-50 text-[#13B2B3]">
              <CalendarDays
                size={26}
              />
            </div>

            <h2 className="mt-5 text-lg font-semibold text-slate-900">
              No appointments
              scheduled today
            </h2>

            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">
              Patients scheduled
              with you today will
              appear here
              automatically.
            </p>
          </div>
        )}

      {/* APPOINTMENT TABLE */}

      {!error &&
        appointments.length > 0 && (
          <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
            <div className="overflow-x-auto">

              <table className="min-w-full">

                {/* TABLE HEADER */}

                <thead className="border-b border-slate-200 bg-slate-50">
                  <tr>

                    <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                      Time/Arrival
                    </th>

                    <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                      Patient
                    </th>

                    <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                      Appointment
                    </th>

                    <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                      Status
                    </th>

                  </tr>
                </thead>

                {/* TABLE BODY */}

                <tbody className="divide-y divide-slate-100">

                  {appointments.map(
                    (appointment) => (
                      <tr
                        key={
                          appointment.appointment_id
                        }
                        className="transition-colors hover:bg-slate-50/80"
                      >

                        {/* TIME */}

                        <td className="whitespace-nowrap px-6 py-5">
                          <div className="flex items-center gap-3">

                            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-50 text-[#13B2B3]">
                              <Clock3
                                size={19}
                              />
                            </div>

                          <div>
                            <p className="font-semibold text-slate-900">
                              {appointment.visit_type === "walk_in" ||
                              !appointment.start_time
                                ? appointment.checked_in_at
                                  ? formatTimestampTime(
                                      appointment.checked_in_at,
                                    )
                                  : "Walk-in"
                                : formatAppointmentTime(
                                    appointment.start_time,
                                  )}
                            </p>

                            <p className="mt-0.5 text-xs text-slate-500">
                              {appointment.visit_type === "walk_in" ||
                              !appointment.start_time
                                ? appointment.checked_in_at
                                  ? "Walk-in arrival"
                                  : "Awaiting arrival"
                                : "Scheduled"}
                            </p>
                          </div>

                          </div>
                        </td>

                        {/* PATIENT */}

                        <td className="px-6 py-5">
                          <div className="flex items-center gap-3">

                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600">
                              <UserRound
                                size={18}
                              />
                            </div>

                            <div>
                              <p className="font-semibold text-slate-900">
                                {
                                  appointment.patient_first_name
                                }{" "}
                                {
                                  appointment.patient_last_name
                                }
                              </p>

                              {appointment.patient_phone && (
                                <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
                                  <Phone
                                    size={
                                      13
                                    }
                                  />

                                  {
                                    appointment.patient_phone
                                  }
                                </p>
                              )}
                            </div>

                          </div>
                        </td>

                        {/* APPOINTMENT */}

                        <td className="px-6 py-5">
                          <p className="font-medium text-slate-800">
                            {appointment.appointment_type ??
                              "Appointment"}
                          </p>

                           <div className="mt-1.5 flex flex-wrap items-center gap-2">
                            <span
                            className={`text-xs font-semibold ${
                                appointment.visit_type === "walk_in"
                                ? "text-amber-700"
                                : "text-[#0d8587]"
                            }`}
                            >
                            {appointment.visit_type === "walk_in"
                                ? "Walk-In"
                                : "Booked Patient"}
                            </span>

                            <span className="text-slate-300">
                            •
                            </span>

                            <span
                            className={`text-xs font-medium ${
                                appointment.forms_status === "completed"
                                ? "text-emerald-700"
                                : "text-amber-700"
                            }`}
                            >
                            Forms{" "}
                            {appointment.forms_status === "completed"
                                ? "Completed"
                                : "Pending"}
                            </span>
                        </div>

                          <p className="mt-1 max-w-[280px] truncate text-xs text-slate-500">
                            {appointment.reason_for_visit ||
                              "No reason provided"}
                          </p>

                          {/* VISIT TIMELINE */}

                          {(appointment.checked_in_at ||
                            appointment.roomed_at ||
                            appointment.completed_at) && (
                            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">

                              {appointment.checked_in_at && (
                                <span className="text-[11px] font-medium text-violet-600">
                                  Checked in
                                </span>
                              )}

                              {appointment.roomed_at && (
                                <span className="text-[11px] font-medium text-indigo-600">
                                  Roomed
                                </span>
                              )}

                              {appointment.completed_at && (
                                <span className="text-[11px] font-medium text-emerald-600">
                                  Completed
                                </span>
                              )}

                            </div>
                          )}
                        </td>

                        {/* STATUS */}

                        <td className="px-6 py-5">
                          <span
                            className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${getStatusClasses(
                              appointment.status,
                            )}`}
                          >
                            {formatStatus(
                              appointment.status,
                            )}
                          </span>
                        </td>

                      </tr>
                    ),
                  )}

                </tbody>
              </table>
            </div>
          </div>
        )}
    </section>
  );
}

export default DoctorAppointmentsPage;