import { apiFetch } from "../lib/api";
import TodayHeader from "../dashboard/TodayHeader";
import KpiCards from "../dashboard/KpiCards";
import WaitTimesPanel from "../dashboard/WaitTimesPanel";
import NeedsAttentionPanel from "../dashboard/NeedsAttentionPanel";
import RoomsProvidersPanel from "../dashboard/RoomsProvidersPanel";
import ClinicVideoHero from "../components/ClinicVideoHero";
import { useEffect, useState } from "react";
import { socket } from "../socket";
import { useWaitTimeSummary } from "../components/waittime/useWaitTimeSummary";
import type { QueueAppointment } from "../types/appointment";
import type { WaitPredictionsResponse } from "../components/waittime/waitTimeTypes";

export type DashboardSummary = {
  patients_today: number;
  average_wait_minutes: number | null;
  patients_waiting: number;
  checked_in_today: number;
  rooms_assigned: number;
  rooms_occupied: number;
  total_rooms: number;
  rooms_available: number;
};

export type ProviderOperationalStatus =
  | "available"
  | "in_consult"
  | "unavailable";

export type DashboardProvider = {
  doctor_id: number;
  first_name: string;
  last_name: string;
  specialty: string | null;

  current_status: ProviderOperationalStatus;
  status_reason: string | null;
  current_appointment_id: number | null;

  room_name: string | null;

  patient_first_name: string | null;
  patient_last_name: string | null;
};

function DashboardPage() {
  const [dashboardSummary, setDashboardSummary] =
    useState<DashboardSummary | null>(null);

  const [dashboardProviders, setDashboardProviders] =
    useState<DashboardProvider[]>([]);

  // Today's flow, for the "Needs attention" list. Loaded
  // separately so a failure here never hides the rest.
  const [flow, setFlow] = useState<QueueAppointment[]>([]);
  const [flowError, setFlowError] = useState("");

  // Projected doctor per appointment (walk-ins on "next
  // available doctor"), from the wait-time predictions.
  const [projectedProviderIds, setProjectedProviderIds] =
    useState<Record<number, number>>({});

  const {
    summary: waitSummary,
    loading: waitLoading,
    error: waitError,
  } = useWaitTimeSummary();

  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] =
    useState("");

  async function loadFlow() {
    try {
      const response = await apiFetch("/api/appointments/flow/today");
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message ?? "Unable to load today's patients.");
      }

      setFlow(data as QueueAppointment[]);
      setFlowError("");

      // Optional: without predictions the list still works.
      try {
        const predictionsResponse = await apiFetch(
          "/api/wait-time/predictions",
        );

        if (predictionsResponse.ok) {
          const predictionsData =
            (await predictionsResponse.json()) as WaitPredictionsResponse;

          const projected: Record<number, number> = {};

          for (const prediction of predictionsData.predictions ?? []) {
            if (prediction.projectedProviderId !== null) {
              projected[prediction.appointmentId] =
                prediction.projectedProviderId;
            }
          }

          setProjectedProviderIds(projected);
        }
      } catch {
        // Keep the last known projections.
      }
    } catch (error) {
      setFlowError(
        error instanceof Error
          ? error.message
          : "Unable to load today's patients.",
      );
    }
  }

  async function loadDashboardData(
    backgroundRefresh = false,
  ) {
    try {
      if (!backgroundRefresh) {
        setLoading(true);
      }

      setErrorMessage("");

      const [summaryResponse, providersResponse] =
        await Promise.all([
          apiFetch(
            "/api/dashboard/summary",
          ),
          apiFetch(
            "/api/provider-status",
          ),
          loadFlow(),
        ]);

      const summaryData =
        await summaryResponse.json();

      const providersData =
        await providersResponse.json();

      if (!summaryResponse.ok) {
        throw new Error(
          summaryData.message ??
            "Unable to load dashboard summary.",
        );
      }

      if (!providersResponse.ok) {
        throw new Error(
          providersData.message ??
            "Unable to load room statuses.",
        );
      }

      setDashboardSummary(summaryData);
      setDashboardProviders(providersData);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to load dashboard.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDashboardData();

    function handleClinicFlowUpdate() {
      loadDashboardData(true);
    }

    socket.on(
      "clinicflow:updated",
      handleClinicFlowUpdate,
    );

    // "Late" and "long wait" depend on the clock alone,
    // so re-check every minute too.
    const interval = window.setInterval(() => {
      if (!document.hidden) {
        loadDashboardData(true);
      }
    }, 60_000);

    return () => {
      window.clearInterval(interval);

      socket.off(
        "clinicflow:updated",
        handleClinicFlowUpdate,
      );
    };
  }, []);

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      {/* "How it works" lives on the video banner. */}
      <ClinicVideoHero compact />

      <TodayHeader
        waitSummary={waitSummary}
        waitLoading={waitLoading}
      />

      {errorMessage && (
        <div className="rounded-control border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          {errorMessage}
        </div>
      )}

      <KpiCards
        summary={dashboardSummary}
        loading={loading}
        waitSummary={waitSummary}
        waitLoading={waitLoading}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <WaitTimesPanel
            waitSummary={waitSummary}
            waitLoading={waitLoading}
            waitError={waitError}
          />
        </div>

        <NeedsAttentionPanel
          appointments={flow}
          projectedDoctorNames={Object.fromEntries(
            Object.entries(projectedProviderIds).flatMap(
              ([appointmentId, providerId]) => {
                const provider = dashboardProviders.find(
                  (item) => item.doctor_id === providerId,
                );

                return provider
                  ? [[appointmentId, `Dr. ${provider.first_name} ${provider.last_name}`]]
                  : [];
              },
            ),
          )}
          loading={loading}
          error={flowError}
        />
      </div>

      <RoomsProvidersPanel
        providers={dashboardProviders}
        loading={loading}
      />
    </div>
  );
}

export default DashboardPage;
