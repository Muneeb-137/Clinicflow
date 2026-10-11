import clockIcon from "../assets/clock.svg";
import checkedIcon from "../assets/checked (1).svg";
import doorIcon from "../assets/bxs-door-open.svg";
import userGroup from "../assets/user-multiple-group-solid (1).svg";
import type { DashboardSummary } from "../pages/DashboardPage";

type KpiCardsProps = {
  summary: DashboardSummary | null;
  loading: boolean;
};

function KpiCards({
  summary,
  loading,
}: KpiCardsProps) {
  return (
        <div className="mt-3 grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4">
  <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
    <div className="flex items-start">
      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#F5FCFD] text-[13B2B3] ">
        <img src={userGroup} 
        alt="Patients"
        className = "h-6 w-6" 
        />
      </div>

      
    </div>

    <p className="mt-6 text-sm text-slate-500">
      Patients today
    </p>

    <p className="mt-1 text-3xl font-bold text-slate-900">
      {loading ? "—" : summary?.patients_today ?? 0}
    </p>
  </div>

  <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
    <div className="flex items-start">
      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#F5FCFD] text-xl">
        <img src={clockIcon} 
        alt="Clock"
        className = "h-6 w-6" 
        />
      </div>

      
    </div>

    <p className="mt-6 text-sm text-slate-500">
      Average wait time
    </p>

    <p className="mt-1 text-3xl font-bold text-slate-900">
      {loading
  ? "—"
  : summary?.average_wait_minutes != null
          ? `${summary.average_wait_minutes} min`
          : "No visits yet"}
    </p>
  </div>

  <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
    <div className="flex items-start">
      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#F5FCFD] text-xl">
        <img src={checkedIcon} 
        alt="Checked"
        className = "h-6 w-6" 
        />
      </div>

      
    </div>

    <p className="mt-6 text-sm text-slate-500">
      Patients waiting
    </p>

    <p className="mt-1 text-3xl font-bold text-slate-900">
      {loading ? "—" : summary?.patients_waiting ?? 0}
    </p>
  </div>

  <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
    <div className="flex items-start">
      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#F5FCFD] text-xl">
        <img src={doorIcon} 
        alt="Room"
        className = "h-6 w-6" 
        />
      </div>

      
    </div>

    <p className="mt-6 text-sm text-slate-500">
      Rooms in use
    </p>

    <p className="mt-1 text-3xl font-bold text-slate-900">
      {loading
  ? "—"
  : `${summary?.rooms_assigned ?? 0} / ${
      summary?.total_rooms ?? 6
    }`}
    </p>
  </div>
</div>
    
  );
}

export default KpiCards;