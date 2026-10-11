import { CLINIC_TIME_ZONE } from "../utils/clinicTime";
import { formatDoctorName } from "../utils/formatDoctorName";
import { apiFetch } from "../lib/api";
import { useEffect, useRef, useState } from "react";
import { socket } from "../socket";
import {
  Clock3,
  DoorOpen,
  MapPin,
  Stethoscope,
  UsersRound,
} from "lucide-react";

import type { QueueAppointment } from "../types/appointment";
import { WaitSummaryStrip } from "../components/waittime/WaitTimeTiles";
import {
  fetchWaitTimeSummary,
  formatClockTime,
  formatWaitRange,
  getConfidenceLabel,
  roundMinutes,
} from "../components/waittime/waitTimeFormat";
import type { WaitTimeSummary } from "../components/waittime/waitTimeTypes";
import LiveIndicator from "../components/LiveIndicator";

/*
 * /api/patient-queue/today rows. is_short_visit is only
 * ever true on the signed-in patient's own row.
 */
type PatientQueueRow = QueueAppointment & {
  is_current_patient?: boolean;
  is_short_visit?: boolean;
};

const SHORT_VISIT_PATIENT_NOTE =
  "You arrived near the end of walk-in hours, so your visit may be shorter than usual. The doctor will focus on your main concern.";

function PatientLiveQueuePage() {
  const [waitingAppointments, setWaitingAppointments] =
    useState<PatientQueueRow[]>([]);

  const [roomedAppointments, setRoomedAppointments] =
    useState<PatientQueueRow[]>([]);

  // Aggregates only, plus this patient's own prediction.
  const [waitSummary, setWaitSummary] =
    useState<WaitTimeSummary | null>(null);

  const [waitSummaryError, setWaitSummaryError] =
    useState("");

  const [loading, setLoading] = useState(true);

  const [error, setError] = useState("");

  // This patient's own walk-in: arrived, not checked in yet.
  const [myArrivedWalkIn, setMyArrivedWalkIn] =
    useState<PatientQueueRow | null>(null);

  // Only the newest load may update the screen.
  const loadSequence = useRef(0);

  useEffect(() => {
  loadQueue();

  function handleClinicFlowUpdate() {
    loadQueue(true);
  }

  socket.on(
    "clinicflow:updated",
    handleClinicFlowUpdate,
  );

  // Estimates change with the clock alone (a visit
  // running long), so refresh every minute as staff
  // screens do.
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

  async function loadQueue(
    backgroundRefresh = false,
  ) {
    const requestId = ++loadSequence.current;
    const isLatest = () =>
      requestId === loadSequence.current;

    try {
      if (!backgroundRefresh) {
        setLoading(true);
      }

      setError("");

      /*
       * Read-only routes. Wait times load alongside the
       * queue but never block it if they fail.
       */
      const [flowResponse, summaryResult] =
        await Promise.all([
          apiFetch(
            "/api/patient-queue/today",
          ),

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
            "Unable to load the live queue.",
        );
      }

      if (!isLatest()) {
        return;
      }

      const patientFlow =
        flowData as PatientQueueRow[];

      setMyArrivedWalkIn(
        patientFlow.find(
          (appointment) =>
            appointment.status === "scheduled" &&
            appointment.is_current_patient === true,
        ) ?? null,
      );

      /*
       * Only display patients who are actually
       * in the live clinic flow.
       *
       * Scheduled patients are intentionally
       * hidden from the patient-facing queue.
       */
      setWaitingAppointments(
        patientFlow.filter(
          (appointment) =>
            appointment.status === "checked_in",
        ),
      );

      setRoomedAppointments(
        patientFlow.filter(
          (appointment) =>
            appointment.status === "roomed",
        ),
      );

      setWaitSummary(summaryResult.data);
      setWaitSummaryError(summaryResult.error);
    } catch (error) {
      if (!isLatest()) {
        return;
      }

      if (error instanceof Error) {
        setError(error.message);
      } else {
        setError(
          "Unable to load the current queue.",
        );
      }
    } finally {
      if (isLatest()) {
        setLoading(false);
      }
    }
  }

  function formatTime(
    dateTime: string | null | undefined,
  ) {
    if (!dateTime) {
      return "Not available";
    }

    const date = new Date(dateTime);

    if (Number.isNaN(date.getTime())) {
      return dateTime;
    }

    return date.toLocaleTimeString("en-US", {
      timeZone: CLINIC_TIME_ZONE,
      hour: "numeric",
      minute: "2-digit",
    });
  }

  function getWaitingMinutes(
    waitingMinutes:
      | number
      | string
      | null
      | undefined,
  ) {
    const parsedWaitingMinutes =
      Number(waitingMinutes);

    if (Number.isNaN(parsedWaitingMinutes)) {
      return 0;
    }

    return Math.max(
      0,
      Math.floor(parsedWaitingMinutes),
    );
  }

  function getWaitingLabel(
    waitingMinutes: number,
  ) {
    if (waitingMinutes < 1) {
      return "Just arrived";
    }

    if (waitingMinutes === 1) {
      return "1 minute";
    }

    return `${waitingMinutes} minutes`;
  }

  function getWaitBadgeClasses(
    waitingMinutes: number,
  ) {
    if (waitingMinutes >= 30) {
      return "border-red-200 bg-red-50 text-red-700";
    }

    if (waitingMinutes >= 15) {
      return "border-amber-200 bg-amber-50 text-amber-700";
    }

    return "border-teal-200 bg-teal-50 text-teal-700";
  }

  const myPrediction =
    waitSummary?.myPrediction ?? null;

  const myExpectedMinutes = roundMinutes(
    myPrediction?.expectedWaitMinutes,
  );

  const myWaitRange = formatWaitRange(
    myPrediction?.lowerWaitMinutes,
    myPrediction?.upperWaitMinutes,
  );

  // Pushed to a later walk-in block today: show the clock
  // time instead of a long minute count.
  const myNextWalkInTime =
    myPrediction?.walkInBlock?.status === "later"
      ? formatClockTime(myPrediction.walkInBlock.startsAt) ??
        formatClockTime(myPrediction.projectedStartAt)
      : null;

  // Projected start inside that later block ("about 5:15 PM").
  const mySeenAtTime = myNextWalkInTime
    ? formatClockTime(myPrediction?.projectedStartAt)
    : null;

  const myWalkInHoursEnd = formatClockTime(
    myPrediction?.walkInBlock?.endsAt,
  );

  // Own row was added with a walk-in capacity override.
  const myShortVisit = [
    ...waitingAppointments,
    ...roomedAppointments,
  ].some(
    (appointment) =>
      appointment.is_short_visit === true &&
      appointment.is_current_patient !== false,
  );

  return (
    <section className="space-y-6">
      {/* PAGE HEADER */}
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-[#13B2B3]">
            <UsersRound size={18} />

            Live clinic updates
          </div>

          <h1 className="text-3xl font-bold text-slate-950">
            Live Queue
          </h1>

          <p className="mt-1 text-slate-500">
            Follow the current clinic queue and
            estimated waiting times.
          </p>
        </div>

        <LiveIndicator />
      </div>

      {/* ARRIVED, WAITING FOR CHECK-IN (own walk-in) */}
      {myArrivedWalkIn && (
        <div className="flex items-start gap-3 rounded-2xl border border-sky-200 bg-sky-50 px-5 py-4 text-sky-900">
          <MapPin
            size={19}
            className="mt-0.5 shrink-0 text-sky-600"
          />

          <div>
            <p className="text-sm font-bold">
              You're on today's walk-in list
            </p>

            <p className="mt-1 text-sm leading-6 text-sky-800">
              Please check in at the front desk. Your place
              in the queue below appears once you're
              checked in.
            </p>
          </div>
        </div>
      )}

      {/* YOUR ESTIMATED WAIT (only this patient's own prediction) */}
      {myPrediction && (
        <div className="relative overflow-hidden rounded-2xl border border-[#13B2B3]/25 bg-gradient-to-r from-[#F2FCFC] via-white to-white p-5 shadow-sm">
          <div className="absolute left-0 top-0 h-full w-1.5 bg-[#13B2B3]" />

          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-[#13B2B3]">
                Your estimated wait
              </p>

              {myNextWalkInTime ? (
                <p className="mt-1 text-2xl font-bold tracking-tight text-slate-950">
                  Next walk-in time {myNextWalkInTime}
                </p>
              ) : myExpectedMinutes === null ? (
                <p className="mt-2 text-lg font-semibold text-slate-600">
                  We can't estimate your wait right now
                </p>
              ) : myExpectedMinutes === 0 ? (
                <p className="mt-1 text-4xl font-bold tracking-tight text-slate-950">
                  You're next
                </p>
              ) : (
                <p className="mt-1 text-4xl font-bold tracking-tight text-slate-950">
                  ~{myExpectedMinutes}
                  <span className="ml-1.5 text-lg font-medium text-slate-400">
                    min
                  </span>
                </p>
              )}

              {!myNextWalkInTime &&
                myExpectedMinutes !== null &&
                myExpectedMinutes > 0 &&
                myWaitRange && (
                  <p className="mt-1 text-sm font-medium text-slate-500">
                    Likely between {myWaitRange} minutes
                  </p>
                )}

              {myNextWalkInTime && (
                <p className="mt-1 max-w-xl text-sm text-slate-500">
                  You'll be seen in the next walk-in hours,
                  at about {mySeenAtTime ?? myNextWalkInTime}.
                  You're welcome to step out and come back a
                  few minutes before.
                </p>
              )}

              {!myNextWalkInTime && myExpectedMinutes === null && (
                <p className="mt-1 text-sm text-slate-500">
                  The front desk will keep you updated.
                </p>
              )}

              {myPrediction.mayMissWalkInHours && (
                <p className="mt-2 max-w-xl rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium leading-5 text-amber-700">
                  {myWalkInHoursEnd
                    ? `If visits run long you may be seen after walk-in hours end (${myWalkInHoursEnd}); staff will let you know.`
                    : "If visits run long you may be seen after walk-in hours end; staff will let you know."}
                </p>
              )}

              {myShortVisit && (
                <p className="mt-2 max-w-xl rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium leading-5 text-amber-700">
                  {SHORT_VISIT_PATIENT_NOTE}
                </p>
              )}
            </div>

            <div className="flex flex-wrap gap-2 sm:justify-end">
              {myPrediction.patientsAhead != null && (
                <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600">
                  {myPrediction.patientsAhead === 0
                    ? "No one ahead of you"
                    : myPrediction.patientsAhead === 1
                      ? "1 patient ahead of you"
                      : `${myPrediction.patientsAhead} patients ahead of you`}
                </span>
              )}

              {myExpectedMinutes !== null && !myNextWalkInTime && (
                <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-400">
                  {getConfidenceLabel(myPrediction.confidence)}
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Short-visit note when the wait card isn't shown */}
      {!myPrediction && myShortVisit && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-700">
          <Clock3
            size={17}
            className="mt-0.5 shrink-0"
          />

          <span>{SHORT_VISIT_PATIENT_NOTE}</span>
        </div>
      )}

      {/* TODAY'S WAIT TIMES (clinic-wide aggregates) */}
      <WaitSummaryStrip
        summary={waitSummary}
        loading={loading && !waitSummary}
        error={waitSummaryError}
      />

      {/* ERROR MESSAGE */}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          {error}
        </div>
      )}

      {/* WAITING QUEUE */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="font-bold text-slate-900">
              Waiting Queue
            </h2>

            <p className="text-sm text-slate-500">
              Patients currently checked in and
              waiting to be called.
            </p>
          </div>

          {!loading && (
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">
              {waitingAppointments.length}{" "}
              {waitingAppointments.length === 1
                ? "patient"
                : "patients"}
            </span>
          )}
        </div>

        {/* LOADING */}
        {loading && (
          <div className="flex min-h-[180px] items-center justify-center">
            <div className="flex items-center gap-3 text-sm font-medium text-slate-500">
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-slate-200 border-t-[#13B2B3]" />

              Loading live queue...
            </div>
          </div>
        )}

        {/* EMPTY WAITING QUEUE */}
        {!loading &&
          waitingAppointments.length === 0 && (
            <div className="flex min-h-[190px] flex-col items-center justify-center px-6 text-center">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#13B2B3]/10 text-[#13B2B3]">
                <UsersRound size={27} />
              </div>

              <h3 className="font-bold text-slate-900">
                The queue is empty
              </h3>

              <p className="mt-1 max-w-md text-sm text-slate-500">
                There are currently no patients
                waiting.
              </p>
            </div>
          )}

        {/* WAITING PATIENTS */}
        {!loading &&
          waitingAppointments.length > 0 && (
            <div className="divide-y divide-slate-100">
              {waitingAppointments.map(
                (appointment, index) => {
                  const waitingMinutes =
                    getWaitingMinutes(
                      appointment.waiting_minutes,
                    );

                  return (
                    <article
                      key={
                        appointment.appointment_id
                      }
                      aria-current={
                        appointment.is_current_patient
                          ? "true"
                          : undefined
                      }
                      className={`flex items-center gap-3 px-4 py-5 transition-all duration-300 sm:gap-4 sm:px-5 ${
                        appointment.is_current_patient
                          ? "border-l-4 border-[#13B2B3] bg-[#13B2B3]/5"
                          : "hover:bg-slate-50/70"
                      }`}
                    >
                      {/* QUEUE POSITION */}
                      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white ${
                        appointment.is_current_patient
                          ? "bg-[#13B2B3]"
                          : "bg-slate-950"
                      }`}>
                        {index + 1}
                      </div>

                      {/* GENERIC PATIENT ICON */}
                      <div className="hidden h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#13B2B3]/10 text-[#13B2B3] sm:flex">
                        <UsersRound size={20} />
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-base font-bold text-slate-950">
                            {appointment.is_current_patient
                              ? "You"
                              : "Patient"}
                          </h3>

                          <span
                            className={`rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${getWaitBadgeClasses(
                              waitingMinutes,
                            )}`}
                          >
                            {getWaitingLabel(
                              waitingMinutes,
                            )}
                          </span>
                        </div>

                        <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-500">
                          {/* Times are only shared for the patient's own row. */}
                          {appointment.checked_in_at && (
                          <span className="flex items-center gap-1.5">
                            <Clock3
                              size={15}
                              className="text-[#13B2B3]"
                            />

                            Checked in at{" "}
                            {formatTime(
                              appointment.checked_in_at,
                            )}
                          </span>
                          )}

                          <span className="flex items-center gap-1.5">
                            <Stethoscope
                              size={15}
                              className="text-[#13B2B3]"
                            />

                            {formatDoctorName(appointment.doctor_first_name, appointment.doctor_last_name)}
                          </span>
                        </div>
                      </div>

                      {/* READ ONLY LABEL */}
                      <div className="hidden shrink-0 sm:block">
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-500">
                          Waiting
                        </span>
                      </div>
                    </article>
                  );
                },
              )}
            </div>
          )}
      </div>

      {/* CURRENTLY IN VISIT */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="font-bold text-slate-900">
              Currently In Visit
            </h2>

            <p className="text-sm text-slate-500">
              Patients currently being seen by a
              provider.
            </p>
          </div>

          {!loading && (
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">
              {roomedAppointments.length}{" "}
              {roomedAppointments.length === 1
                ? "patient"
                : "patients"}
            </span>
          )}
        </div>

        {/* LOADING */}
        {loading && (
          <div className="flex min-h-[180px] items-center justify-center">
            <div className="flex items-center gap-3 text-sm font-medium text-slate-500">
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-slate-200 border-t-[#13B2B3]" />

              Loading active visits...
            </div>
          </div>
        )}

        {/* EMPTY */}
        {!loading &&
          roomedAppointments.length === 0 && (
            <div className="flex min-h-[190px] flex-col items-center justify-center px-6 text-center">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
                <DoorOpen size={27} />
              </div>

              <h3 className="font-bold text-slate-900">
                No active visits
              </h3>

              <p className="mt-1 max-w-md text-sm text-slate-500">
                No patients are currently in a
                consultation room.
              </p>
            </div>
          )}

        {/* ROOMED PATIENTS */}
        {!loading &&
          roomedAppointments.length > 0 && (
            <div className="divide-y divide-slate-100">
              {roomedAppointments.map(
                (appointment) => (
                  <article
                    key={
                      appointment.appointment_id
                    }
                    aria-current={
                      appointment.is_current_patient
                        ? "true"
                        : undefined
                    }
                    className={`flex items-center gap-3 px-4 py-5 transition-all duration-300 sm:gap-4 sm:px-5 ${
                      appointment.is_current_patient
                        ? "border-l-4 border-blue-500 bg-blue-50/60"
                        : "hover:bg-slate-50/70"
                    }`}
                  >
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
                      <DoorOpen size={21} />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-base font-bold text-slate-950">
                          {appointment.is_current_patient
                            ? "You"
                            : "Patient"}
                        </h3>

                        <span className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-blue-700">
                          In Visit
                        </span>
                      </div>

                      <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-500">
                        {appointment.roomed_at && (
                        <span className="flex items-center gap-1.5">
                          <Clock3
                            size={15}
                            className="text-[#13B2B3]"
                          />

                          Roomed at{" "}
                          {formatTime(
                            appointment.roomed_at,
                          )}
                        </span>
                        )}

                        <span className="flex items-center gap-1.5">
                          <Stethoscope
                            size={15}
                            className="text-[#13B2B3]"
                          />

                          {formatDoctorName(appointment.doctor_first_name, appointment.doctor_last_name)}
                        </span>
                      </div>
                    </div>
                  </article>
                ),
              )}
            </div>
          )}
      </div>

      {/* INFORMATION */}
      <div className="rounded-2xl border border-[#13B2B3]/20 bg-[#13B2B3]/5 px-5 py-4">
        <div className="flex items-start gap-3">
          <Clock3
            size={19}
            className="mt-0.5 shrink-0 text-[#13B2B3]"
          />

          <div>
            <p className="text-sm font-semibold text-slate-900">
              Queue information updates
              automatically
            </p>

            <p className="mt-1 text-sm leading-6 text-slate-600">
              The live queue updates as soon as the
              clinic checks patients in or moves them
              into a room, and wait estimates refresh
              every minute. Waiting times are estimates
              and may change depending on clinic
              activity.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

export default PatientLiveQueuePage;