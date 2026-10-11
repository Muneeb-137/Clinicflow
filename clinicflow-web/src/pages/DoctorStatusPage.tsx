import { CLINIC_TIME_ZONE } from "../utils/clinicTime";
import { apiFetch } from "../lib/api";
import { useEffect, useState } from "react";
import {
  Activity,
  CheckCircle2,
  Clock3,
  DoorOpen,
  Eye,
  Stethoscope,
  UserRoundCheck,
  UserRoundX,
} from "lucide-react";

import ProviderStatusCard, {
  type ProviderStatus,
} from "../components/ProviderStatusCard";

import { useAuth } from "../context/AuthContext";
import { socket } from "../socket";

function DoctorStatusPage() {
  const { staff } = useAuth();

  const [provider, setProvider] =
    useState<ProviderStatus | null>(null);

    type ReadinessPrompt = {
  doctorId: number;
  shouldPrompt: boolean;
  reason:
    | "not_in_consult"
    | "no_active_visit"
    | "within_expected_duration"
    | "active_readiness_estimate"
    | "forecast_stale";
};

const [readinessPrompt, setReadinessPrompt] =
  useState<ReadinessPrompt | null>(null);

  const [loading, setLoading] =
    useState(true);

  const [errorMessage, setErrorMessage] =
    useState("");

  const [showCustomReadiness, setShowCustomReadiness] =
    useState(false);

  const [customReadinessMinutes, setCustomReadinessMinutes] =
    useState("");

  useEffect(() => {
    loadProviderStatus();

    function handleClinicFlowUpdate() {
      loadProviderStatus(true);
    }

    socket.on(
      "clinicflow:updated",
      handleClinicFlowUpdate,
    );

    /*
     * The "when will you be ready?" prompt depends on the
     * clock (a consult passing its expected length), not
     * on any event, so check again every minute.
     */
    const refreshInterval = window.setInterval(() => {
      if (!document.hidden) {
        loadProviderStatus(true);
      }
    }, 60_000);

    return () => {
      window.clearInterval(refreshInterval);

      socket.off(
        "clinicflow:updated",
        handleClinicFlowUpdate,
      );
    };
  }, [staff?.doctor_id]);

  async function loadProviderStatus(
    backgroundRefresh = false,
  ) {
    if (!staff?.doctor_id) {
      setErrorMessage(
        "No physician profile is linked to this account.",
      );

      setLoading(false);
      return;
    }

    try {
      if (!backgroundRefresh) {
        setLoading(true);
      }

      setErrorMessage("");

      const response = await apiFetch(
        "/api/provider-status",
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.message ??
            "Unable to load physician status.",
        );
      }

      const providers =
        data as ProviderStatus[];

      const loggedInProvider =
        providers.find(
          (provider) =>
            provider.doctor_id ===
            staff.doctor_id,
        );

      if (!loggedInProvider) {
        throw new Error(
          "Unable to find your physician profile.",
        );
      }

      setProvider(loggedInProvider);

      const readinessResponse = await apiFetch(
  `/api/wait-time/readiness-prompt/${staff.doctor_id}`,
);

    const readinessData =
      await readinessResponse.json();

    if (!readinessResponse.ok) {
      throw new Error(
        readinessData.message ??
          "Unable to load readiness status.",
      );
    }

    setReadinessPrompt(
      readinessData as ReadinessPrompt,
    );
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to load physician status.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function submitReadinessEstimate(
    minutes: number,
  ) {
    if (!staff?.doctor_id) {
      return;
    }

    try {
      setErrorMessage("");

      const response = await apiFetch(
        `/api/provider-status/${staff.doctor_id}/readiness`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            minutes,
          }),
        },
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.message ??
            "Unable to update readiness estimate.",
        );
      }

      await loadProviderStatus(true);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to update readiness estimate.",
      );
    }
  }

  async function markReadyForNextPatient() {
  if (!staff?.doctor_id) {
    return;
  }

  try {
    setErrorMessage("");

    const response = await apiFetch(
      `/api/provider-status/${staff.doctor_id}/complete-consult`,
      {
        method: "PATCH",
      },
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        data.message ??
          "Unable to complete consultation.",
      );
    }

    await loadProviderStatus(true);
  } catch (error) {
    setErrorMessage(
      error instanceof Error
        ? error.message
        : "Unable to complete consultation.",
    );
  }
}

  function formatTime(dateTime: string | null) {
    if (!dateTime) {
      return "Not updated";
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

  function getActivityContent() {
    if (!provider) {
      return null;
    }

    if (provider.current_status === "available") {
      return {
        icon: (
          <UserRoundCheck size={22} />
        ),
        iconClass:
          "bg-emerald-50 text-emerald-600",
        label: "Available",
        title: "Ready for the next patient",
        description:
          "Clinic staff can currently see that you are available to receive the next patient.",
      };
    }

    if (provider.current_status === "in_consult") {
      return {
        icon: <Stethoscope size={22} />,
        iconClass:
          "bg-blue-50 text-blue-600",
        label: "In Consult",
        title:
          provider.patient_first_name &&
          provider.patient_last_name
            ? `Consultation with ${provider.patient_first_name} ${provider.patient_last_name}`
            : "Consultation in progress",
        description:
          provider.appointment_type_name
            ? `${provider.appointment_type_name}${
                provider.room_name
                  ? ` · ${provider.room_name}`
                  : ""
              }`
            : "You are currently marked as being with a patient.",
      };
    }

    return {
      icon: <UserRoundX size={22} />,
      iconClass:
        "bg-slate-100 text-slate-600",
      label: "Unavailable",
      title:
        provider.status_reason ??
        "Temporarily unavailable",
      description:
        "Clinic staff can see that you are not currently accepting the next patient.",
    };
  }

  const activity = getActivityContent();

  return (
    <section className="mx-auto w-full max-w-5xl space-y-6">
      {/* PAGE HEADER */}
      <div>
        <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-[#13B2B3]">
          <Stethoscope size={18} />
          Physician operations
        </div>

        <h1 className="text-3xl font-bold text-slate-950">
          My Status
        </h1>

        <p className="mt-1 max-w-2xl text-slate-500">
          Manage your current availability, room,
          and consultation status.
        </p>
      </div>

      {/* ERROR */}
      {errorMessage && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          {errorMessage}
        </div>
      )}

      {/* LOADING */}
      {loading ? (
        <div className="flex min-h-[300px] items-center justify-center rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center gap-3 text-sm font-medium text-slate-500">
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-slate-200 border-t-[#13B2B3]" />
            Loading your status...
          </div>
        </div>
      ) : provider ? (
        <>
          {/* SHARED PROVIDER CARD */}
          <ProviderStatusCard
            provider={provider}
            onChanged={() =>
              loadProviderStatus(true)
            }
          />

          {/* READINESS PROMPT */}
            {readinessPrompt?.shouldPrompt && (
              <div className="rounded-3xl border border-amber-200 bg-amber-50 p-6 shadow-sm">
                <div className="flex items-start gap-4">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
                    <Clock3 size={20} />
                  </div>

                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.12em] text-amber-700">
                      Readiness Update
                    </p>

                    <h2 className="mt-1 text-lg font-bold text-slate-950">
                      When do you expect to be ready for your next patient?
                    </h2>

                    <p className="mt-1 text-sm text-slate-600">
                      Your expected consultation time has passed.
                      Give ClinicFlow a quick estimate so patient
                      wait times can stay up to date.
                    </p>

                    <div className="mt-5 flex flex-wrap gap-2">
                      {[5, 10, 15, 20, 30].map(
                        (minutes) => (
                          <button
                            key={minutes}
                            type="button"
                            onClick={() =>
                              submitReadinessEstimate(minutes)
                            }
                            className="rounded-xl border border-amber-300 bg-white px-4 py-2.5 text-sm font-bold text-slate-800 transition hover:border-amber-400 hover:bg-amber-100"
                          >
                            {minutes} min
                          </button>
                        ),
                      )}

                      <button
                        type="button"
                        onClick={() =>
                          setShowCustomReadiness(
                            (current) => !current,
                          )
                        }
                        className="rounded-xl border border-amber-300 bg-white px-4 py-2.5 text-sm font-bold text-slate-800 transition hover:border-amber-400 hover:bg-amber-100"
                      >
                        Other
                      </button>

                      <div className="mt-5 border-t border-amber-200 pt-5">
                        <button
                          type="button"
                          onClick={markReadyForNextPatient}
                          className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-700"
                        >
                          <UserRoundCheck size={18} />
                          Ready for next patient
                        </button>

                        <p className="mt-2 text-xs text-slate-500">
                          Use this when your current consultation is complete
                          and you are ready to receive another patient.
                        </p>
                      </div>
                    </div>

                    {showCustomReadiness && (
                      <div className="mt-3 flex max-w-sm gap-2">
                        <input
                          type="number"
                          min="1"
                          max="60"
                          value={customReadinessMinutes}
                          onChange={(event) =>
                            setCustomReadinessMinutes(
                              event.target.value,
                            )
                          }
                          placeholder="Minutes"
                          className="min-w-0 flex-1 rounded-xl border border-amber-300 bg-white px-4 py-2.5 text-sm outline-none focus:border-amber-500"
                        />

                        <button
                          type="button"
                          onClick={() => {
                            const minutes = Number(
                              customReadinessMinutes,
                            );

                            if (
                              Number.isInteger(minutes) &&
                              minutes >= 1 &&
                              minutes <= 60
                            ) {
                              submitReadinessEstimate(minutes);
                            }
                          }}
                          className="rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-slate-800"
                        >
                          Update
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

          {/* CURRENT ACTIVITY */}
          {activity && (
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="mb-5 flex items-center gap-2">
                <Activity
                  size={19}
                  className="text-[#13B2B3]"
                />

                <h2 className="text-lg font-bold text-slate-950">
                  Current Activity
                </h2>
              </div>

              <div className="flex flex-col gap-4 rounded-2xl bg-slate-50 p-5 sm:flex-row sm:items-center">
                <div
                  className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${activity.iconClass}`}
                >
                  {activity.icon}
                </div>

                <div className="min-w-0">
                  <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-400">
                    {activity.label}
                  </p>

                  <h3 className="mt-1 text-base font-bold text-slate-900">
                    {activity.title}
                  </h3>

                  <p className="mt-1 text-sm text-slate-500">
                    {activity.description}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* AT A GLANCE */}
          <div>
            <div className="mb-4">
              <h2 className="text-lg font-bold text-slate-950">
                At a Glance
              </h2>

              <p className="mt-1 text-sm text-slate-500">
                Your current operational details.
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              {/* ROOM */}
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#13B2B3]/10 text-[#13B2B3]">
                  <DoorOpen size={19} />
                </div>

                <p className="mt-4 text-xs font-bold uppercase tracking-[0.12em] text-slate-400">
                  Assigned Room
                </p>

                <p className="mt-1 font-bold text-slate-900">
                  {provider.room_name ??
                    "No room assigned"}
                </p>
              </div>

              {/* VISIBILITY */}
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#13B2B3]/10 text-[#13B2B3]">
                  <Eye size={19} />
                </div>

                <p className="mt-4 text-xs font-bold uppercase tracking-[0.12em] text-slate-400">
                  Clinic Visibility
                </p>

                <div className="mt-1 flex items-center gap-2">
                  <CheckCircle2
                    size={16}
                    className="text-emerald-500"
                  />

                  <p className="font-bold text-slate-900">
                    Visible to staff
                  </p>
                </div>
              </div>

              {/* UPDATED */}
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#13B2B3]/10 text-[#13B2B3]">
                  <Clock3 size={19} />
                </div>

                <p className="mt-4 text-xs font-bold uppercase tracking-[0.12em] text-slate-400">
                  Status Updated
                </p>

                <p className="mt-1 font-bold text-slate-900">
                  {formatTime(
                    provider.status_updated_at,
                  )}
                </p>
              </div>
            </div>
          </div>
        </>
      ) : null}
    </section>
  );
}

export default DoctorStatusPage;