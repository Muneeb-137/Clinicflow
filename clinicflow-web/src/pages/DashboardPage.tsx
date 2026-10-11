import { apiFetch } from "../lib/api";
import HeroSection from "../dashboard/HeroSection";
import KpiCards from "../dashboard/KpiCards";
import LiveOperations from "../dashboard/LiveOperations";
import { useEffect, useState } from "react";
import { socket } from "../socket";
import { useWaitTimeSummary } from "../components/waittime/useWaitTimeSummary";

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

  const {
    summary: waitSummary,
    loading: waitLoading,
    error: waitError,
  } = useWaitTimeSummary();

  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] =
    useState("");

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

  return () => {
    socket.off(
      "clinicflow:updated",
      handleClinicFlowUpdate,
    );
  };
}, []);

  return (
    <div className="mx-auto max-w-7xl">
      <HeroSection
        waitSummary={waitSummary}
        waitLoading={waitLoading}
      />

      {errorMessage && (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          {errorMessage}
        </div>
      )}

      <KpiCards
        summary={dashboardSummary}
        loading={loading}
      />

      <LiveOperations
        providers={dashboardProviders}
        loading={loading}
        waitSummary={waitSummary}
        waitLoading={waitLoading}
        waitError={waitError}
      />

      {/* The product explainer lives on "How it works". */}
    </div>
  );
}

export default DashboardPage;