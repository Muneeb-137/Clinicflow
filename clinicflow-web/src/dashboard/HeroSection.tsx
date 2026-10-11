import ClinicVideoHero from "../components/ClinicVideoHero";
import { Sparkles } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { getGreeting } from "../utils/getGreeting";
import {
  compareWithBaseline,
  getVisitTypeSummary,
  roundMinutes,
} from "../components/waittime/waitTimeFormat";
import type { WaitTimeSummary } from "../components/waittime/waitTimeTypes";

type HeroSectionProps = {
  waitSummary: WaitTimeSummary | null;
  waitLoading: boolean;
};

/*
 * One sentence about today's waits, built only from real
 * numbers. A "vs usual" claim appears only when both
 * today's average and the 28-day baseline exist.
 */
function WaitInsight({
  waitSummary,
  waitLoading,
}: HeroSectionProps) {
  if (waitLoading && !waitSummary) {
    return (
      <span className="text-slate-600">
        {" "}
        Checking today's wait times.
      </span>
    );
  }

  if (!waitSummary) {
    return (
      <span className="text-slate-600">
        {" "}
        Live wait times are unavailable right now.
      </span>
    );
  }

  const walkIn = getVisitTypeSummary(waitSummary, "walk_in");
  const scheduled = getVisitTypeSummary(waitSummary, "scheduled");

  // Prefer the walk-in comparison; fall back to scheduled.
  const candidates = [
    { label: "walk-in", summary: walkIn },
    { label: "scheduled", summary: scheduled },
  ];

  const compared = candidates.find(
    (item) => compareWithBaseline(item.summary) !== null,
  );

  if (compared) {
    const comparison = compareWithBaseline(compared.summary)!;
    const average = roundMinutes(compared.summary?.averageWaitMinutes);

    return (
      <span className="text-slate-600">
        {" "}
        Today's average {compared.label} wait is{" "}
        <span className="font-semibold text-slate-800">
          {average} min
        </span>
        {comparison.direction === "same" ? (
          <>, about the same as the last 28 days.</>
        ) : (
          <>
            {" "}—{" "}
            <span className="font-semibold text-slate-800">
              {Math.abs(comparison.differenceMinutes)} min{" "}
              {comparison.direction}
            </span>{" "}
            than the 28-day average.
          </>
        )}
      </span>
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
      <span className="text-slate-600">
        {" "}
        Today's average wait is{" "}
        <span className="font-semibold text-slate-800">
          {parts.join(" and ")}
        </span>
        .
      </span>
    );
  }

  return (
    <span className="text-slate-600">
      {" "}
      No patients have been roomed yet today — wait times will
      appear as visits begin.
    </span>
  );
}

function HeroSection({
  waitSummary,
  waitLoading,
}: HeroSectionProps) {
  const { staff } = useAuth();

const greeting = getGreeting();
  return (
    <>
      <ClinicVideoHero />

      <div>
        <h3 className="mt-1 text-[2rem] font-bold text-slate-900">
          {greeting}, {staff?.first_name}
        </h3>

        <p className="mt-1 text-slate-500">
          Here is what is happening in your clinic today.
        </p>
      </div>

      <div
  id="clinicflow-insights"
  className="scroll-mt-28 relative overflow-hidden rounded-2xl border border-[#D7F5F2] bg-gradient-to-r from-[#F8FFFE] via-white to-[#F2FCFC] px-5 py-3 shadow-sm"
>
  {/* Left accent */}
  <div className="absolute left-0 top-0 h-full w-1.5 bg-[#13B2B3]" />

  {/* Soft glow */}
  <div className="pointer-events-none absolute -left-8 top-1/2 h-24 w-24 -translate-y-1/2 rounded-full bg-[#13B2B3]/10 blur-2xl" />

  <div className="relative flex items-center gap-3">
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#13B2B3]/10 text-[#13B2B3]">
      <Sparkles
        size={16}
        strokeWidth={2.2}
      />
    </div>

    <p className="text-sm leading-6">
      <span className="font-semibold text-[#13B2B3]">
        ClinicFlow Insights:
      </span>

      <WaitInsight
        waitSummary={waitSummary}
        waitLoading={waitLoading}
      />
    </p>
  </div>
</div>
    </>
  );
}

export default HeroSection;