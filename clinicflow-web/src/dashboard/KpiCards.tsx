import { Clock3, DoorOpen, Hourglass, UsersRound } from "lucide-react";

import type { DashboardSummary } from "../pages/DashboardPage";
import { StatCard } from "../components/ui/StatCard";
import {
  getVisitTypeSummary,
  roundMinutes,
  visitTypeLabels,
} from "../components/waittime/waitTimeFormat";
import type {
  VisitType,
  WaitTimeSummary,
} from "../components/waittime/waitTimeTypes";

type KpiCardsProps = {
  summary: DashboardSummary | null;
  loading: boolean;
  waitSummary: WaitTimeSummary | null;
  waitLoading: boolean;
};

/*
 * Walk-ins and booked patients wait very differently, so
 * the average is shown for each, never blended.
 */
function SplitWait({
  waitSummary,
}: {
  waitSummary: WaitTimeSummary | null;
}) {
  const dots: Record<VisitType, string> = {
    walk_in: "bg-brand-500",
    scheduled: "bg-indigo-400",
  };

  return (
    <span className="mt-1.5 block divide-y divide-slate-100">
      {(["walk_in", "scheduled"] as VisitType[]).map((type) => {
        const minutes = roundMinutes(
          getVisitTypeSummary(waitSummary, type)?.averageWaitMinutes,
        );

        return (
          <span
            key={type}
            className="flex items-baseline justify-between gap-3 py-1 first:pt-0 last:pb-0"
          >
            <span className="flex items-center gap-2 text-sm font-medium text-slate-600">
              <span className={`h-2 w-2 rounded-full ${dots[type]}`} />
              {visitTypeLabels[type]}
            </span>

            {minutes === null ? (
              <span className="whitespace-nowrap text-xs font-medium text-slate-500">
                No visits yet
              </span>
            ) : (
              <span className="whitespace-nowrap text-lg font-bold leading-6 tracking-tight text-slate-950">
                {minutes}
                <span className="ml-1 text-sm font-medium text-slate-400">
                  min
                </span>
              </span>
            )}
          </span>
        );
      })}
    </span>
  );
}

function KpiCards({
  summary,
  loading,
  waitSummary,
  waitLoading,
}: KpiCardsProps) {
  const waiting = summary?.patients_waiting ?? 0;
  const totalRooms = summary?.total_rooms ?? 0;

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard
        label="Patients today"
        value={summary?.patients_today ?? 0}
        caption={`${summary?.checked_in_today ?? 0} checked in so far`}
        icon={<UsersRound size={18} />}
        loading={loading}
      />

      <StatCard
        label="Average wait today"
        value={<SplitWait waitSummary={waitSummary} />}
        caption="Check-in to exam room"
        icon={<Clock3 size={18} />}
        loading={waitLoading && !waitSummary}
      />

      <StatCard
        label="Patients waiting"
        value={waiting}
        caption={waiting === 0 ? "No one is waiting" : "In the waiting room"}
        icon={<Hourglass size={18} />}
        loading={loading}
      />

      <StatCard
        label="Rooms in use"
        value={
          <>
            {summary?.rooms_assigned ?? 0}
            <span className="text-lg font-semibold text-slate-400">
              {" "}/ {totalRooms}
            </span>
          </>
        }
        caption={`${summary?.rooms_available ?? 0} available now`}
        icon={<DoorOpen size={18} />}
        loading={loading}
      />
    </div>
  );
}

export default KpiCards;
