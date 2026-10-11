import { apiFetch } from "../lib/api";
import { useClinicFlowRefresh } from "../hooks/useClinicFlowRefresh";
import {
  CalendarClock,
  CalendarDays,
  Clock3,
  LoaderCircle,
  RotateCcw,
  Stethoscope,
  X,
  XCircle,
} from "lucide-react";

import {
  useEffect,
  useState,
} from "react";
import {
  useLocation,
  useNavigate,
} from "react-router-dom";

import { usePatientAuth } from "../context/PatientAuthContext";

type Appointment = {
  appointment_id: number;

  patient_id: number;
  doctor_id: number;
  appointment_type_id: number;

  status?:
    | "scheduled"
    | "checked_in"
    | "roomed"
    | "completed"
    | "cancelled"
    | "missed";

  appointment_date?: string;
  start_time?: string;

  duration_minutes?: number;

  reason_for_visit?:
    | string
    | null;

  doctor_first_name?: string;
  doctor_last_name?: string;

  appointment_type_name?: string;

  cancelled_at?: string | null;
  cancelled_by?: string | null;

  cancellation_reason?:
    | string
    | null;

  missed_at?: string | null;

  missed_reason?:
    | string
    | null;

  rescheduled_to_appointment_id?: number | null;
  visit_type?: "scheduled" | "walk_in";
  follow_up_status?:
    | "pending"
    | "contacted"
    | "rebooked"
    | "resolved"
    | null;

  rebooked_from_appointment_id?:
    | number
    | null;
};

function PatientAppointmentsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const {
    patient,
    logout,
  } = usePatientAuth();

  const [appointments, setAppointments] =
    useState<Appointment[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState("");

  // Cancel failures are shown inside the modal
  // so the appointment list stays visible.
  const [actionError, setActionError] =
    useState("");

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

  const liveVersion = useClinicFlowRefresh();

  useEffect(() => {
    if (!patient) {
      setLoading(false);
      return;
    }

    async function loadAppointments() {
      try {
        // Spinner on first load only; live refreshes
        // update the list in place.
        if (liveVersion === 0) {
          setLoading(true);
        }

        setError("");

        const response = await apiFetch(
          "/api/patient-auth/me/appointments",
          {
            headers: {
            },
          },
        );

        const data =
          await response.json();

        if (response.status === 401) {
          logout();

          throw new Error(
            data.message ??
              "Your patient session is invalid or has expired.",
          );
        }

        if (!response.ok) {
          throw new Error(
            data.message ??
              "Unable to load appointments.",
          );
        }

        setAppointments(
          data.appointments ?? [],
        );
      } catch (error) {
        setError(
          error instanceof Error
            ? error.message
            : "Unable to load appointments.",
        );
      } finally {
        setLoading(false);
      }
    }

    loadAppointments();
  }, [patient, logout, liveVersion]);

  useEffect(() => {
  const state =
    location.state as {
      rebookSuccess?: boolean;
      rescheduled?: boolean;
    } | null;

  if (!state?.rebookSuccess) {
    return;
  }

  setSuccessMessage(
    state.rescheduled
      ? "Your appointment has been moved to the new time."
      : "Your appointment has been rebooked successfully.",
  );

  navigate(
    "/patient/appointments",
    {
      replace: true,
      state: null,
    },
  );
}, [
  location.state,
  navigate,
]);

  function formatDate(
    date?: string,
  ) {
    if (!date) {
      return "";
    }

    const dateOnly =
      date.slice(0, 10);

    const [
      year,
      month,
      day,
    ] = dateOnly
      .split("-")
      .map(Number);

    const localDate =
      new Date(
        year,
        month - 1,
        day,
      );

    return localDate.toLocaleDateString(
      "en-CA",
      {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
      },
    );
  }

  function formatTime(
    time?: string,
  ) {
    if (!time) {
      return "Not available";
    }

    const [hours, minutes] =
      time.split(":");

    const date = new Date();

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

  function canCancelAppointment(
    appointment: Appointment,
  ) {
    if (
      appointment.status !==
        "scheduled" ||
      !appointment.appointment_date ||
      !appointment.start_time
    ) {
      return false;
    }

    const appointmentDate =
      appointment.appointment_date.slice(
        0,
        10,
      );

    const appointmentTime =
      appointment.start_time.slice(
        0,
        5,
      );

    const appointmentStart =
      new Date(
        `${appointmentDate}T${appointmentTime}:00`,
      );

    return (
      appointmentStart.getTime() >
      Date.now()
    );
  }

  function canRebookAppointment(
    appointment: Appointment,
  ) {
    return (
      (
        appointment.status ===
          "cancelled" ||
        appointment.status ===
          "missed"
      ) &&
      appointment.follow_up_status !==
        "rebooked" &&
      !appointment.rescheduled_to_appointment_id
    );
  }

  /*
   * Booked visits can be moved online until a few hours
   * before (the server enforces the exact cutoff).
   */
  function canRescheduleAppointment(
    appointment: Appointment,
  ) {
    return (
      appointment.visit_type !== "walk_in" &&
      canCancelAppointment(appointment)
    );
  }

  function handleReschedule(
    appointment: Appointment,
  ) {
    navigate("/patient/book", {
      state: {
        reschedule: true,
        rebookedFromAppointment: {
          appointment_id: appointment.appointment_id,
          patient_id: appointment.patient_id,
          doctor_id: appointment.doctor_id,
          appointment_type_id: appointment.appointment_type_id,
          appointment_type:
            appointment.appointment_type_name ?? "Appointment",
          duration_minutes: appointment.duration_minutes ?? 30,
          reason_for_visit: appointment.reason_for_visit ?? null,
          status: "cancelled",
        },
      },
    });
  }

  function handleRebook(
    appointment: Appointment,
  ) {
    if (
      !canRebookAppointment(
        appointment,
      )
    ) {
      return;
    }

   navigate(
    "/patient/book",
    {
      state: {
        rebookedFromAppointment: {
            appointment_id:
              appointment.appointment_id,

            patient_id:
              appointment.patient_id,

            /*
            * Patient rebooking does not
            * need these names.
            *
            * BookAppointmentPage currently
            * requires them in its state type.
            * We will clean that up when
            * we fix the patient success
            * redirect in Step 4.
            */
            

            doctor_id:
              appointment.doctor_id,

            appointment_type_id:
              appointment.appointment_type_id,

            appointment_type:
              appointment.appointment_type_name ??
              "Appointment",

            duration_minutes:
              appointment.duration_minutes ??
              30,

            reason_for_visit:
              appointment.reason_for_visit ??
              null,

            status:
              appointment.status as
                | "cancelled"
                | "missed",
          },
        },
      },
    );
  }

  function getStatusClasses(
    status?: string,
  ) {
    switch (status) {
      case "scheduled":
        return "border-blue-200 bg-blue-50 text-blue-700";

      case "checked_in":
        return "border-violet-200 bg-violet-50 text-violet-700";

      case "roomed":
        return "border-indigo-200 bg-indigo-50 text-indigo-700";

      case "completed":
        return "border-emerald-200 bg-emerald-50 text-emerald-700";

      case "cancelled":
        return "border-rose-200 bg-rose-50 text-rose-700";

      case "missed":
        return "border-amber-200 bg-amber-50 text-amber-700";

      default:
        return "border-slate-200 bg-slate-50 text-slate-700";
    }
  }

  function openCancelModal(
    appointment: Appointment,
  ) {
    setCancellingAppointment(
      appointment,
    );

    setCancellationReason("");
    setActionError("");
  }

  function closeCancelModal() {
    if (isCancelling) {
      return;
    }

    setCancellingAppointment(
      null,
    );

    setCancellationReason("");
    setActionError("");
  }

  async function handleCancelAppointment() {
    if (
      !cancellingAppointment
    ) {
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

    if (!patient) {
      setActionError(
        "Your patient session has expired. Please sign in again.",
      );

      return;
    }

    try {
      setIsCancelling(true);
      setActionError("");

      const response =
        await apiFetch(
          `/api/patient-auth/me/appointments/${cancellingAppointment.appointment_id}/cancel`,
          {
            method: "PATCH",

            headers: {
              "Content-Type":
                "application/json",

            },

            body: JSON.stringify({
              cancellation_reason:
                cancellationReason.trim(),
            }),
          },
        );

      const data =
        await response.json();

      if (
        response.status === 401
      ) {
        logout();

        throw new Error(
          data.message ??
            "Your patient session is invalid or has expired.",
        );
      }

      if (!response.ok) {
        throw new Error(
          data.message ??
            "Unable to cancel appointment.",
        );
      }

      setAppointments(
        (currentAppointments) =>
          currentAppointments.map(
            (appointment) =>
              appointment.appointment_id ===
              cancellingAppointment.appointment_id
                ? {
                    ...appointment,
                    ...data.appointment,
                  }
                : appointment,
          ),
      );

      setCancellingAppointment(
        null,
      );

      setCancellationReason("");

      setSuccessMessage(
        "Your appointment was cancelled successfully.",
      );

      window.setTimeout(
        () => {
          setSuccessMessage("");
        },
        4000,
      );
    } catch (error) {
      console.error(
        "Error cancelling appointment:",
        error,
      );

      setActionError(
        error instanceof Error
          ? error.message
          : "Unable to cancel appointment.",
      );
    } finally {
      setIsCancelling(false);
    }
  }

  return (
    <div>
      <div className="flex items-start justify-between gap-6">
        <div>
          <div className="flex items-center gap-2 text-[#13B2B3]">
            <CalendarDays className="h-5 w-5" />

            <p className="text-sm font-semibold">
              My Schedule
            </p>
          </div>

          <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">
            My Appointments
          </h1>

          <p className="mt-2 text-slate-500">
            View your upcoming clinic appointments.
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white px-6 py-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
            Total Appointments
          </p>

          <p className="mt-2 text-3xl font-bold text-slate-950">
            {appointments.length}
          </p>
        </div>
      </div>

      {loading && (
        <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-8 text-sm text-slate-500 shadow-sm">
          Loading appointments...
        </div>
      )}

      {error && (
        <div className="mt-8 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {successMessage && (
        <div className="mt-8 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
          {successMessage}
        </div>
      )}

      {!loading &&
        !error &&
        appointments.length ===
          0 && (
          <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-10 text-center shadow-sm">
            <CalendarDays className="mx-auto h-9 w-9 text-slate-300" />

            <h2 className="mt-4 font-semibold text-slate-900">
              No appointments yet
            </h2>

            <p className="mt-2 text-sm text-slate-500">
              Your booked appointments will appear here.
            </p>
          </div>
        )}

      {!loading &&
        !error &&
        appointments.length >
          0 && (
          <div className="mt-8 overflow-hidden rounded-[26px] border border-slate-200 bg-white shadow-sm">
            <div className="grid grid-cols-[0.8fr_1.4fr_1.2fr_0.8fr_0.8fr] border-b border-slate-200 bg-slate-50/60 px-8 py-5 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
              <div>
                Time
              </div>

              <div>
                Appointment
              </div>

              <div>
                Doctor
              </div>

              <div>
                Status
              </div>

              <div className="text-right">
                Actions
              </div>
            </div>

            {appointments.map(
              (appointment) => (
                <div
                  key={
                    appointment.appointment_id
                  }
                  className="grid grid-cols-[0.8fr_1.4fr_1.2fr_0.8fr_0.8fr] items-center gap-4 border-b border-slate-100 px-8 py-6 last:border-b-0"
                >
                  <div className="flex items-center gap-4">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#13B2B3]/10 text-[#13B2B3]">
                      <Clock3 className="h-5 w-5" />
                    </div>

                    <div>
                      <p className="font-bold text-slate-950">
                        {formatTime(
                          appointment.start_time,
                        )}
                      </p>

                      {appointment.duration_minutes && (
                        <p className="mt-1 text-xs text-slate-500">
                          {
                            appointment.duration_minutes
                          }{" "}
                          minutes
                        </p>
                      )}
                    </div>
                  </div>

                  <div>
                    <p className="font-semibold text-slate-900">
                      {appointment.appointment_type_name ??
                        `Appointment #${appointment.appointment_id}`}
                    </p>

                    <p className="mt-1 text-sm text-slate-500">
                      {appointment.reason_for_visit ??
                        formatDate(
                          appointment.appointment_date,
                        )}
                    </p>

                    {appointment.reason_for_visit && (
                      <p className="mt-1 text-xs text-slate-400">
                        {formatDate(
                          appointment.appointment_date,
                        )}
                      </p>
                    )}

                    {appointment.status ===
                      "cancelled" &&
                      appointment.cancellation_reason && (
                        <p className="mt-2 text-xs font-medium text-rose-600">
                          Cancelled
                          {appointment.cancelled_by ===
                          "patient"
                            ? " by you"
                            : ""}
                          :{" "}
                          {
                            appointment.cancellation_reason
                          }
                        </p>
                      )}

                    {appointment.status ===
                      "missed" &&
                      appointment.missed_reason && (
                        <p className="mt-2 text-xs font-medium text-amber-700">
                          Missed:{" "}
                          {appointment.missed_reason}
                        </p>
                      )}
                  </div>

                  <div className="flex items-center gap-2 text-slate-700">
                    <Stethoscope className="h-5 w-5 text-[#13B2B3]" />

                    <span className="font-medium">
                      {appointment.doctor_first_name &&
                      appointment.doctor_last_name
                        ? `Dr. ${appointment.doctor_first_name} ${appointment.doctor_last_name}`
                        : "Physician"}
                    </span>
                  </div>

                  <div>
                    <span
                      className={`inline-flex rounded-full border px-4 py-1.5 text-xs font-semibold capitalize ${getStatusClasses(
                        appointment.status ??
                          "scheduled",
                      )}`}
                    >
                      {(
                        appointment.status ??
                        "scheduled"
                      ).replace(
                        "_",
                        " ",
                      )}
                    </span>
                  </div>

                 <div className="text-right">
                  {canCancelAppointment(
                    appointment,
                  ) && canRescheduleAppointment(appointment) ? (
                    <div className="flex flex-wrap justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => handleReschedule(appointment)}
                        className="inline-flex items-center gap-2 rounded-xl border border-[#13B2B3]/25 bg-[#13B2B3]/5 px-3.5 py-2 text-xs font-semibold text-[#0d8587] transition hover:bg-[#13B2B3]/10"
                      >
                        <CalendarClock size={15} />
                        Reschedule
                      </button>
                      <button
                        type="button"
                        onClick={() => openCancelModal(appointment)}
                        className="inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-white px-3.5 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-50"
                      >
                        <XCircle size={15} />
                        Cancel
                      </button>
                    </div>
                  ) : appointment.rescheduled_to_appointment_id ? (
                    <span className="inline-flex rounded-full bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-700">
                      Moved
                    </span>
                  ) : canCancelAppointment(
                    appointment,
                  ) ? (
                    <button
                      type="button"
                      onClick={() =>
                        openCancelModal(
                          appointment,
                        )
                      }
                      className="inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-white px-3.5 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-50"
                    >
                      <XCircle size={15} />

                      Cancel
                    </button>
                  ) : canRebookAppointment(
                      appointment,
                    ) ? (
                    <button
                      type="button"
                      onClick={() =>
                        handleRebook(
                          appointment,
                        )
                      }
                      className="inline-flex items-center gap-2 rounded-xl border border-[#13B2B3]/25 bg-[#13B2B3]/5 px-3.5 py-2 text-xs font-semibold text-[#0d8587] transition hover:bg-[#13B2B3]/10"
                    >
                      <RotateCcw size={15} />

                      Rebook
                    </button>
                  ) : appointment.follow_up_status ===
                      "rebooked" &&
                    (
                      appointment.status ===
                        "cancelled" ||
                      appointment.status ===
                        "missed"
                    ) ? (
                    <span className="inline-flex rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700">
                      Rebooked
                    </span>
                  ) : (
                    <span className="text-xs text-slate-400">
                      —
                    </span>
                  )}
                </div>
                </div>
              ),
            )}
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
                  Cancel this appointment?
                </h2>

                <p className="mt-2 text-sm leading-6 text-slate-500">
                  Your appointment will be cancelled and this time may become available to another patient.
                </p>
              </div>

              <button
                type="button"
                onClick={
                  closeCancelModal
                }
                disabled={
                  isCancelling
                }
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
              >
                <X
                  size={
                    19
                  }
                />
              </button>
            </div>

            <div className="mt-5 rounded-2xl bg-slate-50 p-4">
              <p className="font-semibold text-slate-900">
                {cancellingAppointment.appointment_type_name ??
                  `Appointment #${cancellingAppointment.appointment_id}`}
              </p>

              <p className="mt-1 text-sm text-slate-500">
                {formatDate(
                  cancellingAppointment.appointment_date,
                )}
                {" • "}
                {formatTime(
                  cancellingAppointment.start_time,
                )}
              </p>

              <p className="mt-1 text-sm text-slate-500">
                {cancellingAppointment.doctor_first_name &&
                cancellingAppointment.doctor_last_name
                  ? `Dr. ${cancellingAppointment.doctor_first_name} ${cancellingAppointment.doctor_last_name}`
                  : "Physician"}
              </p>
            </div>

            {actionError && (
              <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {actionError}
              </div>
            )}

            <div className="mt-5">
              <label className="text-sm font-semibold text-slate-700">
                Reason for cancellation

                <span className="ml-1 text-rose-500">
                  *
                </span>
              </label>

              <textarea
                value={
                  cancellationReason
                }
                onChange={(
                  event,
                ) =>
                  setCancellationReason(
                    event.target.value,
                  )
                }
                rows={
                  4
                }
                placeholder="Example: I am unable to attend this appointment."
                className="mt-2 w-full resize-none rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-rose-400 focus:ring-2 focus:ring-rose-100"
              />
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={
                  closeCancelModal
                }
                disabled={
                  isCancelling
                }
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
                    size={
                      16
                    }
                    className="animate-spin"
                  />
                ) : (
                  <XCircle
                    size={
                      16
                    }
                  />
                )}

                {isCancelling
                  ? "Cancelling..."
                  : "Cancel Appointment"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default PatientAppointmentsPage;