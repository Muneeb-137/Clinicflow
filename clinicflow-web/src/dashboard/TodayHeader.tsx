import { ClipboardCheck, ListOrdered, Sparkles } from "lucide-react";

import { useAuth } from "../context/AuthContext";
import { getGreeting } from "../utils/getGreeting";
import LiveIndicator from "../components/LiveIndicator";
import { PageHeader } from "../components/ui/PageHeader";
import { ButtonLink } from "../components/ui/Button";
import {
  compareWithBaseline,
  getVisitTypeSummary,
  roundMinutes,
} from "../components/waittime/waitTimeFormat";
import type { WaitTimeSummary } from "../components/waittime/waitTimeTypes";

type TodayHeaderProps = {
  waitSummary: WaitTimeSummary | null;
  waitLoading: boolean;
};

/*
 * One sentence about today's waits, built only from real
 * numbers. A "vs usual" claim appears only when both
 * today's average and the 28-day baseline exist.
 */
function WaitInsight({ waitSummary, waitLoading }: TodayHeaderProps) {
  if (waitLoading && !waitSummary) {
    return <> Checking today's wait times.</>;
  }

  if (!waitSummary) {
    return <> Live wait times are unavailable right now.</>;
  }

  const walkIn = getVisitTypeSummary(waitSummary, "walk_in");
  const scheduled = getVisitTypeSummary(waitSummary, "scheduled");

  // Prefer the walk-in comparison; fall back to scheduled.
  const compared = [
    { label: "walk-in", summary: walkIn },
    { label: "scheduled", summary: scheduled },
  ].find((item) => compareWithBaseline(item.summary) !== null);

  if (compared) {
    const comparison = compareWithBaseline(compared.summary)!;
    const average = roundMinutes(compared.summary?.averageWaitMinutes);

    return (
      <>
        {" "}Today's average {compared.label} wait is{" "}
        <span className="font-semibold text-slate-900">{average} min</span>
        {comparison.direction === "same" ? (
          <>, about the same as the last 28 days.</>
        ) : (
          <>
            {" "}—{" "}
            <span className="font-semibold text-slate-900">
              {Math.abs(comparison.differenceMinutes)} min {comparison.direction}
            </span>{" "}
            than the 28-day average.
          </>
        )}
      </>
    );
  }

  const walkInAverage = roundMinutes(walkIn?.averageWaitMinutes);
  const scheduledAverage = roundMinutes(scheduled?.averageWaitMinutes);

  if (walkInAverage !== null || scheduledAverage !== null) {
    const parts = [
      walkInAverage !== null ? `${walkInAverage} min for walk-ins` : null,
      scheduledAverage !== null
        ? `${scheduledAverage} min for scheduled visits`
        : null,
    ].filter(Boolean);

    return (
      <>
        {" "}Today's average wait is{" "}
        <span className="font-semibold text-slate-900">
          {parts.join(" and ")}
        </span>
        .
      </>
    );
  }

  return (
    <>
      {" "}No patients have been roomed yet today — wait times will appear
      as visits begin.
    </>
  );
}

function TodayHeader({ waitSummary, waitLoading }: TodayHeaderProps) {
  const { staff } = useAuth();

  return (
    <div className="space-y-4">
      <PageHeader
        title={`${getGreeting()}${staff?.first_name ? `, ${staff.first_name}` : ""}`}
        description="Here is what is happening in your clinic today."
        actions={
          <>
            <LiveIndicator />
            <ButtonLink to="/queue/check-in" variant="secondary">
              <ClipboardCheck size={16} />
              Check in
            </ButtonLink>
            <ButtonLink to="/queue/current">
              <ListOrdered size={16} />
              Live queue
            </ButtonLink>
          </>
        }
      />

      <div
        id="clinicflow-insights"
        className="flex scroll-mt-28 items-start gap-3 rounded-card border border-brand-100 bg-brand-50/60 px-4 py-3"
      >
        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white text-brand-600 shadow-card">
          <Sparkles size={15} strokeWidth={2.2} />
        </span>

        <p className="text-sm leading-6 text-slate-600">
          <span className="font-semibold text-brand-700">
            ClinicFlow Insights:
          </span>
          <WaitInsight waitSummary={waitSummary} waitLoading={waitLoading} />
        </p>
      </div>
    </div>
  );
}

export default TodayHeader;
