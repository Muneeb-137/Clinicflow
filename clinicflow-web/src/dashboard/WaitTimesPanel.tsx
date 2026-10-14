import { Clock3, Footprints } from "lucide-react";

import { Card, CardHeader } from "../components/ui/Card";
import { StatusBadge } from "../components/ui/StatusBadge";
import {
  BaselineDelta,
  MinutesValue,
} from "../components/waittime/WaitTimeTiles";
import {
  getVisitTypeSummary,
  pluralize,
  presentWalkInNow,
  roundMinutes,
  visitTypeLabels,
} from "../components/waittime/waitTimeFormat";
import type {
  VisitType,
  WaitTimeSummary,
} from "../components/waittime/waitTimeTypes";

const visitTypes: VisitType[] = ["walk_in", "scheduled"];

/*
 * Today's wait times by visit type, plus the estimate for
 * someone walking in now.
 */
function WaitTimesPanel({
  waitSummary,
  waitLoading,
  waitError,
}: {
  waitSummary: WaitTimeSummary | null;
  waitLoading: boolean;
  waitError: string;
}) {
  const newWalkIn = waitSummary?.newWalkIn ?? null;
  const walkInNow = presentWalkInNow(newWalkIn);
  const waitUnavailable = !waitLoading && !waitSummary;

  return (
    <Card className="h-full">
      <CardHeader
        icon={<Clock3 size={18} />}
        title="Current wait times"
        description="Average check-in to room wait today."
        action={
          waitUnavailable ? (
            <StatusBadge tone="neutral">Offline</StatusBadge>
          ) : null
        }
      />

      {waitUnavailable && (
        <p className="mt-4 rounded-control border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-500">
          {waitError || "Wait times are unavailable right now."}
        </p>
      )}

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {visitTypes.map((visitType) => {
          const visitSummary = getVisitTypeSummary(waitSummary, visitType);
          const longestNow = roundMinutes(
            visitSummary?.longestCurrentWaitMinutes,
          );
          const medianToday = roundMinutes(visitSummary?.medianWaitMinutes);

          return (
            <div
              key={visitType}
              className="rounded-control border border-slate-200 bg-slate-50/70 p-4"
            >
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-semibold text-slate-900">
                  {visitTypeLabels[visitType]}
                </h3>

                {!waitLoading && visitSummary && (
                  <StatusBadge
                    tone={visitSummary.waitingCount > 0 ? "brand" : "neutral"}
                  >
                    {visitSummary.waitingCount === 0
                      ? "No one waiting"
                      : `${visitSummary.waitingCount} waiting`}
                  </StatusBadge>
                )}
              </div>

              <div className="mt-3">
                <MinutesValue
                  minutes={visitSummary?.averageWaitMinutes}
                  emptyLabel="No visits yet today"
                  loading={waitLoading}
                  size="md"
                />
              </div>

              {!waitLoading && visitSummary && visitSummary.seenCount > 0 && (
                <p className="text-xs text-slate-500">
                  {pluralize(visitSummary.seenCount, "patient")} seen
                  {medianToday !== null && ` · median ${medianToday} min`}
                </p>
              )}

              {!waitLoading && <BaselineDelta summary={visitSummary} />}

              {!waitLoading &&
                visitSummary &&
                visitSummary.waitingCount > 0 &&
                longestNow !== null && (
                  <p className="mt-2 border-t border-slate-200 pt-2 text-xs text-slate-500">
                    Longest current wait{" "}
                    <span className="font-semibold text-slate-700">
                      {longestNow} min
                    </span>
                  </p>
                )}
            </div>
          );
        })}
      </div>

      {/* Walk in now */}
      <div className="mt-3 flex items-center justify-between gap-4 rounded-control border border-brand-100 bg-brand-50/60 p-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-brand-600 shadow-card">
            <Footprints size={18} />
          </span>

          <div className="min-w-0">
            <h3 className="font-semibold text-slate-900">Walk in now</h3>
            <p className="text-xs text-slate-500">
              {newWalkIn?.status === "open" && newWalkIn.acceptingDoctors > 0
                ? `${pluralize(newWalkIn.acceptingDoctors, "doctor")} seeing walk-ins${
                    walkInNow.spotsLabel ? ` · ${walkInNow.spotsLabel}` : ""
                  }`
                : "Estimated wait for a new walk-in"}
            </p>
          </div>
        </div>

        <div className="shrink-0 text-right">
          {waitLoading ? (
            <span className="text-xl font-bold text-slate-900">—</span>
          ) : waitUnavailable ? (
            <span className="text-sm font-semibold text-slate-500">
              Unavailable
            </span>
          ) : walkInNow.minutes === null ? (
            <>
              <p
                className={`text-sm font-semibold ${
                  walkInNow.tone === "warning"
                    ? "text-amber-700"
                    : "text-slate-500"
                }`}
              >
                {walkInNow.headline}
              </p>
              {walkInNow.detail && (
                <p className="text-xs text-slate-500">{walkInNow.detail}</p>
              )}
            </>
          ) : (
            <>
              <p>
                <span className="text-2xl font-bold text-slate-950">
                  ~{walkInNow.minutes}
                </span>
                <span className="ml-1 text-sm text-slate-500">min</span>
              </p>
              {walkInNow.detail && (
                <p className="text-xs text-slate-500">{walkInNow.detail}</p>
              )}
            </>
          )}
        </div>
      </div>
    </Card>
  );
}

export default WaitTimesPanel;
