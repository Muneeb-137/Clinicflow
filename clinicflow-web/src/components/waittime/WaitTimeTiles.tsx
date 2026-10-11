import {
  ArrowDownRight,
  ArrowUpRight,
  Clock3,
  Footprints,
  Minus,
  UsersRound,
} from "lucide-react";

import {
  compareWithBaseline,
  getVisitTypeSummary,
  pluralize,
  presentWalkInNow,
  roundMinutes,
  visitTypeLabels,
  walkInNowToneClasses,
} from "./waitTimeFormat";

import type {
  VisitType,
  VisitTypeWaitSummary,
  WaitTimeSummary,
} from "./waitTimeTypes";

/*
 * Today's average vs the 28-day average. Renders nothing
 * unless both exist. Shorter is good (emerald), longer is
 * a caution (amber); the arrow and words carry the
 * meaning so colour is never the only cue.
 */
export function BaselineDelta({
  summary,
}: {
  summary: VisitTypeWaitSummary | null;
}) {
  const comparison = compareWithBaseline(summary);

  if (!comparison) {
    return null;
  }

  const Icon =
    comparison.direction === "shorter"
      ? ArrowDownRight
      : comparison.direction === "longer"
        ? ArrowUpRight
        : Minus;

  const toneClasses =
    comparison.direction === "shorter"
      ? "text-emerald-700"
      : comparison.direction === "longer"
        ? "text-amber-700"
        : "text-slate-500";

  return (
    <p
      className={`mt-1 inline-flex items-center gap-1 text-xs font-semibold ${toneClasses}`}
      title={`28-day average: ${roundMinutes(summary?.baselineAverageWaitMinutes)} min`}
    >
      <Icon size={13} strokeWidth={2.4} />
      {comparison.text}
    </p>
  );
}

/*
 * Big minute value, or a muted empty-state phrase when
 * the value is null. Never renders "0 min" for null.
 */
export function MinutesValue({
  minutes,
  emptyLabel,
  loading,
  size = "lg",
}: {
  minutes: number | null | undefined;
  emptyLabel: string;
  loading?: boolean;
  size?: "md" | "lg";
}) {
  const rounded = roundMinutes(minutes);

  const valueClasses =
    size === "lg" ? "text-3xl" : "text-2xl";

  if (loading) {
    return (
      <p className={`${valueClasses} font-bold text-slate-950`}>
        —
      </p>
    );
  }

  if (rounded === null) {
    return (
      <p className="py-1.5 text-sm font-semibold text-slate-400">
        {emptyLabel}
      </p>
    );
  }

  return (
    <p className={`${valueClasses} font-bold tracking-tight text-slate-950`}>
      {rounded}
      <span className="ml-1 text-base font-medium text-slate-400">
        min
      </span>
    </p>
  );
}

/*
 * Compact strip for the live queue pages: today's
 * average wait by visit type, how many are waiting now,
 * and the estimate for someone walking in now.
 */
export function WaitSummaryStrip({
  summary,
  loading,
  error,
}: {
  summary: WaitTimeSummary | null;
  loading: boolean;
  error?: string;
}) {
  const walkIn = getVisitTypeSummary(summary, "walk_in");
  const scheduled = getVisitTypeSummary(summary, "scheduled");

  const waitingNow =
    (walkIn?.waitingCount ?? 0) +
    (scheduled?.waitingCount ?? 0);

  const newWalkIn = summary?.newWalkIn ?? null;

  const walkInNow = presentWalkInNow(newWalkIn);

  const unavailable = !loading && !summary;

  return (
    <div className="grid gap-4 md:grid-cols-[1.4fr_1fr_1fr]">
      {/* AVERAGE WAIT TODAY */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-slate-500">
            Average wait today
          </span>

          <Clock3 size={19} className="text-[#13B2B3]" />
        </div>

        {unavailable ? (
          <p className="mt-3 text-sm font-semibold text-slate-400">
            {error || "Wait times are unavailable right now."}
          </p>
        ) : (
          <div className="mt-3 grid grid-cols-2 gap-4">
            {([walkIn, scheduled] as const).map(
              (item, index) => {
                const visitType: VisitType =
                  index === 0 ? "walk_in" : "scheduled";

                return (
                  <div key={visitType} className="min-w-0">
                    <p className="text-xs font-semibold text-slate-500">
                      {visitTypeLabels[visitType]}
                    </p>

                    <MinutesValue
                      minutes={item?.averageWaitMinutes}
                      emptyLabel="No visits yet today"
                      loading={loading}
                    />

                    {!loading && item && item.seenCount > 0 && (
                      <p className="text-xs text-slate-400">
                        {pluralize(item.seenCount, "seen", "seen")}
                        {roundMinutes(item.medianWaitMinutes) !== null &&
                          ` · median ${roundMinutes(item.medianWaitMinutes)} min`}
                      </p>
                    )}

                    {!loading && (
                      <BaselineDelta summary={item} />
                    )}
                  </div>
                );
              },
            )}
          </div>
        )}

        <p className="mt-3 text-xs text-slate-400">
          Check-In → Consult Room
        </p>
      </div>

      {/* WAITING NOW */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-slate-500">
            Waiting now
          </span>

          <UsersRound size={19} className="text-[#13B2B3]" />
        </div>

        <p className="mt-3 text-3xl font-bold text-slate-950">
          {loading || unavailable ? "—" : waitingNow}
        </p>

        {!loading && summary && (
          <p className="mt-2 text-xs font-medium text-slate-500">
            {waitingNow === 0
              ? "No one is waiting"
              : `${walkIn?.waitingCount ?? 0} walk-in · ${scheduled?.waitingCount ?? 0} scheduled`}
          </p>
        )}

      </div>

      {/* WALK IN NOW */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-slate-500">
            If you walk in now
          </span>

          <Footprints size={19} className="text-[#13B2B3]" />
        </div>

        <div className="mt-3">
          {unavailable ? (
            <p className="py-1.5 text-sm font-semibold text-slate-400">
              Wait times are unavailable right now.
            </p>
          ) : loading || walkInNow.minutes !== null ? (
            <MinutesValue
              minutes={walkInNow.minutes}
              emptyLabel={walkInNow.headline}
              loading={loading}
            />
          ) : (
            <p
              className={`py-1.5 text-sm font-semibold ${walkInNowToneClasses[walkInNow.tone]}`}
            >
              {walkInNow.headline}
            </p>
          )}
        </div>

        {!loading && summary && walkInNow.detail && (
          <p
            className={`mt-2 text-xs font-medium ${
              walkInNow.tone === "warning"
                ? "text-amber-700"
                : "text-slate-500"
            }`}
          >
            {walkInNow.detail}
          </p>
        )}

        {!loading && summary && walkInNow.spotsLabel && (
          <p className="mt-1 text-xs font-medium text-slate-500">
            {walkInNow.spotsLabel}
          </p>
        )}

        {!loading && newWalkIn && newWalkIn.status === "open" && newWalkIn.acceptingDoctors > 0 && (
          <p className="mt-1 text-xs text-slate-400">
            {pluralize(newWalkIn.acceptingDoctors, "doctor")} seeing walk-ins
          </p>
        )}
      </div>
    </div>
  );
}
