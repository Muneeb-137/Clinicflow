import { CLINIC_TIME_ZONE } from "../utils/clinicTime";
import { formatDoctorName } from "../utils/formatDoctorName";
import { apiFetch } from "../lib/api";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircle2,
  Clock3,
  DoorOpen,
  FileCheck2,
  Search,
  X,
  Stethoscope,
  UsersRound,
  Plus,
} from "lucide-react";
import { socket } from "../socket";

import type { QueueAppointment } from "../types/appointment";
import AddWalkInModal from "../components/AddWalkInModal";
import { WaitSummaryStrip } from "../components/waittime/WaitTimeTiles";
import {
  fetchWaitTimeSummary,
  formatClockTime,
  formatWaitRange,
  getConfidenceLabel,
  roundMinutes,
} from "../components/waittime/waitTimeFormat";
import type {
  WaitPrediction,
  WaitPredictionsResponse,
  WaitTimeSummary,
} from "../components/waittime/waitTimeTypes";
import {
  ShortVisitBadge,
  type CapacityOverrideFlag,
} from "../components/waittime/ShortVisitBadge";
import {
  WalkInNextStepModal,
  type WalkInNextStepPatient,
} from "../components/waittime/WalkInNextStepModal";
import LiveIndicator from "../components/LiveIndicator";

// /api/appointments/flow/today rows.
type FlowAppointment = QueueAppointment &
  CapacityOverrideFlag & {
    assignment_mode?: "auto" | "manual" | null;
  };

/*
 * Walk-ins are only seen during walk-in hours. A waiting
 * (or arrived) walk-in who won't be seen before theirs end
 * — or is already pushed to later hours — chooses: the
 * next available doctor, or a specific doctor's next
 * walk-in hours.
 */
function needsWalkInNextStep(
  appointment: FlowAppointment,
  prediction: WaitPrediction | undefined,
) {
  if (
    !prediction ||
    appointment.visit_type !== "walk_in" ||
    (appointment.status !== "scheduled" &&
      appointment.status !== "checked_in")
  ) {
    return false;
  }

  return (
    prediction.mayMissWalkInHours === true ||
    prediction.walkInBlock?.status === "later" ||
    prediction.expectedWaitMinutes === null
  );
}

/*
 * Compact label for a walk-in waiting for a later walk-in
 * block: who they are waiting for and when. Null unless
 * the prediction is in a later block.
 */
function getLaterWalkInLabel(
  appointment: FlowAppointment,
  prediction: WaitPrediction | undefined,
) {
  if (prediction?.walkInBlock?.status !== "later") {
    return null;
  }

  const time =
    formatClockTime(prediction.walkInBlock.startsAt) ??
    formatClockTime(prediction.projectedStartAt);

  const mode =
    appointment.assignment_mode ??
    prediction.walkInProjection?.assignmentMode ??
    "auto";

  if (mode === "manual") {
    const doctorName = [
      appointment.doctor_first_name,
      appointment.doctor_last_name,
    ]
      .filter(Boolean)
      .join(" ") ||
      prediction.walkInProjection?.projectedDoctorName;

    if (doctorName) {
      return time
        ? `Waiting for Dr. ${doctorName}'s next walk-in hours · ${time}`
        : `Waiting for Dr. ${doctorName}'s next walk-in hours`;
    }
  } else {
    const doctorName =
      prediction.walkInProjection?.projectedDoctorName;

    if (doctorName) {
      return time
        ? `Next available doctor · Dr. ${doctorName} · ${time}`
        : `Next available doctor · Dr. ${doctorName}`;
    }
  }

  return time
    ? `Next walk-in time ${time}`
    : "Later walk-in hours";
}

type PatientSectionMode =
  | "scheduled"
  | "waiting"
  | "roomed";

type WaitPredictionsByAppointment = Record<
  number,
  WaitPrediction
>;

type PatientFlowSectionProps = {
  title: string;
  description: string;
  appointments: FlowAppointment[];
  mode: PatientSectionMode;
  loading: boolean;
  activeAppointmentId: number | null;
  formsUpdatingId: number | null;
  waitPredictions: WaitPredictionsByAppointment;
  onAction: (appointmentId: number) => void;
  onChooseNextStep: (
    appointment: FlowAppointment,
  ) => void;
   onCompleteForms: (
    appointmentId: number,
  ) => void;
  getInitials: (
    firstName: string,
    lastName: string,
  ) => string;
  formatTime: (
    time: string | null | undefined,
  ) => string;
  getWaitingMinutes: (
    waitingMinutes:
      | number
      | string
      | null
      | undefined,
  ) => number;
  getWaitingLabel: (
    waitingMinutes: number,
  ) => string;
  getWaitBadgeClasses: (
    waitingMinutes: number,
  ) => string;
};

function PatientFlowSection({
  title,
  description,
  appointments,
  mode,
  loading,
  activeAppointmentId,
  formsUpdatingId,
  waitPredictions,
  onAction,
  onChooseNextStep,
  onCompleteForms,
  getInitials,
  formatTime,
  getWaitingMinutes,
  getWaitBadgeClasses,
}: PatientFlowSectionProps) {
  function getEmptyTitle() {
    if (mode === "scheduled") {
      return "Everyone has checked in";
    }

    if (mode === "waiting") {
      return "The queue is empty";
    }

    return "No patients are currently roomed";
  }

  function getEmptyDescription() {
    if (mode === "scheduled") {
      return "There are no scheduled patients waiting to check in.";
    }

    if (mode === "waiting") {
      return "Patients will appear here after they are checked in.";
    }

    return "Patients will appear here after they are moved into a room.";
  }

  function getActionLabel() {
    if (mode === "scheduled") {
      return "Check In";
    }

    if (mode === "waiting") {
      return "Move to Room";
    }

    return "Complete Visit";
  }

  function getLoadingLabel() {
    if (mode === "scheduled") {
      return "Checking in...";
    }

    if (mode === "waiting") {
      return "Moving...";
    }

    return "Completing...";
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
        <div>
          <h2 className="font-bold text-slate-900">
            {title}
          </h2>

          <p className="text-sm text-slate-500">
            {description}
          </p>
        </div>

        {!loading && (
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">
            {appointments.length}{" "}
            {appointments.length === 1
              ? "patient"
              : "patients"}
          </span>
        )}
      </div>

      {loading && (
        <div className="flex min-h-[180px] items-center justify-center">
          <div className="flex items-center gap-3 text-sm font-medium text-slate-500">
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-slate-200 border-t-[#13B2B3]" />

            Loading patients...
          </div>
        </div>
      )}

      {!loading && appointments.length === 0 && (
        <div className="flex min-h-[190px] flex-col items-center justify-center px-6 text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#13B2B3]/10 text-[#13B2B3]">
            {mode === "scheduled" ? (
              <CheckCircle2 size={27} />
            ) : mode === "waiting" ? (
              <UsersRound size={27} />
            ) : (
              <DoorOpen size={27} />
            )}
          </div>

          <h3 className="font-bold text-slate-900">
            {getEmptyTitle()}
          </h3>

          <p className="mt-1 max-w-md text-sm text-slate-500">
            {getEmptyDescription()}
          </p>
        </div>
      )}

      {!loading && appointments.length > 0 && (
        <div className="divide-y divide-slate-100">
          {appointments.map((appointment, index) => {
            const waitingMinutes =
              getWaitingMinutes(
                appointment.waiting_minutes,
              );

            const waitPrediction =
              waitPredictions[appointment.appointment_id];

            const walkInProjection =
              waitPrediction?.walkInProjection;

            /*
             * Estimates show for the waiting queue and for
             * arrived walk-ins not yet checked in (the
             * engine projects them too). Booked patients
             * get an estimate once they check in.
             */
            // Full estimate column in the wide waiting queue.
            const showEstimate =
              mode === "waiting";

            /*
             * Awaiting check-in cards sit in narrow side-by-
             * side panels, so walk-ins show the estimate as a
             * badge instead of a column. That keeps them laid
             * out exactly like booked cards.
             */
            const showInlineEstimate =
              mode === "scheduled" &&
              appointment.visit_type === "walk_in" &&
              Boolean(waitPrediction);

            const expectedWaitMinutes = roundMinutes(
              waitPrediction?.expectedWaitMinutes,
            );

            const expectedWaitRange = formatWaitRange(
              waitPrediction?.lowerWaitMinutes,
              waitPrediction?.upperWaitMinutes,
            );

            /*
             * Walk-ins can only start during walk-in hours.
             * When today's current hours are full the engine
             * pushes the patient to a later block — show that
             * clock time instead of a long minute count.
             */
            const nextWalkInTime =
              waitPrediction?.walkInBlock?.status === "later"
                ? formatClockTime(
                    waitPrediction.walkInBlock.startsAt,
                  ) ??
                  formatClockTime(waitPrediction.projectedStartAt)
                : null;

            // "Waiting for Dr. X's next walk-in hours · 5:15 PM"
            // or "Next available doctor · Dr. X · 5:15 PM".
            const laterWalkInLabel = getLaterWalkInLabel(
              appointment,
              waitPrediction,
            );

            const showNextStep = needsWalkInNextStep(
              appointment,
              waitPrediction,
            );

            const mayMissWalkInHours = Boolean(
              waitPrediction?.mayMissWalkInHours,
            );

            const walkInHoursEnd = formatClockTime(
              waitPrediction?.walkInBlock?.endsAt,
            );

            const mayMissNote = mayMissWalkInHours
              ? walkInHoursEnd
                ? `May run past walk-in hours (ends ${walkInHoursEnd})`
                : "May run past walk-in hours"
              : null;

            // Walk-in hours were missed; fitted into a
            // doctor's free time instead.
            const spilloverNote = waitPrediction?.spillover
              ? "Outside walk-in hours · fitted into free time"
              : null;

            const delayReason =
              waitPrediction?.delayStatus ===
                "consult_overrun"
                ? waitPrediction.delayReason
                : walkInProjection?.delayStatus ===
                    "consult_overrun"
                  ? walkInProjection.delayReason
                  : null;

            const isUpdating =
              activeAppointmentId ===
              appointment.appointment_id;

            const isFormsUpdating =
              formsUpdatingId ===
              appointment.appointment_id;


            const isReady =
              appointment.readiness_status ===
              "ready";

            const hasAutoProjection =
                appointment.visit_type === "walk_in" &&
                walkInProjection?.assignmentMode === "auto" &&
                walkInProjection.projectedDoctorId != null;

            /*
             * An auto-assigned walk-in can be moved to the
             * projected room only when that doctor is
             * available with a room and the engine says the
             * patient is next now (the server enforces the
             * same rule).
             */
            const projectedStatus =
              walkInProjection?.projectedProviderStatus ??
              null;

            const projectedRoom =
              walkInProjection?.projectedRoomName ?? null;

            const autoReadyNow =
              hasAutoProjection &&
              projectedStatus === "available" &&
              Boolean(projectedRoom) &&
              expectedWaitMinutes === 0;

            const canPerformAction =
              mode === "scheduled"
                ? isReady
                : mode === "waiting"
                  ? (
                      isReady &&
                      (
                        hasAutoProjection
                          ? autoReadyNow
                          : (
                              appointment.provider_status ===
                                "available" &&
                              Boolean(
                                appointment.room_name,
                              )
                            )
                      )
                    )
                  : true;

            return (
              <article
                key={appointment.appointment_id}
                className="flex flex-col gap-4 px-5 py-5 transition-all duration-300 hover:bg-slate-50/70 lg:flex-row lg:items-center lg:gap-6"
              >
                {/* flex-1: patient details take the free space
                    so they don't squeeze when the Est. Wait
                    column is shown (walk-ins). */}
                <div className="flex min-w-0 flex-1 items-start gap-4">
                  {mode === "waiting" && (
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-950 text-sm font-bold text-white">
                      {index + 1}
                    </div>
                  )}

                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#13B2B3]/10 text-sm font-bold text-[#13B2B3]">
                    {getInitials(
                      appointment.patient_first_name,
                      appointment.patient_last_name,
                    )}
                  </div>

                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-base font-bold text-slate-950">
                        {appointment.patient_first_name}{" "}
                        {appointment.patient_last_name}
                      </h3>

                      <span
                        className={`rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${
                          appointment.visit_type ===
                          "walk_in"
                            ? "border-amber-200 bg-amber-50 text-amber-700"
                            : "border-slate-200 bg-slate-50 text-slate-600"
                        }`}
                      >
                        {appointment.visit_type ===
                        "walk_in"
                          ? "Walk-In"
                          : "Booked Patient"}
                      </span>

                      {appointment.walk_in_capacity_override && (
                        <ShortVisitBadge variant="label" />
                      )}


                      {mode === "waiting" && (
                        <span
                          className={`rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${getWaitBadgeClasses(
                            waitingMinutes,
                          )}`}
                        >
                          {waitingMinutes < 1
                            ? "Just arrived"
                            : `Waited ${waitingMinutes} min`}
                        </span>
                      )}

                      {mode === "roomed" && (
                        <span className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-blue-700">
                          In Visit
                        </span>
                      )}
                    </div>

                    <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-500">
                      <span className="flex items-center gap-1.5 whitespace-nowrap">
                        <Clock3
                          size={15}
                          className="text-[#13B2B3]"
                        />

                        {mode === "scheduled" && (
                          <>
                            {appointment.visit_type === "walk_in"
                              ? (
                                  <>
                                    Arrived{" "}
                                    {formatTime(
                                      appointment.arrived_at,
                                    )}
                                  </>
                                )
                              : (
                                  <>
                                    Appointment{" "}
                                    {formatTime(
                                      appointment.start_time,
                                    )}
                                  </>
                                )}
                          </>
                        )}

                        {mode === "waiting" && (
                          <>
                            Checked in at{" "}
                            {formatTime(
                              appointment.checked_in_at,
                            )}
                          </>
                        )}

                        {mode === "roomed" && (
                          <>
                            Roomed at{" "}
                            {formatTime(
                              appointment.roomed_at,
                            )}
                          </>
                        )}
                      </span>

                      <span className="flex items-center gap-1.5">
                        <Stethoscope
                          size={15}
                          className="text-[#13B2B3]"
                        />

                        {appointment.visit_type === "walk_in" &&
                        !appointment.doctor_first_name ? (
                        <>
                          {walkInProjection?.projectedDoctorName ? (
                            <>
                              <span className="font-medium">
                                Auto-assigned
                              </span>

                              <span>·</span>

                              <span>
                                Projected: Dr.{" "}
                                {walkInProjection.projectedDoctorName}
                              </span>
                            </>
                          ) : (
                            <span className="font-medium">
                              Auto-assign after check-in
                            </span>
                          )}
                        </>
                        ) : (
                          <>
                            {formatDoctorName(appointment.doctor_first_name, appointment.doctor_last_name)}
                          </>
                        )}
                      </span>

                      <span>
                        {appointment.appointment_type}
                      </span>
                    </div>

                  

                 {mode === "waiting" && (
  <div className="mt-3 flex flex-wrap items-center gap-2">
    <span
      className={`rounded-full border px-2.5 py-1 text-xs font-bold ${
        (
          hasAutoProjection
            ? walkInProjection?.projectedProviderStatus
            : appointment.provider_status
        ) === "available"
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : (
                hasAutoProjection
                  ? walkInProjection?.projectedProviderStatus
                  : appointment.provider_status
              ) === "in_consult"
            ? "border-blue-200 bg-blue-50 text-blue-700"
            : "border-slate-200 bg-slate-100 text-slate-600"
      }`}
    >
      {(
        hasAutoProjection
          ? walkInProjection?.projectedProviderStatus
          : appointment.provider_status
      ) === "available"
        ? "Provider Available"
        : (
              hasAutoProjection
                ? walkInProjection?.projectedProviderStatus
                : appointment.provider_status
            ) === "in_consult"
          ? "Provider In Consult"
          : "Provider Unavailable"}
    </span>

    {(hasAutoProjection
      ? walkInProjection?.projectedRoomName
      : appointment.room_name) && (
      <span className="rounded-full border border-[#13B2B3]/20 bg-[#13B2B3]/5 px-2.5 py-1 text-xs font-bold text-[#0d8587]">
        {hasAutoProjection
          ? walkInProjection?.projectedRoomName
          : appointment.room_name}
      </span>
    )}
  </div>
)}

 {(mode === "scheduled" || mode === "waiting") && (
  <div className="mt-3 flex flex-wrap items-center gap-2">

    {showInlineEstimate && (
      <span
        className="inline-flex items-center gap-1.5 rounded-full border border-[#13B2B3]/25 bg-[#13B2B3]/10 px-2.5 py-1 text-xs font-bold text-[#0d8587]"
        title={
          waitPrediction?.explanation?.length
            ? waitPrediction.explanation.join(" ")
            : undefined
        }
      >
        <Clock3 size={14} />

        {nextWalkInTime ? (
          <>{laterWalkInLabel ?? `Next walk-in time ${nextWalkInTime}`}</>
        ) : (
          <>
            Est. wait:{" "}
            {expectedWaitMinutes === null
              ? "Can't estimate"
              : expectedWaitMinutes === 0
                ? "Ready now"
                : expectedWaitRange
                  ? `~${expectedWaitMinutes} min (${expectedWaitRange})`
                  : `~${expectedWaitMinutes} min`}
          </>
        )}
      </span>
    )}

    {showInlineEstimate && mayMissNote && (
      <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">
        {mayMissNote}
      </span>
    )}

    {showInlineEstimate && spilloverNote && (
      <span className="rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-700">
        {spilloverNote}
      </span>
    )}

    {mode === "scheduled" && showNextStep && (
      <button
        type="button"
        onClick={() => onChooseNextStep(appointment)}
        className="rounded-lg border border-amber-200 bg-white px-2.5 py-1 text-xs font-semibold text-amber-700 transition hover:border-amber-300 hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        Choose next step
      </button>
    )}

    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold ${
        appointment.forms_status ===
        "completed"
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : "border-amber-200 bg-amber-50 text-amber-700"
      }`}
    >
      <FileCheck2 size={14} />

      Forms:{" "}
      {appointment.forms_status ===
      "completed"
        ? "Completed"
        : "Pending"}
    </span>


    <span
      className={`rounded-full border px-2.5 py-1 text-xs font-bold ${
        isReady
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : "border-amber-200 bg-amber-50 text-amber-700"
      }`}
    >
      {isReady
        ? "Ready"
        : "Pending"}
    </span>


    {appointment.forms_status ===
      "pending" && (
      <button
        type="button"

        disabled={
          isFormsUpdating
        }

        onClick={() =>
          onCompleteForms(
            appointment
              .appointment_id,
          )
        }

        className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-600 transition hover:border-[#13B2B3]/40 hover:bg-[#13B2B3]/5 hover:text-[#0d8587] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isFormsUpdating
          ? "Updating..."
          : "Mark Forms Completed"}
      </button>
    )}


    {appointment.forms_status ===
      "completed" && (
      <span className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
        Forms on File
      </span>
    )}
  </div>
)}
</div>
</div>
{showEstimate && (
  <div
    className="ml-auto flex min-w-[130px] max-w-[200px] shrink-0 flex-col justify-center"
    title={
      waitPrediction?.explanation?.length
        ? waitPrediction.explanation.join(" ")
        : undefined
    }
  >
    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
      Est. Wait
    </span>

    <div className="mt-1 flex items-center gap-2">
      <Clock3
        size={17}
        className="text-[#13B2B3]"
      />

      <span
        className={
          nextWalkInTime
            ? "text-sm font-semibold leading-5 text-amber-700"
            : expectedWaitMinutes !== null
              ? "text-2xl font-bold tracking-tight text-slate-950"
              : "text-sm font-semibold text-slate-500"
        }
      >
        {!waitPrediction
          ? "—"
          : nextWalkInTime
            ? laterWalkInLabel ?? `Next walk-in time ${nextWalkInTime}`
            : expectedWaitMinutes === null
              ? "Can't estimate"
              : expectedWaitMinutes === 0
                ? "Ready now"
                : `~${expectedWaitMinutes} min`}
      </span>
    </div>

    {!nextWalkInTime && expectedWaitMinutes !== null && expectedWaitMinutes > 0 && expectedWaitRange && (
      <span className="mt-0.5 text-xs font-medium text-slate-500">
        Likely {expectedWaitRange} min
      </span>
    )}

    {mayMissNote && (
      <span className="mt-0.5 text-xs font-medium leading-4 text-amber-600">
        {mayMissNote}
      </span>
    )}

    {spilloverNote && (
      <span className="mt-0.5 text-xs font-medium leading-4 text-sky-700">
        {spilloverNote}
      </span>
    )}

    {waitPrediction && expectedWaitMinutes === null && waitPrediction.explanation?.[0] && (
      <span className="mt-0.5 text-xs leading-4 text-slate-400">
        {waitPrediction.explanation[0]}
      </span>
    )}

    {waitPrediction && (
      <div className="mt-1 flex items-center gap-1.5">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />

        <span className="text-xs font-semibold text-slate-500">
          Live
        </span>

        {expectedWaitMinutes !== null && !nextWalkInTime && (
          <span className="text-xs text-slate-400">
            · {getConfidenceLabel(waitPrediction.confidence).toLowerCase()}
          </span>
        )}
      </div>
    )}

    {waitPrediction?.patientsAhead != null && waitPrediction.patientsAhead > 0 && (
      <span className="mt-0.5 text-xs text-slate-400">
        {waitPrediction.patientsAhead} ahead
      </span>
    )}

    {delayReason && (
      <div className="mt-2 text-xs font-medium leading-4 text-amber-600">
        {delayReason}
        {" · "}
        Estimate adjusted
      </div>
    )}

    {showNextStep && (
      <button
        type="button"
        onClick={() => onChooseNextStep(appointment)}
        className="mt-2 self-start rounded-lg border border-amber-200 bg-white px-2.5 py-1 text-xs font-semibold text-amber-700 transition hover:border-amber-300 hover:bg-amber-50"
      >
        Choose next step
      </button>
    )}
  </div>
)}
                    
                

                <button
                  type="button"
                  onClick={() =>
                    onAction(
                      appointment.appointment_id,
                    )
                  }
                  disabled={
                    isUpdating ||
                    !canPerformAction
                  }
                  className={`inline-flex min-w-[155px] items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-bold text-white shadow-sm transition-all duration-300 disabled:cursor-not-allowed disabled:opacity-60 ${
                    mode === "scheduled"
                      ? "bg-[#13B2B3] hover:-translate-y-0.5 hover:bg-[#109a9b]"
                      : mode === "waiting"
                        ? "bg-slate-950 hover:-translate-y-0.5 hover:bg-slate-800"
                        : "bg-emerald-600 hover:-translate-y-0.5 hover:bg-emerald-700"
                  }`}
                >
                  {isUpdating ? (
                    <>
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                      {getLoadingLabel()}
                    </>
                  ) : (
                    <>
                      {mode === "scheduled" && (
                        <CheckCircle2 size={17} />
                      )}

                      {mode === "waiting" && (
                        <DoorOpen size={17} />
                      )}

                      {mode === "roomed" && (
                        <CheckCircle2 size={17} />
                      )}

  {mode === "scheduled"
  ? !isReady
    ? "Forms Pending"
    : "Check In"

  : mode === "waiting"
    ? !isReady
      ? "Forms Pending"
      : hasAutoProjection
        ? autoReadyNow
          ? "Move to Projected Room"
          : !projectedRoom
            ? "No Room Assigned"
            : projectedStatus === "in_consult"
              ? `${projectedRoom} · Provider In Consult`
              : projectedStatus === "unavailable"
                ? `${projectedRoom} · Provider Unavailable`
                : expectedWaitMinutes !== null
                  ? `${projectedRoom} · Next in ~${expectedWaitMinutes} min`
                  : `${projectedRoom} · Not ready yet`
        : !appointment.room_name
          ? "No Room Assigned"
          : appointment.provider_status !==
              "available"
            ? appointment.provider_status ===
                "in_consult"
              ? `${appointment.room_name} · Provider In Consult`
              : `${appointment.room_name} · Provider Unavailable`
            : `Room in ${appointment.room_name}`

    : getActionLabel()}
                    </>
                  )}
                </button>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

/*
 * Staff alert: waiting walk-ins who will miss their
 * walk-in hours (they choose the next available doctor or
 * a specific doctor) or are already waiting for later
 * walk-in hours. Click a patient to choose their next
 * step.
 */
function WalkInHoursAlert({
  appointments,
  waitPredictions,
  onChooseNextStep,
}: {
  appointments: FlowAppointment[];
  waitPredictions: WaitPredictionsByAppointment;
  onChooseNextStep: (
    appointment: FlowAppointment,
  ) => void;
}) {
  type AlertItem = {
    id: number;
    name: string;
    detail: string;
    appointment: FlowAppointment;
    canChoose: boolean;
  };

  const groups: {
    key: string;
    title: string;
    hint: string;
    tone: string;
    items: AlertItem[];
  }[] = [
    {
      key: "will-miss",
      title: "Will miss walk-in hours — choose next step",
      hint: "Ask the patient: next available doctor, or wait for a specific doctor. They keep their place in line.",
      tone: "border-amber-200 bg-amber-50 text-amber-800",
      items: [],
    },
    {
      key: "later",
      title: "Waiting for later walk-in hours",
      hint: "Tell the patient their time; they may leave and come back.",
      tone: "border-amber-200 bg-amber-50 text-amber-800",
      items: [],
    },
    // Only shown when the engine fits a walk-in into free
    // time (off by default).
    {
      key: "spillover",
      title: "Walk-in hours missed: fitted into free time",
      hint: "Room them with the projected doctor when ready; no booked patient is moved.",
      tone: "border-sky-200 bg-sky-50 text-sky-800",
      items: [],
    },
  ];

  for (const appointment of appointments) {
    const prediction =
      waitPredictions[appointment.appointment_id];

    if (
      !prediction ||
      appointment.visit_type !== "walk_in"
    ) {
      continue;
    }

    const name = `${appointment.patient_first_name} ${appointment.patient_last_name}`;

    const canChoose = needsWalkInNextStep(
      appointment,
      prediction,
    );

    if (prediction.spillover) {
      const doctor =
        prediction.walkInProjection?.projectedDoctorName;

      const startTime = formatClockTime(
        prediction.projectedStartAt,
      );

      groups[2].items.push({
        id: appointment.appointment_id,
        name,
        detail: [
          doctor ? `Dr. ${doctor}` : null,
          startTime,
        ]
          .filter(Boolean)
          .join(" · "),
        appointment,
        canChoose,
      });
    } else if (
      prediction.mayMissWalkInHours ||
      prediction.expectedWaitMinutes === null
    ) {
      const ends = formatClockTime(
        prediction.walkInBlock?.endsAt,
      );

      groups[0].items.push({
        id: appointment.appointment_id,
        name,
        detail:
          prediction.expectedWaitMinutes === null
            ? "Can't be seen in current walk-in hours"
            : ends
              ? `Walk-in hours end ${ends}`
              : "Near the end of walk-in hours",
        appointment,
        canChoose,
      });
    } else if (prediction.walkInBlock?.status === "later") {
      groups[1].items.push({
        id: appointment.appointment_id,
        name,
        detail:
          getLaterWalkInLabel(appointment, prediction) ??
          "Later walk-in hours",
        appointment,
        canChoose,
      });
    }
  }

  const visibleGroups = groups.filter(
    (group) => group.items.length > 0,
  );

  if (visibleGroups.length === 0) {
    return null;
  }

  return (
    <div
      role="status"
      className="space-y-3"
    >
      {visibleGroups.map((group) => (
        <div
          key={group.key}
          className={`rounded-2xl border px-4 py-3 ${group.tone}`}
        >
          <p className="text-sm font-bold">
            {group.title} ({group.items.length})
          </p>

          <p className="mt-0.5 text-xs opacity-80">
            {group.hint}
          </p>

          <ul className="mt-2 flex flex-wrap gap-2">
            {group.items.map((item) => (
              <li key={item.id}>
                {item.canChoose ? (
                  <button
                    type="button"
                    onClick={() =>
                      onChooseNextStep(item.appointment)
                    }
                    title="Choose next step"
                    className="rounded-full border border-black/5 bg-white/70 px-2.5 py-1 text-left text-xs font-semibold transition hover:border-black/15 hover:bg-white"
                  >
                    {item.name}
                    {item.detail && (
                      <span className="font-medium opacity-75">
                        {" · "}
                        {item.detail}
                      </span>
                    )}
                  </button>
                ) : (
                  <span className="inline-block rounded-full border border-black/5 bg-white/70 px-2.5 py-1 text-xs font-semibold">
                    {item.name}
                    {item.detail && (
                      <span className="font-medium opacity-75">
                        {" · "}
                        {item.detail}
                      </span>
                    )}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function LiveQueuePage() {

  const [waitPredictions, setWaitPredictions] =
  useState<WaitPredictionsByAppointment>({});
  
  const [scheduledAppointments, setScheduledAppointments] =
  useState<FlowAppointment[]>([]);

  const [walkInAppointments, setWalkInAppointments] =
  useState<FlowAppointment[]>([]);

  const [waitingAppointments, setWaitingAppointments] =
    useState<FlowAppointment[]>([]);

  const [roomedAppointments, setRoomedAppointments] =
    useState<FlowAppointment[]>([]);

  const [waitSummary, setWaitSummary] =
  useState<WaitTimeSummary | null>(null);

  const [waitSummaryError, setWaitSummaryError] =
  useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [roomingId, setRoomingId] = useState<number | null>(null);
  const [showWalkInModal, setShowWalkInModal] =
  useState(false);
  const [checkingInId, setCheckingInId] = useState<number | null>(null);
  const [completingId, setCompletingId] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  // Errors from staff actions (check in, room...). Kept
  // until the next action or dismissed, so background
  // refreshes cannot wipe them before they are read.
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  // Loading the queue itself.
  const [loadError, setLoadError] = useState("");
  const [lastLoadedAt, setLastLoadedAt] =
    useState<Date | null>(null);

  // Only the newest load may update the screen: an older,
  // slower response must not overwrite a newer one.
  const loadSequence = useRef(0);
  const [formsUpdatingId, setFormsUpdatingId] =
    useState<number | null>(null);
  const [nextStepPatient, setNextStepPatient] =
    useState<WalkInNextStepPatient | null>(null);
  useEffect(() => {
  loadQueue();

  function handleClinicFlowUpdate() {
    loadQueue(true);
  }

  socket.on(
    "clinicflow:updated",
    handleClinicFlowUpdate,
  );

  // Wait estimates change with the clock alone (e.g. a
  // doctor running over), so refresh every minute too.
  const refreshInterval = window.setInterval(() => {
    if (!document.hidden) {
      loadQueue(true);
    }
  }, 60_000);

  return () => {
    window.clearInterval(refreshInterval);

    socket.off(
      "clinicflow:updated",
      handleClinicFlowUpdate,
    );
  };
}, []);

  /*
   * One request for every prediction in the clinic
   * (checked-in patients and arrived walk-ins), keyed by
   * appointment. Returns an empty map on failure.
   */
  async function loadWaitPredictions(): Promise<WaitPredictionsByAppointment> {
    try {
      const response = await apiFetch(
        "/api/wait-time/predictions",
      );

      if (!response.ok) {
        return {};
      }

      const data =
        (await response.json()) as WaitPredictionsResponse;

      const nextWaitPredictions: WaitPredictionsByAppointment = {};

      for (const prediction of data.predictions ?? []) {
        nextWaitPredictions[prediction.appointmentId] =
          prediction;
      }

      return nextWaitPredictions;
    } catch {
      return {};
    }
  }

  async function loadQueue(backgroundRefresh = false) {
    const requestId = ++loadSequence.current;
    const isLatest = () =>
      requestId === loadSequence.current;

    try {
      if (backgroundRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      /*
       * Wait-time data is loaded alongside the flow but
       * must never block the queue itself: if it fails,
       * the queue still renders and the wait-time UI
       * shows its own unavailable state.
       */
     const [flowResponse, predictionsResult, summaryResult] =
  await Promise.all([
    apiFetch(
      "/api/appointments/flow/today",
    ),
    loadWaitPredictions(),
    fetchWaitTimeSummary()
      .then((data) => ({ data, error: "" }))
      .catch((summaryError: unknown) => ({
        data: null,
        error:
          summaryError instanceof Error
            ? summaryError.message
            : "Unable to load wait times.",
      })),
  ]);

const flowData = await flowResponse.json();

if (!flowResponse.ok) {
  throw new Error(
    flowData.message ??
      "Unable to load today's patient flow.",
  );
}

if (!isLatest()) {
  return;
}

const patientFlow = flowData as FlowAppointment[];

setScheduledAppointments(
  patientFlow.filter(
    (appointment) =>
      appointment.status === "scheduled" &&
      appointment.visit_type !== "walk_in",
  ),
);

setWalkInAppointments(
  patientFlow.filter(
    (appointment) =>
      appointment.status === "scheduled" &&
      appointment.visit_type === "walk_in",
  ),
);

const waitingPatients = patientFlow.filter(
  (appointment) =>
    appointment.status === "checked_in",
);

setWaitingAppointments(waitingPatients);

setWaitPredictions(predictionsResult);

setRoomedAppointments(
  patientFlow.filter(
    (appointment) =>
      appointment.status === "roomed",
  ),
);

setWaitSummary(summaryResult.data);
setWaitSummaryError(summaryResult.error);
setLoadError("");
setLastLoadedAt(new Date());
    } catch (error) {
      if (!isLatest()) {
        return;
      }

      setLoadError(
        error instanceof Error &&
          error.message !== "Failed to fetch"
          ? error.message
          : "Unable to reach the server.",
      );
    } finally {
      if (isLatest()) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }

  async function handleCheckInPatient(
  appointmentId: number,
) {
  try {
    setCheckingInId(appointmentId);
    setError("");
    setSuccessMessage("");

    // Booked patients and walk-ins are both checked in here.
    const selectedAppointment = [
      ...scheduledAppointments,
      ...walkInAppointments,
    ].find(
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

    const contentType =
      response.headers.get("content-type");

    if (!contentType?.includes("application/json")) {
      throw new Error(
        "The server returned an invalid response.",
      );
    }

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        data.message ?? "Unable to check in the patient.",
      );
    }

    await loadQueue(true);

    if (selectedAppointment) {
      setSuccessMessage(
        `${selectedAppointment.patient_first_name} ${selectedAppointment.patient_last_name} has been checked in.`,
      );
    }
  } catch (error) {
    if (error instanceof Error) {
      setError(error.message);
    } else {
      setError("Unable to check in the patient.");
    }
  } finally {
    setCheckingInId(null);
  }
}

async function handleCompleteForms(
  appointmentId: number,
) {
  try {
    setFormsUpdatingId(appointmentId);
    setError("");
    setSuccessMessage("");

    const selectedAppointment =
      [
        ...scheduledAppointments,
        ...walkInAppointments,
        ...waitingAppointments,
      ].find(
        (appointment) =>
          appointment.appointment_id ===
          appointmentId,
      );

    const response = await apiFetch(
      `/api/appointments/${appointmentId}/forms`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
      },
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        data.message ??
          "Unable to complete patient forms.",
      );
    }

    await loadQueue(true);

    if (selectedAppointment) {
      setSuccessMessage(
        `${selectedAppointment.patient_first_name} ${selectedAppointment.patient_last_name}'s forms are complete.`,
      );
    }
  } catch (error) {
    setError(
      error instanceof Error
        ? error.message
        : "Unable to complete patient forms.",
    );
  } finally {
    setFormsUpdatingId(null);
  }
}

  async function handleRoomPatient(appointmentId: number) {
    try {
      setRoomingId(appointmentId);
      setError("");
      setSuccessMessage("");

      const selectedAppointment =
        waitingAppointments.find(
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
            status: "roomed",
          }),
        },
      );

      const contentType = response.headers.get("content-type");

      if (!contentType?.includes("application/json")) {
        throw new Error("The server returned an invalid response.");
      }

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message ?? "Unable to room the patient.");
      }

      await loadQueue(true);

      if (selectedAppointment) {
        setSuccessMessage(
          `${selectedAppointment.patient_first_name} ${selectedAppointment.patient_last_name} has been moved to a room.`,
        );
      }
    } catch (error) {
      if (error instanceof Error) {
        setError(error.message);
      } else {
        setError("Unable to room the patient.");
      }
    } finally {
      setRoomingId(null);
    }
  }

  async function handleCompleteVisit(
  appointmentId: number,
) {
  try {
    setCompletingId(appointmentId);
    setError("");
    setSuccessMessage("");

    const selectedAppointment =
      roomedAppointments.find(
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
          status: "completed",
        }),
      },
    );

    const contentType =
      response.headers.get("content-type");

    if (!contentType?.includes("application/json")) {
      throw new Error(
        "The server returned an invalid response.",
      );
    }

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        data.message ?? "Unable to complete the visit.",
      );
    }

    await loadQueue(true);

    if (selectedAppointment) {
      setSuccessMessage(
        `${selectedAppointment.patient_first_name} ${selectedAppointment.patient_last_name}'s visit has been completed.`,
      );
    }
  } catch (error) {
    if (error instanceof Error) {
      setError(error.message);
    } else {
      setError("Unable to complete the visit.");
    }
  } finally {
    setCompletingId(null);
  }
}

  function handleChooseNextStep(
    appointment: FlowAppointment,
  ) {
    setNextStepPatient({
      appointmentId: appointment.appointment_id,
      patientName: `${appointment.patient_first_name} ${appointment.patient_last_name}`,
    });
  }

  const handleCloseNextStep = useCallback(() => {
    setNextStepPatient(null);
  }, []);

  async function handleNextStepSaved(message: string) {
    setNextStepPatient(null);
    setError("");
    setSuccessMessage(message);

    await loadQueue(true);
  }

  function getInitials(firstName: string, lastName: string) {
    return `${firstName?.charAt(0) ?? ""}${
      lastName?.charAt(0) ?? ""
    }`.toUpperCase();
  }

  function formatTime(dateTime: string | null | undefined) {
    if (!dateTime) {
      return "Not available";
    }

    /*
      Time-of-day values such as start_time
      ("09:00" / "09:00:00") are not valid
      Date strings, so format them directly.
    */
    const timeOfDayMatch = /^(\d{1,2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/.exec(
      dateTime.trim(),
    );

    if (timeOfDayMatch) {
      const hours = Number(timeOfDayMatch[1]);
      const minutes = timeOfDayMatch[2];
      const suffix = hours >= 12 ? "PM" : "AM";

      return `${hours % 12 || 12}:${minutes} ${suffix}`;
    }

    const date = new Date(dateTime);

    if (Number.isNaN(date.getTime())) {
      return dateTime;
    }

    // Same "1:45 PM" style as appointment times,
    // regardless of the browser's locale.
    return date.toLocaleTimeString("en-US", {
      timeZone: CLINIC_TIME_ZONE,
      hour: "numeric",
      minute: "2-digit",
    });
  }

  function getWaitingMinutes(
    waitingMinutes: number | string | null | undefined,
  ) {
    const parsedWaitingMinutes = Number(waitingMinutes);

    if (Number.isNaN(parsedWaitingMinutes)) {
      return 0;
    }

    return Math.max(0, Math.floor(parsedWaitingMinutes));
  }

  function getWaitingLabel(waitingMinutes: number) {
    if (waitingMinutes < 1) {
      return "Just arrived";
    }

    if (waitingMinutes === 1) {
      return "1 minute";
    }

    return `${waitingMinutes} minutes`;
  }

  function getWaitBadgeClasses(waitingMinutes: number) {
    if (waitingMinutes >= 30) {
      return "border-red-200 bg-red-50 text-red-700";
    }

    if (waitingMinutes >= 15) {
      return "border-amber-200 bg-amber-50 text-amber-700";
    }

    return "border-teal-200 bg-teal-50 text-teal-700";
  }

  function filterAppointments(
  appointmentList: FlowAppointment[],
) {
  const normalizedSearch = searchTerm.trim().toLowerCase();

  if (!normalizedSearch) {
    return appointmentList;
  }

  return appointmentList.filter((appointment) => {
    const patientName =
      `${appointment.patient_first_name} ${appointment.patient_last_name}`.toLowerCase();

    const doctorName =
      `${appointment.doctor_first_name ?? ""} ${appointment.doctor_last_name ?? ""}`.toLowerCase();

    const appointmentType =
      appointment.appointment_type?.toLowerCase() ?? "";

    return (
      patientName.includes(normalizedSearch) ||
      doctorName.includes(normalizedSearch) ||
      appointmentType.includes(normalizedSearch)
    );
  });
}

const filteredScheduledAppointments = useMemo(
  () => filterAppointments(scheduledAppointments),
  [scheduledAppointments, searchTerm],
);

const filteredWalkInAppointments = useMemo(
  () => filterAppointments(walkInAppointments),
  [walkInAppointments, searchTerm],
);

const filteredWaitingAppointments = useMemo(
  () => filterAppointments(waitingAppointments),
  [waitingAppointments, searchTerm],
);

const filteredRoomedAppointments = useMemo(
  () => filterAppointments(roomedAppointments),
  [roomedAppointments, searchTerm],
);

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-[#13B2B3]">
            <UsersRound size={18} />
            Live patient flow
          </div>

          <h1 className="text-3xl font-bold text-slate-950">
            Live Queue
            </h1>

            <p className="mt-1 text-slate-500">
            Manage patient check-in, waiting, rooming, and visit completion.
            </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="flex min-w-0 items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm sm:w-[340px]">
            <Search
              size={19}
              className="shrink-0 text-slate-400"
            />

            <input
              type="text"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search patient or doctor"
              className="min-w-0 flex-1 bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
            />
          </div>

          <button
            type="button"
            onClick={() => setShowWalkInModal(true)}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#13B2B3] px-4 py-3 text-sm font-bold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-[#109a9b]"
          >
            <Plus size={17} />
            Add Walk-In
          </button>

          <LiveIndicator />
        </div>
      </div>

      <WaitSummaryStrip
        summary={waitSummary}
        loading={loading && !waitSummary}
        error={waitSummaryError}
      />

      <WalkInHoursAlert
        appointments={[
          ...waitingAppointments,
          ...walkInAppointments,
        ]}
        waitPredictions={waitPredictions}
        onChooseNextStep={handleChooseNextStep}
      />

      {successMessage && (
        <div className="flex items-center gap-3 rounded-xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm font-medium text-teal-800">
          <CheckCircle2 size={19} />
          <span className="flex-1">{successMessage}</span>
          <button
            type="button"
            onClick={() => setSuccessMessage("")}
            aria-label="Dismiss"
            className="rounded-md p-1 text-teal-700 transition hover:bg-teal-100"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {error && (
        <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          <span className="flex-1">{error}</span>
          <button
            type="button"
            onClick={() => setError("")}
            aria-label="Dismiss"
            className="rounded-md p-1 text-red-600 transition hover:bg-red-100"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/*
        Queue failed to load. Before any successful load
        there is nothing to show, so the sections are
        hidden rather than shown empty (an empty queue
        would look like "no patients"). After that, the
        last good queue stays on screen, marked as not
        up to date, and refreshes keep retrying.
      */}
      {loadError && lastLoadedAt && (
        <div className="flex flex-col gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800 sm:flex-row sm:items-center sm:justify-between">
          <span>
            Couldn't refresh the queue ({loadError}). Showing
            the queue as of{" "}
            {lastLoadedAt.toLocaleTimeString("en-US", {
      timeZone: CLINIC_TIME_ZONE,
              hour: "numeric",
              minute: "2-digit",
            })}
            ; it may be out of date.
          </span>
          <button
            type="button"
            onClick={() => loadQueue(true)}
            disabled={refreshing}
            className="shrink-0 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-bold text-amber-800 transition hover:bg-amber-100 disabled:opacity-60"
          >
            Try again
          </button>
        </div>
      )}

      {loadError && !lastLoadedAt && !loading ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-6 py-10 text-center">
          <p className="font-bold text-red-800">
            The queue could not be loaded.
          </p>
          <p className="mt-1 text-sm text-red-700">
            {loadError}
          </p>
          <button
            type="button"
            onClick={() => loadQueue()}
            className="mt-4 rounded-xl bg-red-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-red-700"
          >
            Try again
          </button>
        </div>
      ) : (
      <div className = "space-y-6">

    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
  <div className="border-b border-slate-200 px-5 py-4">
    <h2 className="font-bold text-slate-900">
      Awaiting Check-In
    </h2>

    <p className="text-sm text-slate-500">
      Patients who have arrived or are scheduled today
      and have not yet checked in.
    </p>
  </div>

  <div className="grid gap-6 p-4 xl:grid-cols-2">
    <PatientFlowSection
      title="Scheduled"
      description="Booked patients awaiting check-in."
      appointments={filteredScheduledAppointments}
      mode="scheduled"
      loading={loading}
      activeAppointmentId={checkingInId}
      formsUpdatingId={formsUpdatingId}
       waitPredictions={waitPredictions}
      onAction={handleCheckInPatient}
      onChooseNextStep={handleChooseNextStep}
      onCompleteForms={handleCompleteForms}
      getInitials={getInitials}
      formatTime={formatTime}
      getWaitingMinutes={getWaitingMinutes}
      getWaitingLabel={getWaitingLabel}
      getWaitBadgeClasses={getWaitBadgeClasses}
    />

    <PatientFlowSection
      title="Walk-Ins"
      description="Arrived walk-in patients awaiting check-in."
      appointments={filteredWalkInAppointments}
      mode="scheduled"
      loading={loading}
      activeAppointmentId={checkingInId}
      formsUpdatingId={formsUpdatingId}
       waitPredictions={waitPredictions}
      onAction={handleCheckInPatient}
      onChooseNextStep={handleChooseNextStep}
      onCompleteForms={handleCompleteForms}
      getInitials={getInitials}
      formatTime={formatTime}
      getWaitingMinutes={getWaitingMinutes}
      getWaitingLabel={getWaitingLabel}
      getWaitBadgeClasses={getWaitBadgeClasses}
    />
  </div>
</div>

    <PatientFlowSection
  title="Waiting Queue"
  description="Checked-in patients waiting to be moved into a room."
  appointments={filteredWaitingAppointments}
  mode="waiting"
  loading={loading}
  activeAppointmentId={roomingId}
  formsUpdatingId={formsUpdatingId}
   waitPredictions={waitPredictions}
  onAction={handleRoomPatient}
  onChooseNextStep={handleChooseNextStep}
  onCompleteForms={handleCompleteForms}
  getInitials={getInitials}
  formatTime={formatTime}
  getWaitingMinutes={getWaitingMinutes}
  getWaitingLabel={getWaitingLabel}
  getWaitBadgeClasses={getWaitBadgeClasses}
/>

    <PatientFlowSection
  title="In Visit"
  description="Roomed patients whose visits are currently in progress."
  appointments={filteredRoomedAppointments}
  mode="roomed"
  loading={loading}
  activeAppointmentId={completingId}
  formsUpdatingId={formsUpdatingId}

   waitPredictions={waitPredictions}
  onAction={handleCompleteVisit}
  onChooseNextStep={handleChooseNextStep}
  onCompleteForms={handleCompleteForms}
  getInitials={getInitials}
  formatTime={formatTime}
  getWaitingMinutes={getWaitingMinutes}
  getWaitingLabel={getWaitingLabel}
  getWaitBadgeClasses={getWaitBadgeClasses}
/>

</div>
      )}

<AddWalkInModal
  open={showWalkInModal}
  onClose={() => setShowWalkInModal(false)}
  onAdded={(message) => {
    setError("");
    setSuccessMessage(message);
    void loadQueue(true);
  }}
/>

<WalkInNextStepModal
  patient={nextStepPatient}
  onClose={handleCloseNextStep}
  onSaved={handleNextStepSaved}
/>
</section>
  );
}

export default LiveQueuePage;