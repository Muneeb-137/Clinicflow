import { useClinicFlowRefresh } from "../hooks/useClinicFlowRefresh";
import { formatDoctorName } from "../utils/formatDoctorName";
import { apiFetch } from "../lib/api";
import { useEffect, useMemo, useState } from "react";
import {
  CalendarClock,
  CheckCircle2,
  Clock3,
  Search,
  Stethoscope,
  UserRound,
} from "lucide-react";

import type { QueueAppointment } from "../types/appointment";

function CheckInPatientPage() {
  const [appointments, setAppointments] = useState<QueueAppointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkingInId, setCheckingInId] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const liveVersion = useClinicFlowRefresh();

  useEffect(() => {
    // Spinner on first load only; live refreshes
    // update the list in place.
    loadAppointments(liveVersion === 0);
  }, [liveVersion]);

  async function loadAppointments(showSpinner = true) {
    try {
      if (showSpinner) {
        setLoading(true);
      }

      setError("");

      const response = await apiFetch(
        "/api/appointments/check-in",
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message ?? "Unable to load appointments.");
      }

      setAppointments(data);
    } catch (error) {
      if (error instanceof Error) {
        setError(error.message);
      } else {
        setError("Unable to load appointments.");
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleCheckIn(appointmentId: number) {
  try {
    setCheckingInId(appointmentId);
    setError("");
    setSuccessMessage("");

    const checkedInAppointment = appointments.find(
      (appointment) =>
        appointment.appointment_id === appointmentId,
    );

    const response = await apiFetch(
      `/api/appointments/${appointmentId}/status`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          status: "checked_in",
        }),
      },
    );

    const contentType = response.headers.get("content-type");

    if (!contentType?.includes("application/json")) {
      const responseText = await response.text();

      console.error("Non-JSON response:", responseText);

      throw new Error(
        "The server returned an invalid response.",
      );
    }

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        data.message ?? "Unable to check in patient.",
      );
    }

    setAppointments((currentAppointments) =>
      currentAppointments.filter(
        (appointment) =>
          appointment.appointment_id !== appointmentId,
      ),
    );

    if (checkedInAppointment) {
      setSuccessMessage(
        `${checkedInAppointment.patient_first_name} ${checkedInAppointment.patient_last_name} has been checked in.`,
      );
    }
  } catch (error) {
    if (error instanceof Error) {
      setError(error.message);
    } else {
      setError("Unable to check in patient.");
    }
  } finally {
    setCheckingInId(null);
  }
}

  function formatTime(time: string | null | undefined) {
    if (!time) {
      return "Walk-in";
    }

    const [hoursString, minutesString] = time.split(":");
    const hours = Number(hoursString);
    const minutes = Number(minutesString);

    if (Number.isNaN(hours) || Number.isNaN(minutes)) {
      return time;
    }

    const period = hours >= 12 ? "PM" : "AM";
    const formattedHours = hours % 12 || 12;

    return `${formattedHours}:${minutes
      .toString()
      .padStart(2, "0")} ${period}`;
  }

  function getInitials(firstName: string, lastName: string) {
    return `${firstName?.charAt(0) ?? ""}${
      lastName?.charAt(0) ?? ""
    }`.toUpperCase();
  }

  const filteredAppointments = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    if (!normalizedSearch) {
      return appointments;
    }

    return appointments.filter((appointment) => {
      const patientName =
        `${appointment.patient_first_name} ${appointment.patient_last_name}`.toLowerCase();

      const doctorName =
        `${appointment.doctor_first_name ?? ""} ${appointment.doctor_last_name ?? ""}`.toLowerCase();

      const appointmentType =
        appointment.appointment_type?.toLowerCase() ?? "";

      return (
        patientName.includes(normalizedSearch) ||
        doctorName.includes(normalizedSearch) ||
        appointmentType.includes(normalizedSearch) ||
        appointment.start_time?.includes(normalizedSearch)
      );
    });
  }, [appointments, searchTerm]);

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-[#13B2B3]">
            <CheckCircle2 size={18} />
            Patient arrival
          </div>

          <h1 className="text-3xl font-bold text-slate-950">
            Check In Patient
          </h1>

          <p className="mt-1 text-slate-500">
            Find a scheduled patient and mark them as checked in.
          </p>
        </div>

        <div className="flex min-w-0 items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm xl:w-[380px]">
          <Search
            size={19}
            className="shrink-0 text-slate-400"
          />

          <input
            type="text"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Search patient, doctor or visit type"
            className="min-w-0 flex-1 bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
          />
        </div>
      </div>

      {successMessage && (
        <div className="flex items-center gap-3 rounded-xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm font-medium text-teal-800">
          <CheckCircle2
            size={19}
            className="shrink-0"
          />

          {successMessage}
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          {error}
        </div>
      )}

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-2 border-b border-slate-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-bold text-slate-900">
              Today&apos;s Scheduled Patients
            </h2>

            <p className="text-sm text-slate-500">
              Only patients who have not checked in are shown.
            </p>
          </div>

          {!loading && (
            <span className="w-fit rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">
              {filteredAppointments.length}{" "}
              {filteredAppointments.length === 1
                ? "appointment"
                : "appointments"}
            </span>
          )}
        </div>

        {loading && (
          <div className="flex min-h-[240px] items-center justify-center">
            <div className="flex items-center gap-3 text-sm font-medium text-slate-500">
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-slate-200 border-t-[#13B2B3]" />
              Loading appointments...
            </div>
          </div>
        )}

        {!loading && filteredAppointments.length === 0 && (
          <div className="flex min-h-[260px] flex-col items-center justify-center px-6 text-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#13B2B3]/10 text-[#13B2B3]">
              <CalendarClock size={27} />
            </div>

            <h3 className="font-bold text-slate-900">
              No patients found
            </h3>

            <p className="mt-1 max-w-md text-sm text-slate-500">
              There are no scheduled patients waiting to be checked in, or
              no appointments match your search.
            </p>
          </div>
        )}

        {!loading && filteredAppointments.length > 0 && (
          <div className="divide-y divide-slate-100">
            {filteredAppointments.map((appointment) => {
              const isCheckingIn =
                checkingInId === appointment.appointment_id;

              return (
                <article
                  key={appointment.appointment_id}
                  className="flex flex-col gap-4 px-5 py-5 transition-colors hover:bg-slate-50/70 lg:flex-row lg:items-center lg:justify-between"
                >
                  <div className="flex min-w-0 items-start gap-4">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#13B2B3]/10 text-sm font-bold text-[#13B2B3]">
                      {getInitials(
                        appointment.patient_first_name,
                        appointment.patient_last_name,
                      )}
                    </div>

                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="truncate text-base font-bold text-slate-950">
                          {appointment.patient_first_name}{" "}
                          {appointment.patient_last_name}
                        </h3>

                        <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                          Scheduled
                        </span>
                      </div>

                      <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-500">
                        <span className="flex items-center gap-1.5">
                          <Clock3
                            size={15}
                            className="text-[#13B2B3]"
                          />

                          {formatTime(appointment.start_time)}
                        </span>

                        <span className="flex items-center gap-1.5">
                          <Stethoscope
                            size={15}
                            className="text-[#13B2B3]"
                          />

                          {formatDoctorName(appointment.doctor_first_name, appointment.doctor_last_name)}
                        </span>

                        <span className="flex items-center gap-1.5">
                          <UserRound
                            size={15}
                            className="text-[#13B2B3]"
                          />

                          {appointment.appointment_type}
                        </span>
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      handleCheckIn(appointment.appointment_id)
                    }
                    disabled={isCheckingIn}
                    className="inline-flex min-w-[135px] items-center justify-center gap-2 rounded-xl bg-[#13B2B3] px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-[#109a9b] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isCheckingIn ? (
                      <>
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                        Checking in
                      </>
                    ) : (
                      <>
                        <CheckCircle2 size={17} />
                        Check In
                      </>
                    )}
                  </button>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

export default CheckInPatientPage;