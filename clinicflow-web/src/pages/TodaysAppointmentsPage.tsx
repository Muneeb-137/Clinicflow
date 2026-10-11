import { CLINIC_TIME_ZONE } from "../utils/clinicTime";
import { useClinicFlowRefresh } from "../hooks/useClinicFlowRefresh";
import { formatDoctorName } from "../utils/formatDoctorName";
import { apiFetch } from "../lib/api";
import { useEffect, useState } from "react";
import {
  CalendarDays,
  Clock3,
  LoaderCircle,
  Phone,
  Stethoscope,
  UserRound,
  X,
  XCircle,
} from "lucide-react";
import { ShortVisitBadge } from "../components/waittime/ShortVisitBadge";

type Appointment = {
  appointment_id: number;
  appointment_date: string;
  start_time: string | null;
  duration_minutes: number;
  status: string;
  reason_for_visit: string | null;

  arrived_at: string | null;

  patient_id: number;
  patient_first_name: string;
  patient_last_name: string;
  patient_phone: string | null;

  doctor_id: number | null;
  doctor_first_name: string | null;
  doctor_last_name: string | null;

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

  // Walk-in accepted near the end of walk-in hours.
  walk_in_capacity_override?: boolean;
};

function TodaysAppointmentsPage() {
  
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [activeVisitType, setActiveVisitType] =
  useState<"scheduled" | "walk_in">("scheduled");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  // Failed actions (cancel, forms) are shown inside the
  // open modal so the list stays visible.
  const [actionError, setActionError] = useState("");
  const [
    cancellingAppointment,
    setCancellingAppointment,
  ] = useState<Appointment | null>(
    null,
  );

  const [
    cancellationReason,
    setCancellationReason,
  ] = useState("");

  const [
    isCancelling,
    setIsCancelling,
  ] = useState(false);

  const [
    successMessage,
    setSuccessMessage,
  ] = useState("");

  const [
    updatingFormsAppointmentId,
    setUpdatingFormsAppointmentId,
  ] = useState<number | null>(null);

  const [
    formsAppointment,
    setFormsAppointment,
  ] = useState<Appointment | null>(null);

  const liveVersion = useClinicFlowRefresh();

  useEffect(() => {
    const getTodaysAppointments = async () => {
      try {
        // Spinner on first load only; live refreshes
        // update the list in place.
        if (liveVersion === 0) {
          setIsLoading(true);
        }

        setError("");

        const response = await apiFetch(
          "/api/appointments/today"
        );

        if (!response.ok) {
          throw new Error("Unable to load today's appointments.");
        }

        const data: Appointment[] = await response.json();

        setAppointments(data);
      } catch (error) {
        console.error("Error fetching today's appointments:", error);

        setError(
          error instanceof Error
            ? error.message
            : "Something went wrong while loading appointments."
        );
      } finally {
        setIsLoading(false);
      }
    };

    getTodaysAppointments();
  }, [liveVersion]);

  const formatAppointmentTime = (
    time: string | null,
  ) => {
    if (!time) {
      return "—";
    }

    const [hours, minutes] = time.split(":");

    const date = new Date();
    date.setHours(Number(hours), Number(minutes), 0);

    return date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });
  };

  const formatArrivalTime = (
    timestamp: string | null,
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
    });
  };

  const formatStatus = (status: string) => {
    return status
      .split("_")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  };

  const getStatusClasses = (status: string) => {
    switch (status) {
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

      case "missed":
        return "border-amber-200 bg-amber-50 text-amber-700";

      default:
        return "border-slate-200 bg-white text-slate-600";
    }
  };

  const openCancelModal = (
  appointment: Appointment,
) => {
  setCancellingAppointment(
    appointment,
  );

  setCancellationReason("");
  setActionError("");
};

const closeCancelModal = () => {
  if (isCancelling) {
    return;
  }

  setCancellingAppointment(
    null,
  );

  setCancellationReason("");
  setActionError("");
};

const canCancelAppointment = (
  appointment: Appointment,
) =>
  appointment.status === "scheduled" ||
  appointment.status === "checked_in";

const handleCancelAppointment =
  async () => {
    if (!cancellingAppointment) {
      return;
    }

    if (
      !cancellationReason.trim()
    ) {
      setActionError(
        "Please enter a cancellation reason.",
      );

      return;
    }

    try {
      setIsCancelling(true);
      setActionError("");

      const response =
        await apiFetch(
          `/api/appointments/${cancellingAppointment.appointment_id}/status`,
          {
            method: "PATCH",

            headers: {
              "Content-Type":
                "application/json",
            },

            body: JSON.stringify({
              status: "cancelled",

              cancellation_reason:
                cancellationReason.trim(),
            }),
          },
        );

      const responseData =
        await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          responseData.message ||
            responseData.error ||
            "Unable to cancel the appointment.",
        );
      }

      /*
 * Keep today's cancelled appointment
 * visible and update its status.
 */
      setAppointments(
        (currentAppointments) =>
          currentAppointments.map(
            (appointment) =>
              appointment.appointment_id ===
              cancellingAppointment.appointment_id
                ? {
                    ...appointment,
                    status: "cancelled",
                  }
                : appointment,
          ),
      );

      const patientName =
        `${cancellingAppointment.patient_first_name} ${cancellingAppointment.patient_last_name}`;

      setCancellingAppointment(
        null,
      );

      setCancellationReason("");

      setSuccessMessage(
        `${patientName}'s appointment was cancelled.`,
      );

      window.setTimeout(() => {
        setSuccessMessage("");
      }, 4000);
    } catch (error) {
      console.error(
        "Error cancelling appointment:",
        error,
      );

      setActionError(
        error instanceof Error
          ? error.message
          : "Unable to cancel the appointment.",
      );
    } finally {
      setIsCancelling(false);
    }
  };

  // Returns true on success so the modal only
  // closes when the update went through.
  const handleCompleteForms = async (
  appointment: Appointment,
): Promise<boolean> => {
  try {
    setUpdatingFormsAppointmentId(
      appointment.appointment_id,
    );

    setActionError("");

    const response = await apiFetch(
      `/api/appointments/${appointment.appointment_id}/forms`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
      },
    );

    const responseData =
      await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(
        responseData.message ||
          "Unable to complete patient forms.",
      );
    }

    /*
     * Update every appointment currently
     * displayed for this patient.
     *
     * The backend remembers completion at
     * the patient level, so all active visits
     * for this patient should now show completed.
     */
    setAppointments(
      (currentAppointments) =>
        currentAppointments.map(
          (currentAppointment) =>
            currentAppointment.patient_id ===
            appointment.patient_id
              ? {
                  ...currentAppointment,
                  forms_status: "completed",
                  readiness_status: "ready",
                }
              : currentAppointment,
        ),
    );

    const patientName =
      `${appointment.patient_first_name} ${appointment.patient_last_name}`;

    setSuccessMessage(
      `${patientName}'s forms were marked as completed.`,
    );

    window.setTimeout(() => {
      setSuccessMessage("");
    }, 4000);

    return true;
  } catch (error) {
    console.error(
      "Error completing forms:",
      error,
    );

    setActionError(
      error instanceof Error
        ? error.message
        : "Unable to complete patient forms.",
    );

    return false;
  } finally {
    setUpdatingFormsAppointmentId(null);
  }
};

    const scheduledAppointments =
      appointments.filter(
        (appointment) =>
          appointment.visit_type === "scheduled",
      );

    const walkInAppointments =
      appointments.filter(
        (appointment) =>
          appointment.visit_type === "walk_in",
      );

    const visibleAppointments =
      activeVisitType === "scheduled"
        ? scheduledAppointments
        : walkInAppointments;

  if (isLoading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="flex items-center gap-3 text-slate-500">
          <LoaderCircle className="animate-spin" size={22} />
          <span>Loading today's appointments...</span>
        </div>
      </div>
    );
  }



  return (
    <section className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-[#13B2B3]">
            <CalendarDays size={18} />
            Daily schedule
          </div>

          <h1 className="text-3xl font-bold tracking-tight text-slate-950">
            Today's Appointments
          </h1>

          <p className="mt-2 text-sm text-slate-500">
          View and manage today's scheduled and walk-in visits.
        </p>
        </div>

        <div className="w-fit rounded-2xl border border-slate-200 bg-white px-5 py-3 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
            Total visits
          </p>

          <p className="mt-1 text-2xl font-bold text-slate-950">
            {appointments.length}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() =>
            setActiveVisitType("scheduled")
          }
          className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
            activeVisitType === "scheduled"
              ? "bg-[#13B2B3] text-white shadow-sm"
              : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
          }`}
        >
          Scheduled
          <span className="ml-2">
            {scheduledAppointments.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() =>
            setActiveVisitType("walk_in")
          }
          className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
            activeVisitType === "walk_in"
              ? "bg-[#13B2B3] text-white shadow-sm"
              : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
          }`}
        >
          Walk-Ins
          <span className="ml-2">
            {walkInAppointments.length}
          </span>
        </button>
      </div>

      {error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-700">
          {error}
        </div>
      )}

      {successMessage && (
  <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm font-medium text-emerald-700">
    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100">
      ✓
    </span>

    {successMessage}
  </div>
)}

      {!error && appointments.length === 0 && (
        <div className="rounded-3xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-teal-50 text-[#13B2B3]">
            <CalendarDays size={26} />
          </div>

          <h2 className="mt-5 text-lg font-semibold text-slate-900">
            No appointments scheduled today
          </h2>

          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">
            Appointments booked for today will appear here automatically.
          </p>
        </div>
      )}

      
    {!error &&
      appointments.length > 0 &&
      visibleAppointments.length === 0 && (
        <div className="rounded-3xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
          <CalendarDays
            size={26}
            className="mx-auto text-[#13B2B3]"
          />

          <h2 className="mt-4 text-lg font-semibold text-slate-900">
            {activeVisitType === "walk_in"
              ? "No walk-ins today"
              : "No scheduled appointments today"}
          </h2>

          <p className="mt-2 text-sm text-slate-500">
            {activeVisitType === "walk_in"
              ? "Walk-in patients added today will appear here."
              : "Booked appointments for today will appear here."}
          </p>
        </div>
      )}

      {!error && visibleAppointments.length > 0 && (
        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead className="border-b border-slate-200 bg-slate-50">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                    {activeVisitType === "walk_in"
                      ? "Arrived"
                      : "Time"}
                  </th>

                  <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                    Patient
                  </th>

                  <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                    Appointment
                  </th>

                  <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                    Doctor
                  </th>

                  <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                    Status
                  </th>

                  <th className="px-6 py-4 text-right text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                    Actions
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {visibleAppointments.map((appointment) => (
                  <tr
                    key={appointment.appointment_id}
                    className="transition-colors hover:bg-slate-50/80"
                  >
                    <td className="whitespace-nowrap px-6 py-5">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-50 text-[#13B2B3]">
                          <Clock3 size={19} />
                        </div>

                        <div>
                          <p className="font-semibold text-slate-900">
                            {appointment.visit_type === "walk_in"
                              ? formatArrivalTime(appointment.arrived_at)
                              : formatAppointmentTime(appointment.start_time
                                
                              )}
                          </p>

                          <p className="mt-0.5 text-xs text-slate-500">
                            {appointment.visit_type === "walk_in"
                              ? "Arrived"
                              : `${appointment.duration_minutes} minutes`}
                          </p>
                        </div>
                      </div>
                    </td>

                    <td className="px-6 py-5">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600">
                          <UserRound size={18} />
                        </div>

                        <div>
                          <p className="font-semibold text-slate-900">
                            {appointment.patient_first_name}{" "}
                            {appointment.patient_last_name}
                          </p>

                          {appointment.patient_phone && (
                            <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
                              <Phone size={13} />
                              {appointment.patient_phone}
                            </p>
                          )}
                        </div>
                      </div>
                    </td>

                    <td className="px-6 py-5">
                      <div>
                        <p className="font-semibold text-slate-900">
                          {appointment.appointment_type}
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

                          {appointment.visit_type === "walk_in" &&
                            appointment.walk_in_capacity_override && (
                              <ShortVisitBadge />
                            )}

                          <span className="text-slate-300">
                            •
                          </span>

                          {appointment.forms_status === "completed" ? (
                            <span className="text-xs font-medium text-emerald-700">
                              Forms Completed
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                setActionError("");
                                setFormsAppointment(appointment);
                              }}
                              disabled={
                                updatingFormsAppointmentId ===
                                appointment.appointment_id
                              }
                              className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {updatingFormsAppointmentId ===
                              appointment.appointment_id
                                ? "Updating..."
                                : "Forms Pending"}
                            </button>
                          )}
                        </div>

                        <p className="mt-1 max-w-[240px] truncate text-xs text-slate-500">
                          {appointment.reason_for_visit ||
                            "No reason provided"}
                        </p>
                      </div>
                    </td>

                    <td className="px-6 py-5">
                      <div className="flex items-center gap-2 text-sm text-slate-700">
                        <Stethoscope size={17} className="text-[#13B2B3]" />

                        <span>
                          {formatDoctorName(appointment.doctor_first_name, appointment.doctor_last_name)}
                        </span>
                      </div>
                    </td>

                    <td className="px-6 py-5">
                      <span
                        className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${getStatusClasses(
                          appointment.status
                        )}`}
                      >
                        {formatStatus(appointment.status)}
                      </span>
                    </td>

                    <td className="whitespace-nowrap px-6 py-5 text-right">
                      {canCancelAppointment(appointment) ? (
                        <button
                          type="button"
                          onClick={() =>
                            openCancelModal(appointment)
                          }
                          className="inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-white px-3.5 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-50"
                        >
                          <XCircle size={15} />
                          Cancel
                        </button>
                      ) : (
                        <span className="text-xs text-slate-400">
                          —
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {formsAppointment && (
  <div data-dialog className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-slate-950/40 px-4 backdrop-blur-[2px]">
    <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl max-h-[calc(100dvh-2rem)] overflow-y-auto">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#0d8587]">
          Patient Forms
        </p>

        <h2 className="mt-2 text-xl font-bold text-slate-950">
          Confirm forms completed
        </h2>

        <p className="mt-2 text-sm leading-6 text-slate-500">
          Confirm that this patient has completed their
          required initial forms.
        </p>
      </div>

      <div className="mt-5 rounded-2xl bg-slate-50 p-4">
        <p className="font-semibold text-slate-900">
          {formsAppointment.patient_first_name}{" "}
          {formsAppointment.patient_last_name}
        </p>

        <p className="mt-1 text-sm text-slate-500">
          Once confirmed, future visits for this patient
          will automatically show Forms Completed.
        </p>
      </div>

      {actionError && (
        <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {actionError}
        </div>
      )}

      <div className="mt-6 flex justify-end gap-3">
        <button
          type="button"
          onClick={() => {
            setFormsAppointment(null);
            setActionError("");
          }}
          disabled={
            updatingFormsAppointmentId !== null
          }
          className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
        >
          Cancel
        </button>

        <button
          type="button"
          onClick={async () => {
            const succeeded =
              await handleCompleteForms(
                formsAppointment,
              );

            if (succeeded) {
              setFormsAppointment(null);
            }
          }}
          disabled={
            updatingFormsAppointmentId !== null
          }
          className="inline-flex items-center gap-2 rounded-xl bg-[#13B2B3] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#0f999a] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {updatingFormsAppointmentId !== null ? (
            <LoaderCircle
              size={16}
              className="animate-spin"
            />
          ) : null}

          {updatingFormsAppointmentId !== null
            ? "Updating..."
            : "Mark Completed"}
        </button>
      </div>
    </div>
  </div>
)}

      {cancellingAppointment && (
  <div data-dialog className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-slate-950/40 px-4 backdrop-blur-[2px]">
    <div className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl max-h-[calc(100dvh-2rem)] overflow-y-auto">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-rose-600">
            Cancel appointment
          </p>

          <h2 className="mt-2 text-xl font-bold text-slate-950">
            Confirm cancellation
          </h2>

          <p className="mt-2 text-sm leading-6 text-slate-500">
            This appointment will remain
            visible in today's schedule and
            be marked as cancelled.
          </p>
        </div>

        <button
          type="button"
          onClick={closeCancelModal}
          disabled={isCancelling}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
        >
          <X size={19} />
        </button>
      </div>

      <div className="mt-5 rounded-2xl bg-slate-50 p-4">
        <p className="font-semibold text-slate-900">
          {
            cancellingAppointment.patient_first_name
          }{" "}
          {
            cancellingAppointment.patient_last_name
          }
        </p>

        <p className="mt-1 text-sm text-slate-500">
          {cancellingAppointment.visit_type === "walk_in"
            ? `Arrived ${formatArrivalTime(cancellingAppointment.arrived_at)}`
            : formatAppointmentTime(
                cancellingAppointment.start_time,
              )}{" "}
          • {formatDoctorName(cancellingAppointment.doctor_first_name, cancellingAppointment.doctor_last_name)}
        </p>
      </div>

      {actionError && (
        <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {actionError}
        </div>
      )}

      <div className="mt-5">
        <label className="text-sm font-semibold text-slate-700">
          Cancellation reason
          <span className="ml-1 text-rose-500">
            *
          </span>
        </label>

        <textarea
          value={cancellationReason}
          onChange={(event) =>
            setCancellationReason(
              event.target.value,
            )
          }
          rows={4}
          placeholder="Example: Patient called and is unable to attend."
          className="mt-2 w-full resize-none rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-rose-400 focus:ring-2 focus:ring-rose-100"
        />
      </div>

      <div className="mt-6 flex justify-end gap-3">
        <button
          type="button"
          onClick={closeCancelModal}
          disabled={isCancelling}
          className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
        >
          Keep Appointment
        </button>

        <button
          type="button"
          onClick={() =>
            void handleCancelAppointment()
          }
          disabled={
            isCancelling ||
            !cancellationReason.trim()
          }
          className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isCancelling ? (
            <LoaderCircle
              size={16}
              className="animate-spin"
            />
          ) : (
            <XCircle size={16} />
          )}

          {isCancelling
            ? "Cancelling..."
            : "Cancel Appointment"}
        </button>
      </div>
    </div>
  </div>
)}
    </section>
  );
}

export default TodaysAppointmentsPage;