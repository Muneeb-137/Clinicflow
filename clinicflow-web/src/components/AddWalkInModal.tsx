import { apiFetch } from "../lib/api";
import {
  CheckCircle2,
  Clock3,
  Info,
  Search,
  TriangleAlert,
  UserPlus,
  UsersRound,
  X,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useState,
} from "react";
import { useNavigate } from "react-router-dom";

import {
  formatClockTime,
  roundMinutes,
} from "./waittime/waitTimeFormat";
import type { WalkInAdmission } from "./waittime/waitTimeTypes";

type Patient = {
  patient_id: number;
  first_name: string;
  last_name: string;
  date_of_birth: string;
  phone: string | null;
  email: string | null;
  status: string;
};
type AppointmentType = {
  appointment_type_id: number;
  name: string;
  default_duration_minutes: number;
};

type WalkInDoctor = {
  doctor_id: number;
  first_name: string;
  last_name: string;
  specialty: string | null;

  current_status:
    | "available"
    | "in_consult"
    | "unavailable";

  status_reason: string | null;

  walk_ins_waiting: number;
  scheduled_waiting: number;

  next_scheduled_time: string | null;
  walk_in_available_until: string | null;
};

type AddWalkInModalProps = {
  open: boolean;
  onClose: () => void;
  // Called after the walk-in is added, with a message to
  // show staff.
  onAdded?: (message: string) => void;
  // Patient chosen from the Live Queue search, if any.
  initialPatientId?: number | null;
};

function AddWalkInModal({
  open,
  onClose,
  onAdded,
  initialPatientId = null,
}: AddWalkInModalProps) {
  const navigate = useNavigate();

  const [patients, setPatients] =
    useState<Patient[]>([]);

  const [selectedPatientId, setSelectedPatientId] =
    useState<number | null>(null);

  const [searchTerm, setSearchTerm] =
    useState("");

  const [loadingPatients, setLoadingPatients] =
    useState(false);

  const [error, setError] =
    useState("");

  const [appointmentTypes, setAppointmentTypes] =
  useState<AppointmentType[]>([]);

  const [walkInDoctors, setWalkInDoctors] =
    useState<WalkInDoctor[]>([]);

  const [
    selectedAppointmentTypeId,
    setSelectedAppointmentTypeId,
    ] = useState("");
  
  const [selectedDoctorId, setSelectedDoctorId] =
    useState("auto");

  const [reasonForVisit, setReasonForVisit] =
    useState("");

  const [loadingOptions, setLoadingOptions] =
    useState(false);

  const [submitting, setSubmitting] =
    useState(false);

  /*
   * Walk-in admission check for the chosen visit type
   * (and doctor, when manual). Never blocks: a failed
   * check falls back to a normal Add.
   */
  const [admission, setAdmission] =
    useState<WalkInAdmission | null>(null);

  const [admissionLoading, setAdmissionLoading] =
    useState(false);

  const [admissionError, setAdmissionError] =
    useState(false);

  useEffect(() => {
    if (open && initialPatientId !== null) {
      setSelectedPatientId(initialPatientId);
    }
  }, [open, initialPatientId]);

  useEffect(() => {
    if (!open) {
      return;
    }

    async function loadPatients() {
      try {
        setLoadingPatients(true);
        setError("");

        const response = await apiFetch(
          "/api/patients",
        );

        const data = await response.json();

        if (!response.ok) {
          throw new Error(
            data.message ??
              "Unable to load patients.",
          );
        }

        setPatients(data);
      } catch (error) {
        setError(
          error instanceof Error
            ? error.message
            : "Unable to load patients.",
        );
      } finally {
        setLoadingPatients(false);
      }
    }

    loadPatients();
  }, [open]);

   useEffect(() => {
    if (!open) {
      return;
    }
   async function loadWalkInOptions() {
    try {
      setLoadingOptions(true);
      setError("");

      const [
        appointmentTypesResponse,
        doctorsResponse,
      ] = await Promise.all([
        apiFetch(
          "/api/appointment-types",
        ),

        apiFetch(
          "/api/doctors/walk-in-available",
        ),
      ]);

      const appointmentTypesData =
        await appointmentTypesResponse.json();

      const doctorsData =
        await doctorsResponse.json();

      if (!appointmentTypesResponse.ok) {
        throw new Error(
          appointmentTypesData.message ??
            "Unable to load appointment types.",
        );
      }

      if (!doctorsResponse.ok) {
        throw new Error(
          doctorsData.message ??
            "Unable to load physicians accepting walk-ins.",
        );
      }

      setAppointmentTypes(
        appointmentTypesData,
      );

      setWalkInDoctors(doctorsData);
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Unable to load walk-in options.",
      );
    } finally {
      setLoadingOptions(false);
    }
  }

  loadWalkInOptions();
}, [open]);

  /*
   * Walk-in admission check: does this visit type
   * (after everyone already waiting) FINISH before
   * walk-in hours end? Re-checked whenever the visit
   * type or doctor changes (debounced; stale requests
   * are cancelled). Never blocks the front desk.
   */
  useEffect(() => {
    setAdmission(null);
    setAdmissionError(false);
    setAdmissionLoading(false);

    if (!open || !selectedAppointmentTypeId) {
      return;
    }

    const controller = new AbortController();
    let cancelled = false;

    const params = new URLSearchParams({
      appointmentTypeId: selectedAppointmentTypeId,
      assignmentMode:
        selectedDoctorId === "auto"
          ? "auto"
          : "manual",
    });

    if (selectedDoctorId !== "auto") {
      params.set("doctorId", selectedDoctorId);
    }

    setAdmissionLoading(true);

    const timer = window.setTimeout(async () => {
      try {
        const response = await apiFetch(
          `/api/wait-time/walk-in-admission?${params.toString()}`,
          { signal: controller.signal },
        );

        const data = await response.json();

        if (!response.ok) {
          throw new Error(
            data.message ??
              "Capacity check unavailable.",
          );
        }

        if (!cancelled) {
          setAdmission(data as WalkInAdmission);
        }
      } catch {
        if (!cancelled) {
          setAdmission(null);
          setAdmissionError(true);
        }
      } finally {
        if (!cancelled) {
          setAdmissionLoading(false);
        }
      }
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [
    open,
    selectedAppointmentTypeId,
    selectedDoctorId,
  ]);

  /*
   * Clinic rules (enforced by the server too):
   * - runs over the end of walk-in hours: needs "Add
   *   anyway" (sent as capacity_override; short visit)
   * - no walk-in time left today: cannot be added
   * - full / not started: added; seen in later walk-in
   *   hours today
   */
  const needsOverride =
    admission?.status === "runs_over";

  const walkInsClosed =
    admission?.status === "closed";

  const admissionPanel = useMemo(() => {
    if (!admission) {
      return null;
    }

    const doctorName = admission.projectedDoctorName
      ? /^dr\.?\s/i.test(admission.projectedDoctorName)
        ? admission.projectedDoctorName
        : `Dr. ${admission.projectedDoctorName}`
      : null;

    const end = formatClockTime(admission.projectedEndAt);
    const blockEnd = formatClockTime(admission.blockEndsAt);
    const nextOpening = formatClockTime(
      admission.nextOpeningAt,
    );

    if (admission.fits) {
      const wait = roundMinutes(
        admission.expectedWaitMinutes,
      );

      const parts = [
        wait !== null ? `est. wait ~${wait} min` : null,
        doctorName ? `with ${doctorName}` : null,
      ].filter(Boolean);

      let text = "Fits";

      if (parts.length > 0) {
        text += ` — ${parts.join(" ")}`;
      }

      if (end) {
        text += `${parts.length > 0 ? "," : " —"} finished by about ${end}`;
      }

      if (blockEnd) {
        text += ` (walk-in hours end ${blockEnd})`;
      }

      return {
        tone: "ok" as const,
        text,
      };
    }

    if (admission.status === "runs_over") {
      const duration = roundMinutes(
        admission.durationMinutes,
      );

      const overrun = roundMinutes(
        admission.overrunMinutes,
      );

      let text = `This ${admission.appointmentTypeName} visit${
        duration !== null ? ` (~${duration} min)` : ""
      } would end${end ? ` around ${end}` : " after walk-in hours end"}`;

      if (end) {
        text += overrun
          ? `, ${overrun} min after walk-in hours end`
          : ", after walk-in hours end";

        text += blockEnd ? ` (${blockEnd}).` : ".";
      } else {
        text += blockEnd ? ` (${blockEnd}).` : ".";
      }

      if (nextOpening) {
        text += ` It would fit fully at ${nextOpening}.`;
      }

      return {
        tone: "warning" as const,
        text,
      };
    }

    if (admission.status === "full") {
      return {
        tone: "info" as const,
        text: nextOpening
          ? `Current walk-in hours are full. This patient will be seen in the next walk-in hours, at about ${nextOpening}${
              doctorName ? ` with ${doctorName}` : ""
            }.`
          : "Current walk-in hours are full. This patient will be seen in the next walk-in hours today.",
      };
    }

    if (admission.status === "not_started") {
      return {
        tone: "info" as const,
        text: nextOpening
          ? `Walk-in hours haven't started yet. This patient will be seen when they start, at about ${nextOpening}${
              doctorName ? ` with ${doctorName}` : ""
            }.`
          : "Walk-in hours haven't started yet. This patient will be seen when they start.",
      };
    }

    if (admission.status === "closed") {
      return {
        tone: "blocked" as const,
        text: "No walk-in time is left today. Offer the patient a booked appointment instead.",
      };
    }

    return {
      tone: "warning" as const,
      text: blockEnd
        ? `This visit may not finish before walk-in hours end (${blockEnd}).`
        : "This visit may not finish before walk-in hours end.",
    };
  }, [admission]);

  const filteredPatients = useMemo(() => {
    const search =
      searchTerm.trim().toLowerCase();

    if (!search) {
      return [];
    }

    return patients
      .filter((patient) => {
        if (patient.status !== "active") {
          return false;
        }

        const name =
          `${patient.first_name} ${patient.last_name}`
            .toLowerCase();

        const phone =
          patient.phone?.toLowerCase() ?? "";

        const email =
          patient.email?.toLowerCase() ?? "";

        return (
          name.includes(search) ||
          phone.includes(search) ||
          email.includes(search)
        );
      })
      .slice(0, 8);
  }, [patients, searchTerm]);

  const selectedPatient =
    patients.find(
      (patient) =>
        patient.patient_id ===
        selectedPatientId,
    ) ?? null;

    const selectedDoctor =
  walkInDoctors.find(
    (doctor) =>
      doctor.doctor_id ===
      Number(selectedDoctorId),
  ) ?? null;

  function formatTime(
  time: string | null,
) {
  if (!time) {
    return null;
  }

  const [hourString, minuteString] =
    time.split(":");

  const hour = Number(hourString);

  if (Number.isNaN(hour)) {
    return time;
  }

  const period =
    hour >= 12 ? "PM" : "AM";

  const displayHour =
    hour % 12 || 12;

  return `${displayHour}:${minuteString} ${period}`;
}

  function handleClose() {
  setSearchTerm("");
  setSelectedPatientId(null);

  setSelectedAppointmentTypeId("");
  setSelectedDoctorId("auto");
  setReasonForVisit("");

  setError("");

  onClose();
}

  function handleAddNewPatient() {
    handleClose();
    navigate("/patients/add");
  }

  async function handleAddToQueue() {
  if (!selectedPatientId) {
    setError("Please select a patient.");
    return;
  }

  if (!selectedAppointmentTypeId) {
    setError(
      "Please select an appointment type.",
    );
    return;
  }

  

  try {
    setSubmitting(true);
    setError("");

    const response = await apiFetch(
      "/api/appointments/walk-in",
      {
        method: "POST",

        headers: {
          "Content-Type":
            "application/json",
        },

        body: JSON.stringify({
          patient_id:
            selectedPatientId,

          doctor_id:
            selectedDoctorId === "auto"
                ? null
                : Number(selectedDoctorId),

            assignment_mode:
            selectedDoctorId === "auto"
                ? "auto"
                : "manual",

            appointment_type_id:
            Number(
                selectedAppointmentTypeId,
            ),

          reason_for_visit:
            reasonForVisit.trim() ||
            null,

          // Staff chose "Add anyway" on an over-capacity check.
          capacity_override: needsOverride,
        }),
      },
    );

    const data =
      await response.json();

    /*
     * Preview was stale (or unavailable): the server says
     * the visit no longer fits. Show its admission and let
     * staff confirm with "Add anyway" (sends the override).
     */
    if (
      response.status === 409 &&
      (data?.code === "WALK_IN_OVER_CAPACITY" ||
        data?.code === "WALK_IN_CLOSED") &&
      data.admission
    ) {
      setAdmissionError(false);
      setAdmissionLoading(false);
      setAdmission({
        ...(data.admission as WalkInAdmission),
        fits: false,
      });
      return;
    }

    if (!response.ok) {
      throw new Error(
        data.message ??
          "Unable to add walk-in.",
      );
    }

    const patientName = selectedPatient
      ? `${selectedPatient.first_name} ${selectedPatient.last_name}`
      : "The patient";

    const addedMessage = needsOverride
      ? `${patientName} was added to the walk-in list as a short visit. Please let them know their visit may be shorter than usual.`
      : `${patientName} was added to the walk-in list. Check them in when they are ready.`;

    handleClose();
    onAdded?.(addedMessage);
  } catch (error) {
    setError(
      error instanceof Error
        ? error.message
        : "Unable to add walk-in.",
    );
  } finally {
    setSubmitting(false);
  }
}

  if (!open) {
    return null;
  }

  return (
    <div data-dialog className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/40 p-4 backdrop-blur-[2px]">
      {/* Fits the window: header fixed, body scrolls, buttons pinned. */}
      <div className="flex w-full max-w-2xl flex-col rounded-2xl border border-slate-200 bg-white shadow-2xl max-h-[calc(100dvh-2rem)] overflow-y-auto">

        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#13B2B3]/10 text-[#13B2B3]">
              <UsersRound size={22} />
            </div>

            <div>
              <h2 className="text-xl font-bold text-slate-950">
                Add Walk-In
              </h2>

              <p className="text-sm text-slate-500">
                Add an arriving patient directly
                to the live queue.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleClose}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
          >
            <X size={20} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-6 pb-0">

          {/* Patient */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="text-sm font-bold text-slate-700">
                Patient
              </label>

              <button
                type="button"
                onClick={handleAddNewPatient}
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#0d8587] hover:text-[#13B2B3]"
              >
                <UserPlus size={16} />
                New Patient
              </button>
            </div>

            {!selectedPatient ? (
              <>
                <div className="flex items-center gap-3 rounded-xl border border-slate-300 px-4 py-3 transition focus-within:border-[#13B2B3] focus-within:ring-2 focus-within:ring-[#13B2B3]/10">
                  <Search
                    size={18}
                    className="shrink-0 text-slate-400"
                  />

                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(event) =>
                      setSearchTerm(
                        event.target.value,
                      )
                    }
                    placeholder="Search by patient name, phone, or email"
                    className="min-w-0 flex-1 bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
                    autoFocus
                  />
                </div>

                {loadingPatients && (
                  <div className="py-8 text-center text-sm text-slate-500">
                    Loading patients...
                  </div>
                )}

                {!loadingPatients &&
                  searchTerm.trim() !== "" && (
                    <div className="mt-2 overflow-hidden rounded-xl border border-slate-200">
                      {filteredPatients.length >
                      0 ? (
                        filteredPatients.map(
                          (patient) => (
                            <button
                              key={
                                patient.patient_id
                              }
                              type="button"
                              onClick={() => {
                                setSelectedPatientId(
                                  patient.patient_id,
                                );

                                setSearchTerm("");
                              }}
                              className="flex w-full items-center justify-between border-b border-slate-100 px-4 py-3 text-left transition last:border-b-0 hover:bg-slate-50"
                            >
                              <div>
                                <p className="font-semibold text-slate-900">
                                  {
                                    patient.first_name
                                  }{" "}
                                  {
                                    patient.last_name
                                  }
                                </p>

                                <p className="mt-0.5 text-xs text-slate-500">
                                  {patient.phone ||
                                    patient.email ||
                                    "No contact information"}
                                </p>
                              </div>

                              <span className="text-xs font-semibold text-[#0d8587]">
                                Select
                              </span>
                            </button>
                          ),
                        )
                      ) : (
                        <div className="px-4 py-6 text-center">
                          <p className="text-sm font-semibold text-slate-700">
                            No patient found
                          </p>

                          <button
                            type="button"
                            onClick={
                              handleAddNewPatient
                            }
                            className="mt-2 text-sm font-semibold text-[#0d8587]"
                          >
                            + Add new patient
                          </button>
                        </div>
                      )}
                    </div>
                  )}
              </>
            ) : (
              <div className="flex items-center justify-between rounded-xl border border-[#13B2B3]/30 bg-[#13B2B3]/5 px-4 py-4">
                <div>
                  <p className="font-bold text-slate-900">
                    {selectedPatient.first_name}{" "}
                    {selectedPatient.last_name}
                  </p>

                  <p className="mt-1 text-sm text-slate-500">
                    {selectedPatient.phone ||
                      selectedPatient.email ||
                      "Patient selected"}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    setSelectedPatientId(null)
                  }
                  className="text-sm font-semibold text-[#0d8587] hover:text-[#13B2B3]"
                >
                  Change
                </button>
              </div>
            )}
          </div>

          {/* Walk-In Details */}
<div className="mt-6 grid gap-5">

  {/* Appointment Type */}
  <div>
    <label className="mb-2 block text-sm font-bold text-slate-700">
      Appointment Type
    </label>

    <select
      value={selectedAppointmentTypeId}
      onChange={(event) =>
        setSelectedAppointmentTypeId(
          event.target.value,
        )
      }
      disabled={loadingOptions}
      className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-[#13B2B3] focus:ring-2 focus:ring-[#13B2B3]/10 disabled:bg-slate-50"
    >
      <option value="">
        Select appointment type
      </option>

      {appointmentTypes.map(
        (appointmentType) => (
          <option
            key={
              appointmentType.appointment_type_id
            }
            value={
              appointmentType.appointment_type_id
            }
          >
            {appointmentType.name} ·{" "}
            {
              appointmentType.default_duration_minutes
            }{" "}
            min
          </option>
        ),
      )}
    </select>
  </div>

  {/* Treating Physician */}
  <div>
    <label className="mb-2 block text-sm font-bold text-slate-700">
      Treating Physician
    </label>

    <select
      value={selectedDoctorId}
      onChange={(event) =>
        setSelectedDoctorId(
          event.target.value,
        )
      }
      disabled={loadingOptions}
      className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-[#13B2B3] focus:ring-2 focus:ring-[#13B2B3]/10 disabled:bg-slate-50"
    >
      <option value="auto">
        Auto-assign — Recommended
        </option>

      {walkInDoctors.map(
        (doctor) => (
          <option
            key={doctor.doctor_id}
            value={doctor.doctor_id}
          >
            Dr. {doctor.first_name}{" "}
            {doctor.last_name}
            {doctor.specialty
              ? ` — ${doctor.specialty}`
              : ""}
          </option>
        ),
      )}
    </select>

    {!loadingOptions &&
      walkInDoctors.length === 0 && (
        <p className="mt-2 text-sm font-medium text-amber-700">
          No physicians are currently
          accepting walk-ins.
        </p>
      )}

    {selectedDoctor && (
      <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`rounded-full border px-2.5 py-1 text-xs font-bold ${
              selectedDoctor.current_status ===
              "available"
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : selectedDoctor.current_status ===
                    "in_consult"
                  ? "border-blue-200 bg-blue-50 text-blue-700"
                  : "border-slate-200 bg-slate-100 text-slate-600"
            }`}
          >
            {selectedDoctor.current_status ===
            "available"
              ? "Available"
              : selectedDoctor.current_status ===
                  "in_consult"
                ? "In Consult"
                : selectedDoctor.status_reason ??
                  "Unavailable"}
          </span>

          <span className="text-xs font-semibold text-slate-500">
            {
              selectedDoctor.walk_ins_waiting
            }{" "}
            walk-in
            {selectedDoctor.walk_ins_waiting ===
            1
              ? ""
              : "s"}{" "}
            waiting
          </span>
        </div>

        <div className="mt-3 grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
          <p>
            Scheduled waiting:{" "}
            <span className="font-semibold text-slate-900">
              {
                selectedDoctor.scheduled_waiting
              }
            </span>
          </p>

          <p>
            Next scheduled:{" "}
            <span className="font-semibold text-slate-900">
              {formatTime(
                selectedDoctor.next_scheduled_time,
              ) ?? "None"}
            </span>
          </p>

          <p className="sm:col-span-2">
            Accepting walk-ins until:{" "}
            <span className="font-semibold text-slate-900">
              {formatTime(
                selectedDoctor.walk_in_available_until,
              ) ?? "Not available"}
            </span>
          </p>
        </div>
      </div>
    )}
  </div>

  {/* Reason */}
  <div>
    <label className="mb-2 block text-sm font-bold text-slate-700">
      Reason for Visit

      <span className="ml-2 text-xs font-normal text-slate-400">
        Optional
      </span>
    </label>

    <textarea
      value={reasonForVisit}
      onChange={(event) =>
        setReasonForVisit(
          event.target.value,
        )
      }
      rows={3}
      placeholder="Brief reason for today's visit"
      className="w-full resize-none rounded-xl border border-slate-300 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-[#13B2B3] focus:ring-2 focus:ring-[#13B2B3]/10"
    />
  </div>
</div>

          {error && (
            <div className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
              {error}
            </div>
          )}

          {/* Walk-in admission check (never blocks) */}
          {selectedAppointmentTypeId &&
            admissionLoading &&
            !admission && (
              <div className="mt-5 flex items-center gap-2 text-xs font-medium text-slate-500">
                <Clock3
                  size={14}
                  className="shrink-0 text-[#13B2B3]"
                />

                <span>Checking walk-in capacity…</span>
              </div>
            )}

          {selectedAppointmentTypeId &&
            !admissionLoading &&
            admissionError &&
            !admission && (
              <div className="mt-5 flex items-center gap-2 text-xs font-medium text-slate-400">
                <Info
                  size={14}
                  className="shrink-0"
                />

                <span>Capacity check unavailable</span>
              </div>
            )}

          {admissionPanel && (
            <div
              role="status"
              className={
                admissionPanel.tone === "ok"
                  ? "mt-5 flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700"
                  : admissionPanel.tone === "info"
                    ? "mt-5 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm font-medium text-sky-800"
                    : admissionPanel.tone === "blocked"
                      ? "mt-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700"
                      : "mt-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-700"
              }
            >
              {admissionPanel.tone === "ok" ? (
                <>
                  <CheckCircle2
                    size={17}
                    className="mt-0.5 shrink-0"
                  />

                  <span>{admissionPanel.text}</span>
                </>
              ) : (
                <>
                  <div className="flex items-start gap-2">
                    <TriangleAlert
                      size={17}
                      className="mt-0.5 shrink-0"
                    />

                    <span>{admissionPanel.text}</span>
                  </div>

                  {needsOverride && (
                    <p className="mt-2 pl-[25px] text-xs font-normal text-amber-700/90">
                      The patient will be told their visit may be shorter than usual.
                    </p>
                  )}
                </>
              )}
            </div>
          )}

          {/* Footer: stays visible at the bottom while the form scrolls. */}
          <div className="sticky bottom-0 -mx-6 mt-7 flex justify-end gap-3 border-t border-slate-200 bg-white px-6 py-5">
            <button
              type="button"
              onClick={handleClose}
              className="rounded-xl border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Cancel
            </button>

           <button
                type="button"
                onClick={handleAddToQueue}
                disabled={
                    submitting ||
                    !selectedPatient ||
                    !selectedAppointmentTypeId ||
                    walkInsClosed
                }
                className={`inline-flex min-w-[135px] items-center justify-center rounded-xl px-5 py-3 text-sm font-bold text-white transition disabled:cursor-not-allowed disabled:opacity-50 ${
                    needsOverride
                      ? "bg-amber-600 hover:bg-amber-700"
                      : "bg-[#13B2B3] hover:bg-[#109a9b]"
                }`}
                >
                {submitting
                    ? "Adding..."
                    : walkInsClosed
                      ? "No walk-in time left"
                      : needsOverride
                        ? "Add anyway (short visit)"
                        : "Add to Queue"}
                </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default AddWalkInModal;