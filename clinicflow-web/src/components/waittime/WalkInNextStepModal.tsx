import { useEffect, useState } from "react";
import { Clock3, Stethoscope, UserRound, X } from "lucide-react";

import { apiFetch } from "../../lib/api";
import { formatClockTime, roundMinutes } from "./waitTimeFormat";
import type { WalkInOption, WalkInOptions } from "./waitTimeTypes";

export type WalkInNextStepPatient = {
  appointmentId: number;
  patientName: string;
};

type Selection =
  | { mode: "auto" }
  | { mode: "manual"; doctorId: number };

type WalkInNextStepModalProps = {
  patient: WalkInNextStepPatient | null;
  onClose: () => void;
  // Called after the PATCH succeeds, with the message for
  // the page's success banner.
  onSaved: (message: string) => void;
};

async function readMessage(
  response: Response,
  fallback: string,
): Promise<string> {
  try {
    const data = await response.json();

    return typeof data?.message === "string"
      ? data.message
      : fallback;
  } catch {
    return fallback;
  }
}

// The walk-in hours window the option's start time falls in.
function getStartWindow(option: WalkInOption) {
  if (!option.startAt) {
    return option.walkInHours[0] ?? null;
  }

  const start = new Date(option.startAt).getTime();

  return (
    option.walkInHours.find(
      (window) =>
        new Date(window.startAt).getTime() <= start &&
        start < new Date(window.endAt).getTime(),
    ) ??
    option.walkInHours[0] ??
    null
  );
}

function formatWaitHint(minutes: number | null) {
  const rounded = roundMinutes(minutes);

  return rounded === null ? null : `~${rounded} min`;
}

/*
 * Front desk: a waiting walk-in won't be seen before
 * their walk-in hours end, so the patient picks the next
 * available doctor (auto) or waits for a specific doctor's
 * next walk-in hours (manual). They keep their place in
 * line either way.
 */
export function WalkInNextStepModal({
  patient,
  onClose,
  onSaved,
}: WalkInNextStepModalProps) {
  const [options, setOptions] = useState<WalkInOptions | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [selection, setSelection] = useState<Selection | null>(null);

  const appointmentId = patient?.appointmentId ?? null;

  useEffect(() => {
    if (appointmentId === null) {
      return;
    }

    let cancelled = false;

    setOptions(null);
    setSelection(null);
    setError("");
    setLoading(true);

    (async () => {
      try {
        const response = await apiFetch(
          `/api/wait-time/walk-in-options/${appointmentId}`,
        );

        if (!response.ok) {
          throw new Error(
            response.status === 404
              ? "This walk-in is no longer waiting."
              : await readMessage(
                  response,
                  "Unable to load walk-in options.",
                ),
          );
        }

        const data = (await response.json()) as WalkInOptions;

        if (cancelled) {
          return;
        }

        setOptions(data);

        const currentDoctor =
          data.currentMode === "manual"
            ? data.doctors.find(
                (doctor) =>
                  doctor.doctorId != null &&
                  doctor.doctorId === data.currentDoctorId &&
                  doctor.startAt != null,
              )
            : undefined;

        if (currentDoctor?.doctorId != null) {
          setSelection({
            mode: "manual",
            doctorId: currentDoctor.doctorId,
          });
        } else if (data.nextAvailable) {
          setSelection({ mode: "auto" });
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Unable to load walk-in options.",
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [appointmentId]);

  useEffect(() => {
    if (!patient) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !saving) {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () =>
      window.removeEventListener("keydown", handleKeyDown);
  }, [patient, saving, onClose]);

  if (!patient) {
    return null;
  }

  const nextAvailable = options?.nextAvailable ?? null;
  const nextAvailableTime = formatClockTime(nextAvailable?.startAt);
  const nextAvailableWait = formatWaitHint(
    nextAvailable?.waitMinutes ?? null,
  );

  const isCurrentAuto = options?.currentMode === "auto";

  function buildSuccessMessage(chosen: Selection) {
    if (!patient || !options) {
      return "";
    }

    if (chosen.mode === "auto") {
      const details = [
        nextAvailable?.doctorName
          ? `Dr. ${nextAvailable.doctorName}`
          : null,
        nextAvailableTime ? `about ${nextAvailableTime}` : null,
      ]
        .filter(Boolean)
        .join(", ");

      return details
        ? `${patient.patientName} will be seen by the next available doctor (${details}).`
        : `${patient.patientName} will be seen by the next available doctor.`;
    }

    const doctor = options.doctors.find(
      (option) => option.doctorId === chosen.doctorId,
    );

    const doctorLabel = doctor?.doctorName
      ? `Dr. ${doctor.doctorName}`
      : "the chosen doctor";

    const time = formatClockTime(doctor?.startAt);

    return time
      ? `${patient.patientName} will wait for ${doctorLabel}'s next walk-in hours (about ${time}).`
      : `${patient.patientName} will wait for ${doctorLabel}'s next walk-in hours.`;
  }

  async function handleConfirm() {
    if (!patient || !selection) {
      return;
    }

    try {
      setSaving(true);
      setError("");

      const response = await apiFetch(
        `/api/appointments/${patient.appointmentId}/walk-in-assignment`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(
            selection.mode === "auto"
              ? { assignment_mode: "auto" }
              : {
                  assignment_mode: "manual",
                  doctor_id: selection.doctorId,
                },
          ),
        },
      );

      if (!response.ok) {
        throw new Error(
          response.status === 409
            ? await readMessage(
                response,
                "This patient has already been roomed.",
              )
            : await readMessage(
                response,
                "Unable to update the walk-in.",
              ),
        );
      }

      onSaved(buildSuccessMessage(selection));
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Unable to update the walk-in.",
      );
    } finally {
      setSaving(false);
    }
  }

  const optionBase =
    "flex w-full items-start gap-3 rounded-xl border px-4 py-3 text-left transition disabled:cursor-not-allowed disabled:opacity-60";

  function optionClasses(selected: boolean) {
    return `${optionBase} ${
      selected
        ? "border-[#13B2B3] bg-[#13B2B3]/5 ring-2 ring-[#13B2B3]/15"
        : "border-slate-200 bg-white hover:border-[#13B2B3]/40 hover:bg-slate-50"
    }`;
  }

  function radioDot(selected: boolean) {
    return (
      <span
        className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 ${
          selected ? "border-[#13B2B3]" : "border-slate-300"
        }`}
      >
        {selected && (
          <span className="h-2 w-2 rounded-full bg-[#13B2B3]" />
        )}
      </span>
    );
  }

  const currentTag = (
    <span className="rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-slate-600">
      Current
    </span>
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/40 p-4 backdrop-blur-[2px]"
      onClick={() => {
        if (!saving) {
          onClose();
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="walk-in-next-step-title"
        className="flex w-full max-w-lg flex-col rounded-2xl border border-slate-200 bg-white shadow-2xl max-h-[calc(100dvh-2rem)] overflow-y-auto"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#13B2B3]/10 text-[#13B2B3]">
              <Clock3 size={22} />
            </div>

            <div>
              <h2
                id="walk-in-next-step-title"
                className="text-xl font-bold text-slate-950"
              >
                Choose next step
              </h2>

              <p className="text-sm text-slate-500">
                {patient.patientName}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            aria-label="Close"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <X size={20} />
          </button>
        </div>

        <div className="space-y-5 overflow-y-auto p-6">
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium leading-5 text-amber-700">
            They keep their place in line. Tell the patient
            their time; they may leave and come back.
          </p>

          {loading && (
            <div className="flex min-h-[120px] items-center justify-center">
              <div className="flex items-center gap-3 text-sm font-medium text-slate-500">
                <span className="h-5 w-5 animate-spin rounded-full border-2 border-slate-200 border-t-[#13B2B3]" />
                Loading options...
              </div>
            </div>
          )}

          {!loading && options && (
            <>
              <div>
                <p className="mb-2 text-sm font-bold text-slate-700">
                  Next available doctor
                </p>

                <button
                  type="button"
                  disabled={!nextAvailable || saving}
                  onClick={() => setSelection({ mode: "auto" })}
                  className={optionClasses(selection?.mode === "auto")}
                >
                  {radioDot(selection?.mode === "auto")}

                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-slate-900">
                        {nextAvailable
                          ? [
                              nextAvailable.doctorName
                                ? `Dr. ${nextAvailable.doctorName}`
                                : "Next walk-in hours",
                              nextAvailableTime
                                ? `at ${nextAvailableTime}`
                                : null,
                              nextAvailableWait
                                ? `(${nextAvailableWait})`
                                : null,
                            ]
                              .filter(Boolean)
                              .join(" ")
                          : "No walk-in hours left today"}
                      </span>

                      {nextAvailable && (
                        <span className="rounded-full border border-[#13B2B3]/25 bg-[#13B2B3]/10 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-[#0d8587]">
                          Recommended
                        </span>
                      )}

                      {isCurrentAuto && currentTag}
                    </span>

                    <span className="mt-0.5 block text-xs text-slate-500">
                      Earliest walk-in hours of any doctor.
                    </span>
                  </span>
                </button>
              </div>

              <div>
                <p className="mb-2 text-sm font-bold text-slate-700">
                  Wait for a specific doctor
                </p>

                {options.doctors.length === 0 ? (
                  <p className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
                    No doctors have walk-in hours today.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {options.doctors.map((doctor, index) => {
                      const doctorId = doctor.doctorId;
                      const available =
                        doctorId != null && doctor.startAt != null;

                      const selected =
                        selection?.mode === "manual" &&
                        selection.doctorId === doctorId;

                      const isCurrent =
                        options.currentMode === "manual" &&
                        doctorId != null &&
                        options.currentDoctorId === doctorId;

                      const hoursWindow = getStartWindow(doctor);
                      const windowStart = formatClockTime(hoursWindow?.startAt);
                      const windowEnd = formatClockTime(hoursWindow?.endAt);
                      const seenAt = formatClockTime(doctor.startAt);

                      return (
                        <button
                          key={doctorId ?? `doctor-${index}`}
                          type="button"
                          disabled={!available || saving}
                          onClick={() => {
                            if (doctorId != null) {
                              setSelection({ mode: "manual", doctorId });
                            }
                          }}
                          className={optionClasses(selected)}
                        >
                          {radioDot(selected)}

                          <span className="min-w-0 flex-1">
                            <span className="flex flex-wrap items-center gap-2">
                              <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-900">
                                <Stethoscope
                                  size={14}
                                  className="text-[#13B2B3]"
                                />
                                {doctor.doctorName
                                  ? `Dr. ${doctor.doctorName}`
                                  : "Doctor"}
                              </span>

                              {isCurrent && currentTag}
                            </span>

                            <span className="mt-0.5 block text-xs text-slate-500">
                              {available
                                ? [
                                    windowStart && windowEnd
                                      ? `Next walk-in hours ${windowStart}–${windowEnd}`
                                      : "Next walk-in hours",
                                    seenAt ? `seen about ${seenAt}` : null,
                                  ]
                                    .filter(Boolean)
                                    .join(", ")
                                : "No more walk-in hours today"}
                            </span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}

          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
              {error}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-slate-200 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={handleConfirm}
            disabled={!selection || loading || saving || !options}
            className="inline-flex min-w-[120px] items-center justify-center gap-2 rounded-xl bg-[#13B2B3] px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-[#109a9b] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                Saving...
              </>
            ) : (
              <>
                <UserRound size={16} />
                Confirm
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export default WalkInNextStepModal;
