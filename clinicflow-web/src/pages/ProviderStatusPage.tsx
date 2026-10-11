import { apiFetch } from "../lib/api";
import { useEffect, useMemo, useState } from "react";
import { socket } from "../socket";
import {
  Search,
  Stethoscope,
  UserRoundCheck,
  UserRoundX,
} from "lucide-react";

import ProviderStatusCard, {
  type ProviderStatus,
} from "../components/ProviderStatusCard";
import LiveIndicator from "../components/LiveIndicator";




function ProviderStatusPage() {
  const [providers, setProviders] = useState<
    ProviderStatus[]
  >([]);

  const [loading, setLoading] = useState(true);

 

  const [searchTerm, setSearchTerm] =
    useState("");


  const [errorMessage, setErrorMessage] =
    useState("");

  useEffect(() => {
  loadProviderStatuses();

  function handleClinicFlowUpdate() {
    loadProviderStatuses(true);
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

  async function loadProviderStatuses(
    backgroundRefresh = false,
  ) {
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
            "Unable to load provider statuses.",
        );
      }

      const providerData =
        data as ProviderStatus[];

      setProviders(providerData);

    
    } catch (error) {
      if (error instanceof Error) {
        setErrorMessage(error.message);
      } else {
        setErrorMessage(
          "Unable to load provider statuses.",
        );
      }
    } finally {
      setLoading(false);
    }
  }

  
  

  function formatStatusLabel(
    status:
      | "available"
      | "in_consult"
      | "unavailable",
  ) {
    if (status === "available") {
      return "Available";
    }

    if (status === "in_consult") {
      return "In Consult";
    }

    return "Unavailable";
  }



  const filteredProviders = useMemo(() => {
    const normalizedSearch =
      searchTerm.trim().toLowerCase();

    if (!normalizedSearch) {
      return providers;
    }

    return providers.filter((provider) => {
      const providerName =
        `${provider.first_name} ${provider.last_name}`.toLowerCase();

      const specialty =
        provider.specialty?.toLowerCase() ?? "";

      const status = formatStatusLabel(
        provider.current_status,
      ).toLowerCase();

      return (
        providerName.includes(normalizedSearch) ||
        specialty.includes(normalizedSearch) ||
        status.includes(normalizedSearch)
      );
    });
  }, [providers, searchTerm]);

  const availableCount = providers.filter(
    (provider) =>
      provider.current_status === "available",
  ).length;

  const inConsultCount = providers.filter(
    (provider) =>
      provider.current_status === "in_consult",
  ).length;

  const unavailableCount = providers.filter(
    (provider) =>
      provider.current_status === "unavailable",
  ).length;

  return (
    <section className="mx-auto w-full max-w-7xl space-y-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-[#13B2B3]">
            <Stethoscope size={18} />
            Provider operations
          </div>

          <h1 className="text-3xl font-bold text-slate-950">
            Provider Status
          </h1>

          <p className="mt-1 max-w-2xl text-slate-500">
            Let clinic staff know which physicians are
            available, currently consulting, or temporarily
            unavailable.
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="flex min-w-0 items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm sm:w-[330px]">
            <Search
              size={18}
              className="shrink-0 text-slate-400"
            />

            <input
              type="search"
              value={searchTerm}
              onChange={(event) =>
                setSearchTerm(event.target.value)
              }
              placeholder="Search provider or status"
              className="min-w-0 flex-1 bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
            />
          </div>

          <LiveIndicator />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatusSummaryCard
          label="Available"
          value={availableCount}
          icon={
            <UserRoundCheck size={20} />
          }
          helper="Ready for next patient"
          iconClassName="bg-emerald-50 text-emerald-600"
        />

        <StatusSummaryCard
          label="In Consult"
          value={inConsultCount}
          icon={<Stethoscope size={20} />}
          helper="Currently with a patient"
          iconClassName="bg-blue-50 text-blue-600"
        />

        <StatusSummaryCard
          label="Unavailable"
          value={unavailableCount}
          icon={<UserRoundX size={20} />}
          helper="Not accepting next patient"
          iconClassName="bg-slate-100 text-slate-600"
        />
      </div>

     

      {errorMessage && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          {errorMessage}
        </div>
      )}

      {loading ? (
        <div className="flex min-h-[320px] items-center justify-center rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center gap-3 text-sm font-medium text-slate-500">
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-slate-200 border-t-[#13B2B3]" />
            Loading provider statuses...
          </div>
        </div>
      ) : filteredProviders.length === 0 ? (
        <div className="flex min-h-[300px] flex-col items-center justify-center rounded-3xl border border-dashed border-slate-300 bg-white px-6 text-center">
          <Search
            size={28}
            className="text-[#13B2B3]"
          />

          <h2 className="mt-4 font-bold text-slate-900">
            No providers found
          </h2>

          <p className="mt-1 text-sm text-slate-500">
            Try another search term.
          </p>
        </div>
      ) : (
   <div className="grid gap-5 xl:grid-cols-2">
  {filteredProviders.map((provider) => (
    <ProviderStatusCard
      key={provider.doctor_id}
      provider={provider}
      onChanged={() =>
        loadProviderStatuses(true)
      }
    />
  ))}
</div>
        
      )}
    </section>
  );
}

type StatusSummaryCardProps = {
  label: string;
  value: number;
  helper: string;
  icon: React.ReactNode;
  iconClassName: string;
};

function StatusSummaryCard({
  label,
  value,
  helper,
  icon,
  iconClassName,
}: StatusSummaryCardProps) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-slate-500">
            {label}
          </p>

          <p className="mt-2 text-3xl font-bold text-slate-950">
            {value}
          </p>

          <p className="mt-1 text-xs text-slate-400">
            {helper}
          </p>
        </div>

        <div
          className={`flex h-10 w-10 items-center justify-center rounded-xl ${iconClassName}`}
        >
          {icon}
        </div>
      </div>
    </div>
  );
}


export default ProviderStatusPage;