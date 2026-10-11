import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Info,
  LoaderCircle,
  RefreshCw,
  Timer,
  TriangleAlert,
} from "lucide-react";

import { apiFetch } from "../lib/api";
import {
  ChartCard,
  ChartEmpty,
  ColumnChart,
  DataTable,
  Legend,
  Meter,
  RankedBars,
  SERIES,
  SERIES_ORDER,
  SeriesSwatch,
  TrendChart,
  formatLongDate,
  formatShortDate,
  type ColumnDatum,
  type RankedRow,
  type SeriesValues,
  type TrendPoint,
} from "../components/analytics/charts";
import type {
  DistributionBucket,
  FlowRow,
  KpiRow,
  VisitTypeFilter,
  VisitTypeKey,
  WaitStats,
  WaitTimeAnalytics,
} from "../components/analytics/types";

type Doctor = {
  doctor_id: number;
  first_name: string;
  last_name: string;
};

type PresetId = "7" | "30" | "90" | "custom";

const PRESETS: { id: PresetId; label: string; short: string }[] = [
  { id: "7", label: "Last 7 days", short: "7 days" },
  { id: "30", label: "Last 30 days", short: "30 days" },
  { id: "90", label: "Last 90 days", short: "90 days" },
  { id: "custom", label: "Custom range", short: "Custom" },
];

const VISIT_TYPE_OPTIONS: {
  id: VisitTypeFilter;
  label: string;
}[] = [
  { id: "all", label: "All visits" },
  { id: "walk_in", label: "Walk-in" },
  { id: "scheduled", label: "Scheduled" },
];

const MAX_RANGE_DAYS = 366;

const BUCKETS: DistributionBucket[] = [
  "0-10",
  "10-20",
  "20-30",
  "30-45",
  "45-60",
  "60+",
];

const WEEKDAYS = [
  { index: 1, short: "Mon", long: "Monday" },
  { index: 2, short: "Tue", long: "Tuesday" },
  { index: 3, short: "Wed", long: "Wednesday" },
  { index: 4, short: "Thu", long: "Thursday" },
  { index: 5, short: "Fri", long: "Friday" },
  { index: 6, short: "Sat", long: "Saturday" },
  { index: 0, short: "Sun", long: "Sunday" },
];

/* ---------- formatting ---------- */

function toIsoDate(date: Date) {
  return `${date.getFullYear()}-${String(
    date.getMonth() + 1,
  ).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function daysAgo(days: number) {
  const date = new Date();

  date.setDate(date.getDate() - days);

  return toIsoDate(date);
}

function daysBetween(start: string, end: string) {
  const toUtc = (value: string) => {
    const [year, month, day] = value.split("-").map(Number);

    return Date.UTC(year, month - 1, day);
  };

  return Math.round((toUtc(end) - toUtc(start)) / 86_400_000);
}

function minutes(value: number | null | undefined) {
  return value == null ? "—" : `${value.toFixed(1)} min`;
}

function percent(value: number | null | undefined) {
  if (value == null) {
    return "—";
  }

  return `${Number.isInteger(value) ? value : value.toFixed(1)}%`;
}

function count(value: number | null | undefined) {
  return value == null ? "—" : value.toLocaleString("en-CA");
}

function rate(part: number, total: number) {
  return total > 0 ? (part / total) * 100 : null;
}

function formatHour(hour: number) {
  const suffix = hour < 12 ? "a" : "p";
  const display = hour % 12 === 0 ? 12 : hour % 12;

  return `${display}${suffix}`;
}

function formatHourLong(hour: number) {
  const format = (value: number) => {
    const suffix = value < 12 || value === 24 ? "AM" : "PM";
    const display = value % 12 === 0 ? 12 : value % 12;

    return `${display}:00 ${suffix}`;
  };

  return `${format(hour)} – ${format(hour + 1)}`;
}

function waitDetail(row: WaitStats | undefined) {
  if (!row) {
    return undefined;
  }

  return [
    `Average ${minutes(row.average_wait)}`,
    `${count(row.visits)} ${row.visits === 1 ? "visit" : "visits"}`,
  ];
}

function medianPoint(row: WaitStats | undefined) {
  return row
    ? { value: row.median_wait, detail: waitDetail(row) }
    : undefined;
}

/* Group rows by a key, then by visit type. */
function groupBy<T extends { visit_type: VisitTypeKey }>(
  rows: T[],
  keyOf: (row: T) => string,
) {
  const groups = new Map<
    string,
    Partial<Record<VisitTypeKey, T>>
  >();

  rows.forEach((row) => {
    const key = keyOf(row);
    const group = groups.get(key) ?? {};

    group[row.visit_type] = row;
    groups.set(key, group);
  });

  return groups;
}

/* ---------- small layout pieces ---------- */

function SectionHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description?: string;
}) {
  return (
    <div className="px-1 pt-4">
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#13B2B3]">
        {eyebrow}
      </p>

      <h2 className="mt-1 text-xl font-bold text-slate-950">
        {title}
      </h2>

      {description && (
        <p className="mt-1 max-w-3xl text-sm text-slate-500">
          {description}
        </p>
      )}
    </div>
  );
}

function SegmentedControl<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { id: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="flex flex-wrap rounded-xl border border-slate-200 bg-slate-50 p-1"
    >
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          aria-pressed={value === option.id}
          onClick={() => onChange(option.id)}
          className={`rounded-lg px-3 py-1.5 text-sm font-bold transition ${
            value === option.id
              ? "bg-white text-[#0b7c7d] shadow-sm ring-1 ring-slate-200"
              : "text-slate-500 hover:text-slate-800"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function FilterLabel({
  htmlFor,
  children,
}: {
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.1em] text-slate-500"
    >
      {children}
    </label>
  );
}

const inputClassName =
  "w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700 outline-none transition focus:border-[#13B2B3] focus:bg-white focus:ring-4 focus:ring-teal-100";

/* ---------- KPI tiles ---------- */

type KpiTile = {
  key: keyof Pick<
    KpiRow,
    | "median_wait"
    | "average_wait"
    | "p90_wait"
    | "pct_within_15"
    | "pct_within_30"
    | "visits"
  >;
  label: string;
  hint: string;
  kind: "minutes" | "percent" | "count";
};

const KPI_TILES: KpiTile[] = [
  {
    key: "median_wait",
    label: "Median wait",
    hint: "The typical patient's wait",
    kind: "minutes",
  },
  {
    key: "average_wait",
    label: "Average wait",
    hint: "Pulled up by a few long waits",
    kind: "minutes",
  },
  {
    key: "p90_wait",
    label: "90th percentile",
    hint: "1 in 10 patients waited longer",
    kind: "minutes",
  },
  {
    key: "pct_within_15",
    label: "Seen within 15 min",
    hint: "Share roomed in 15 minutes or less",
    kind: "percent",
  },
  {
    key: "pct_within_30",
    label: "Seen within 30 min",
    hint: "Share roomed in 30 minutes or less",
    kind: "percent",
  },
  {
    key: "visits",
    label: "Visits measured",
    hint: "Check-ins with a valid roomed time",
    kind: "count",
  },
];

function formatKpi(
  kind: KpiTile["kind"],
  value: number | null | undefined,
) {
  if (kind === "minutes") {
    return minutes(value);
  }

  if (kind === "percent") {
    return percent(value);
  }

  return count(value);
}

function KpiTileCard({
  tile,
  rows,
  series,
}: {
  tile: KpiTile;
  rows: Partial<Record<VisitTypeKey, KpiRow>>;
  series: VisitTypeKey[];
}) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-sm font-semibold text-slate-700">
        {tile.label}
      </p>

      <p className="mt-0.5 text-xs text-slate-500">
        {tile.hint}
      </p>

      <div className="mt-4 space-y-3">
        {series.map((key) => {
          const row = rows[key];
          const value = row ? row[tile.key] : null;

          return (
            <div key={key}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">
                  <SeriesSwatch series={key} />
                  {SERIES[key].label}
                </span>

                <span className="text-xl font-semibold text-slate-900">
                  {formatKpi(tile.kind, value)}
                </span>
              </div>

              {tile.kind === "percent" && (
                <div className="mt-1.5">
                  <Meter value={value} series={key} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </article>
  );
}

/* ---------- loading / empty / error ---------- */

function LoadingSkeleton() {
  return (
    <div
      className="space-y-4"
      aria-busy="true"
      aria-label="Loading wait-time analytics"
    >
      <div className="h-36 animate-pulse rounded-2xl border border-slate-200 bg-white" />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }, (_, index) => (
          <div
            key={index}
            className="h-36 animate-pulse rounded-2xl border border-slate-200 bg-white"
          />
        ))}
      </div>

      <div className="h-80 animate-pulse rounded-2xl border border-slate-200 bg-white" />
    </div>
  );
}

function StateCard({
  icon,
  title,
  children,
  action,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-slate-200 bg-white px-6 py-12 text-center shadow-sm">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">
        {icon}
      </div>

      <h3 className="mt-4 text-base font-bold text-slate-900">
        {title}
      </h3>

      <div className="mt-1 max-w-md text-sm text-slate-500">
        {children}
      </div>

      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/* ---------- page ---------- */

type LoadedResult = {
  data: WaitTimeAnalytics;
  visitType: VisitTypeFilter;
  startDate: string;
  endDate: string;
};

function WaitTimeAnalyticsPage() {
  const [preset, setPreset] = useState<PresetId>("30");
  const [customStart, setCustomStart] = useState(() =>
    daysAgo(29),
  );
  const [customEnd, setCustomEnd] = useState(() =>
    daysAgo(0),
  );
  const [visitType, setVisitType] =
    useState<VisitTypeFilter>("all");
  const [doctorId, setDoctorId] = useState("");
  const [doctors, setDoctors] = useState<Doctor[]>([]);

  const [result, setResult] = useState<LoadedResult | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const range = useMemo(() => {
    if (preset === "custom") {
      return { startDate: customStart, endDate: customEnd };
    }

    return {
      startDate: daysAgo(Number(preset) - 1),
      endDate: daysAgo(0),
    };
  }, [preset, customStart, customEnd]);

  const rangeError = useMemo(() => {
    const { startDate, endDate } = range;

    if (!startDate || !endDate) {
      return "Choose both a start and an end date.";
    }

    if (startDate > endDate) {
      return "The start date must be on or before the end date.";
    }

    if (daysBetween(startDate, endDate) + 1 > MAX_RANGE_DAYS) {
      return `Choose a range of ${MAX_RANGE_DAYS} days or fewer.`;
    }

    return null;
  }, [range]);

  useEffect(() => {
    const controller = new AbortController();

    apiFetch("/api/doctors", { signal: controller.signal })
      .then(async (response) => {
        const body = await response.json().catch(() => null);

        if (response.ok && Array.isArray(body)) {
          setDoctors(body as Doctor[]);
        }
      })
      .catch((fetchError: unknown) => {
        if (!controller.signal.aborted) {
          console.error("Unable to load doctors:", fetchError);
        }
      });

    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (rangeError) {
      return;
    }

    const controller = new AbortController();
    const { startDate, endDate } = range;
    const params = new URLSearchParams({ startDate, endDate });

    if (visitType !== "all") {
      params.set("visitType", visitType);
    }

    if (doctorId) {
      params.set("doctorId", doctorId);
    }

    setLoading(true);
    setError(null);

    apiFetch(`/api/wait-time/analytics?${params.toString()}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        const body = await response.json().catch(() => null);

        if (!response.ok) {
          throw new Error(
            body?.message ??
              "Unable to load wait-time analytics.",
          );
        }

        setResult({
          data: body as WaitTimeAnalytics,
          visitType,
          startDate,
          endDate,
        });
      })
      .catch((fetchError: unknown) => {
        if (controller.signal.aborted) {
          return;
        }

        setError(
          fetchError instanceof Error
            ? fetchError.message
            : "Unable to load wait-time analytics.",
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, [range, rangeError, visitType, doctorId, reloadKey]);

  function selectPreset(next: PresetId) {
    if (next === "custom" && preset !== "custom") {
      setCustomStart(range.startDate);
      setCustomEnd(range.endDate);
    }

    setPreset(next);
  }

  const selectedDoctor = doctors.find(
    (doctor) => String(doctor.doctor_id) === doctorId,
  );

  return (
    <section className="mx-auto w-full max-w-[1600px] space-y-3">
      <header className="rounded-3xl border border-slate-200 bg-white px-6 py-4 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#13B2B3]/10 text-[#13B2B3]">
            <Timer size={24} />
          </div>

          <div>
            <h1 className="text-2xl font-bold text-slate-950">
              Wait Time Analytics
            </h1>

            <p className="mt-1 text-sm text-slate-500">
              How long patients wait between check-in and being
              roomed, and where the delays build up.
            </p>
          </div>
        </div>
      </header>

      {/* One filter row scopes every chart on the page. */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-4 xl:flex-row xl:flex-wrap xl:items-end">
          <div>
            <FilterLabel>Date range</FilterLabel>
            <SegmentedControl
              label="Date range"
              options={PRESETS.map((option) => ({
                id: option.id,
                label: option.label,
              }))}
              value={preset}
              onChange={selectPreset}
            />
          </div>

          {preset === "custom" && (
            <div className="flex flex-wrap gap-3">
              <div className="min-w-[150px]">
                <FilterLabel htmlFor="wait-start-date">
                  From
                </FilterLabel>
                <input
                  id="wait-start-date"
                  type="date"
                  value={customStart}
                  max={customEnd || undefined}
                  onChange={(event) =>
                    setCustomStart(event.target.value)
                  }
                  className={inputClassName}
                />
              </div>

              <div className="min-w-[150px]">
                <FilterLabel htmlFor="wait-end-date">To</FilterLabel>
                <input
                  id="wait-end-date"
                  type="date"
                  value={customEnd}
                  min={customStart || undefined}
                  onChange={(event) =>
                    setCustomEnd(event.target.value)
                  }
                  className={inputClassName}
                />
              </div>
            </div>
          )}

          <div>
            <FilterLabel>Visit type</FilterLabel>
            <SegmentedControl
              label="Visit type"
              options={VISIT_TYPE_OPTIONS}
              value={visitType}
              onChange={setVisitType}
            />
          </div>

          <div className="min-w-[200px] xl:w-60">
            <FilterLabel htmlFor="wait-doctor">Doctor</FilterLabel>
            <select
              id="wait-doctor"
              value={doctorId}
              onChange={(event) => setDoctorId(event.target.value)}
              className={inputClassName}
            >
              <option value="">All doctors</option>
              {doctors.map((doctor) => (
                <option
                  key={doctor.doctor_id}
                  value={doctor.doctor_id}
                >
                  Dr. {doctor.first_name} {doctor.last_name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex min-h-[38px] items-center gap-2 text-sm text-slate-500 xl:ml-auto">
            {loading && result ? (
              <>
                <LoaderCircle
                  size={16}
                  className="animate-spin text-[#13B2B3]"
                />
                Updating…
              </>
            ) : !rangeError ? (
              <span className="font-semibold text-slate-600">
                {formatShortDate(range.startDate)} –{" "}
                {formatLongDate(range.endDate).replace(/^\w+, /, "")}
                {selectedDoctor &&
                  ` · Dr. ${selectedDoctor.last_name}`}
              </span>
            ) : null}
          </div>
        </div>

        {rangeError && (
          <p className="mt-3 flex items-center gap-2 text-sm font-semibold text-red-700">
            <TriangleAlert size={16} />
            {rangeError}
          </p>
        )}
      </div>

      {error && result && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
        >
          <span className="flex items-center gap-2">
            <TriangleAlert size={16} />
            Couldn't refresh: {error} Showing the previous
            results.
          </span>

          <button
            type="button"
            onClick={() => setReloadKey((key) => key + 1)}
            className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 font-bold text-amber-900 transition hover:bg-amber-100"
          >
            Try again
          </button>
        </div>
      )}

      {!result && loading && !rangeError && <LoadingSkeleton />}

      {!result && error && (
        <StateCard
          icon={<TriangleAlert size={22} />}
          title="Wait-time analytics couldn't load"
          action={
            <button
              type="button"
              onClick={() => setReloadKey((key) => key + 1)}
              className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 transition hover:border-[#13B2B3] hover:text-[#13B2B3]"
            >
              <RefreshCw size={16} />
              Try again
            </button>
          }
        >
          {error}
        </StateCard>
      )}

      {result && (
        <div
          className={`space-y-3 transition-opacity duration-200 ${
            loading ? "opacity-60" : "opacity-100"
          }`}
          aria-busy={loading}
        >
          <AnalyticsBody result={result} />
        </div>
      )}
    </section>
  );
}

/* ---------- the analytics themselves ---------- */

function AnalyticsBody({ result }: { result: LoadedResult }) {
  const { data } = result;

  const series: VisitTypeKey[] =
    result.visitType === "all"
      ? SERIES_ORDER
      : [result.visitType];

  const kpiByType: Partial<Record<VisitTypeKey, KpiRow>> = {};
  let overall: KpiRow | undefined;

  (data.kpis ?? []).forEach((row) => {
    if (row.visit_type === "all") {
      overall = row;
    } else {
      kpiByType[row.visit_type] = row;
    }
  });

  if (!overall && series.length === 1) {
    overall = kpiByType[series[0]];
  }

  const hasWaits = (overall?.visits ?? 0) > 0;

  const flowByType: Partial<Record<VisitTypeKey, FlowRow>> = {};

  (data.flow ?? []).forEach((row) => {
    flowByType[row.visit_type] = row;
  });

  const rangeText = `${formatShortDate(result.startDate)} – ${formatShortDate(result.endDate)}`;

  return (
    <>
      {hasWaits && overall ? (
        <>
          <HeadlineCard
            overall={overall}
            visitType={result.visitType}
          />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {KPI_TILES.map((tile) => (
              <KpiTileCard
                key={tile.key}
                tile={tile}
                rows={kpiByType}
                series={series}
              />
            ))}
          </div>

          <WaitCharts
            data={data}
            series={series}
            startDate={result.startDate}
            endDate={result.endDate}
          />
        </>
      ) : (
        <StateCard
          icon={<Timer size={22} />}
          title="No measured waits in this range"
        >
          No patients were checked in and roomed between{" "}
          {rangeText} for these filters. Try a longer date
          range, another visit type or all doctors.
        </StateCard>
      )}

      <FlowSection
        flowByType={flowByType}
        series={series}
        definitions={data.definitions}
      />

      <ConsultAccuracySection data={data} />

      <Definitions data={data} />
    </>
  );
}

function HeadlineCard({
  overall,
  visitType,
}: {
  overall: KpiRow;
  visitType: VisitTypeFilter;
}) {
  const median = overall.median_wait;
  const average = overall.average_wait;
  const skewed =
    median != null &&
    average != null &&
    average - median >= 3 &&
    average > median * 1.5;

  const scope =
    visitType === "all"
      ? "all visits"
      : `${SERIES[visitType].label.toLowerCase()} visits`;

  return (
    <article className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-600">
            Median wait, {scope}
          </p>

          <p className="mt-1 text-5xl font-semibold text-slate-950">
            {median == null ? "—" : median.toFixed(1)}
            <span className="ml-1.5 text-xl font-semibold text-slate-500">
              min
            </span>
          </p>

          <p className="mt-2 text-sm text-slate-500">
            Average {minutes(average)} · 90th percentile{" "}
            {minutes(overall.p90_wait)} · longest{" "}
            {minutes(overall.max_wait)} · {count(overall.visits)}{" "}
            {overall.visits === 1 ? "visit" : "visits"}
          </p>
        </div>

        <div className="flex max-w-xl gap-3 rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
          <Info
            size={18}
            className="mt-0.5 shrink-0 text-[#13B2B3]"
          />

          <p>
            {skewed && median != null && average != null ? (
              <>
                The average is{" "}
                <strong className="text-slate-900">
                  {median > 0
                    ? `${(average / median).toFixed(1)}×`
                    : "well above"}
                </strong>{" "}
                the median: a small number of very long waits pull
                it up. This page leads with the median (the
                typical patient's wait) and shows the average
                second.
              </>
            ) : (
              <>
                This page leads with the median, the typical
                patient's wait, because a handful of very long
                waits can pull the average up. The average is
                shown alongside it.
              </>
            )}
          </p>
        </div>
      </div>
    </article>
  );
}

function WaitCharts({
  data,
  series,
  startDate,
  endDate,
}: {
  data: WaitTimeAnalytics;
  series: VisitTypeKey[];
  startDate: string;
  endDate: string;
}) {
  const legend = <Legend series={series} />;
  const lineLegend = <Legend series={series} shape="line" />;

  /* Daily trend */
  const dailyGroups = groupBy(data.daily ?? [], (row) =>
    row.date.slice(0, 10),
  );
  const trendPoints: TrendPoint[] = [...dailyGroups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, group]) => {
      const values: SeriesValues = {};

      series.forEach((key) => {
        values[key] = medianPoint(group[key]);
      });

      return { date, values };
    })
    .filter((point) =>
      series.some((key) => point.values[key]?.value != null),
    );

  /* By hour: span the hours that have data. */
  const hourGroups = groupBy(data.byHour ?? [], (row) =>
    String(row.hour),
  );
  const hours = [...hourGroups.keys()].map(Number);
  const hourData: ColumnDatum[] = [];

  if (hours.length) {
    for (
      let hour = Math.min(...hours);
      hour <= Math.max(...hours);
      hour += 1
    ) {
      const group = hourGroups.get(String(hour)) ?? {};
      const values: SeriesValues = {};

      series.forEach((key) => {
        values[key] = medianPoint(group[key]);
      });

      hourData.push({
        key: String(hour),
        label: formatHour(hour),
        title: `Checked in ${formatHourLong(hour)}`,
        values,
      });
    }
  }

  /* By weekday, Monday first. */
  const weekdayGroups = groupBy(data.byWeekday ?? [], (row) =>
    String(row.weekday),
  );
  const weekdayData: ColumnDatum[] = WEEKDAYS.map((day) => {
    const group = weekdayGroups.get(String(day.index)) ?? {};
    const values: SeriesValues = {};

    series.forEach((key) => {
      values[key] = medianPoint(group[key]);
    });

    return {
      key: day.short,
      label: day.short,
      title: day.long,
      values,
    };
  });

  /* Distribution as a share of each visit type's visits. */
  const totals: Partial<Record<VisitTypeKey, number>> = {};

  (data.distribution ?? []).forEach((row) => {
    totals[row.visit_type] =
      (totals[row.visit_type] ?? 0) + row.visits;
  });

  const distributionGroups = groupBy(
    data.distribution ?? [],
    (row) => row.bucket,
  );
  const distributionData: ColumnDatum[] = BUCKETS.map((bucket) => {
    const group = distributionGroups.get(bucket) ?? {};
    const values: SeriesValues = {};

    series.forEach((key) => {
      const visits = group[key]?.visits ?? 0;
      const total = totals[key] ?? 0;

      values[key] =
        total > 0
          ? {
              value: (visits / total) * 100,
              detail: [
                `${visits} of ${total} visits`,
              ],
            }
          : undefined;
    });

    return {
      key: bucket,
      label: bucket === "60+" ? "60+" : bucket,
      title:
        bucket === "60+"
          ? "Waited 60 minutes or more"
          : `Waited ${bucket.replace("-", "–")} minutes`,
      values,
    };
  });

  /* Ranked: doctors and appointment types. */
  function rankedRows<T extends WaitStats>(
    rows: T[],
    keyOf: (row: T) => string,
    labelOf: (row: T) => string,
  ): RankedRow[] {
    const groups = groupBy(rows, keyOf);
    const labels = new Map<string, string>();

    rows.forEach((row) => labels.set(keyOf(row), labelOf(row)));

    return [...groups.entries()]
      .map(([key, group]) => {
        const values: SeriesValues = {};
        const meta: Partial<Record<VisitTypeKey, string>> = {};

        series.forEach((type) => {
          const row = group[type];

          if (row) {
            values[type] = medianPoint(row);
            meta[type] = `n=${row.visits}`;
          }
        });

        return {
          key,
          label: labels.get(key) ?? key,
          values,
          meta,
        };
      })
      .filter((row) =>
        series.some((type) => row.values[type]?.value != null),
      )
      .sort((a, b) => {
        const top = (row: RankedRow) =>
          Math.max(
            ...series.map((type) => row.values[type]?.value ?? -1),
          );

        return top(b) - top(a);
      });
  }

  const doctorRows = rankedRows(
    data.byDoctor ?? [],
    (row) => String(row.doctor_id),
    (row) => `Dr. ${row.doctor_name}`,
  );

  const appointmentRows = rankedRows(
    data.byAppointmentType ?? [],
    (row) => row.appointment_type,
    (row) => row.appointment_type,
  );

  /* Shared table builders. */
  const seriesColumns = series.flatMap((key) => [
    {
      key: `${key}_median`,
      label: `${SERIES[key].label} median`,
      align: "right" as const,
    },
    {
      key: `${key}_average`,
      label: `${SERIES[key].label} average`,
      align: "right" as const,
    },
    {
      key: `${key}_visits`,
      label: `${SERIES[key].label} visits`,
      align: "right" as const,
    },
  ]);

  function statCells(
    group: Partial<Record<VisitTypeKey, WaitStats>>,
  ) {
    const cells: Record<string, ReactNode> = {};

    series.forEach((key) => {
      const row = group[key];

      cells[`${key}_median`] = minutes(row?.median_wait);
      cells[`${key}_average`] = minutes(row?.average_wait);
      cells[`${key}_visits`] = count(row?.visits ?? 0);
    });

    return cells;
  }

  const rankedTable = (
    rows: RankedRow[],
    groups: Map<string, Partial<Record<VisitTypeKey, WaitStats>>>,
    label: string,
  ) => (
    <DataTable
      caption={label}
      columns={[{ key: "label", label }, ...seriesColumns]}
      rows={rows.map((row) => ({
        label: row.label,
        ...statCells(groups.get(row.key) ?? {}),
      }))}
    />
  );

  return (
    <>
      <SectionHeading
        eyebrow="Patterns"
        title="When and where waits build up"
        description="Charts show the median wait (check-in to roomed). Hover or focus a chart for the average and visit count, or switch to the table view."
      />

      <ChartCard
        title="Daily median wait"
        subtitle="Minutes from check-in to roomed, by day"
        legend={lineLegend}
        table={
          <DataTable
            caption="Daily median wait"
            columns={[
              { key: "date", label: "Date" },
              ...seriesColumns,
            ]}
            rows={trendPoints.map((point) => ({
              date: formatLongDate(point.date),
              ...statCells(dailyGroups.get(point.date) ?? {}),
            }))}
          />
        }
      >
        {trendPoints.length ? (
          <TrendChart
            points={trendPoints}
            series={series}
            startDate={startDate}
            endDate={endDate}
            formatValue={minutes}
            ariaLabel="Daily median wait in minutes"
          />
        ) : (
          <ChartEmpty message="No daily wait data in this range." />
        )}
      </ChartCard>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <ChartCard
          title="By hour of check-in"
          subtitle="Median wait in minutes, clinic local time"
          legend={legend}
          table={
            <DataTable
              caption="Median wait by hour"
              columns={[
                { key: "hour", label: "Hour" },
                ...seriesColumns,
              ]}
              rows={hourData.map((datum) => ({
                hour: formatHourLong(Number(datum.key)),
                ...statCells(hourGroups.get(datum.key) ?? {}),
              }))}
            />
          }
        >
          {hourData.length ? (
            <ColumnChart
              data={hourData}
              series={series}
              formatValue={minutes}
              ariaLabel="Median wait by hour of check-in"
            />
          ) : (
            <ChartEmpty message="No check-ins in this range." />
          )}
        </ChartCard>

        <ChartCard
          title="By day of week"
          subtitle="Median wait in minutes"
          legend={legend}
          table={
            <DataTable
              caption="Median wait by weekday"
              columns={[
                { key: "day", label: "Day" },
                ...seriesColumns,
              ]}
              rows={WEEKDAYS.map((day) => ({
                day: day.long,
                ...statCells(
                  weekdayGroups.get(String(day.index)) ?? {},
                ),
              }))}
            />
          }
        >
          <ColumnChart
            data={weekdayData}
            series={series}
            formatValue={minutes}
            ariaLabel="Median wait by day of week"
          />
        </ChartCard>

        <ChartCard
          title="How long patients waited"
          subtitle="Share of each visit type's patients in each wait band (minutes)"
          legend={legend}
          table={
            <DataTable
              caption="Wait distribution"
              columns={[
                { key: "bucket", label: "Wait (min)" },
                ...series.flatMap((key) => [
                  {
                    key: `${key}_visits`,
                    label: `${SERIES[key].label} visits`,
                    align: "right" as const,
                  },
                  {
                    key: `${key}_share`,
                    label: `${SERIES[key].label} share`,
                    align: "right" as const,
                  },
                ]),
              ]}
              rows={BUCKETS.map((bucket) => {
                const group = distributionGroups.get(bucket) ?? {};
                const cells: Record<string, ReactNode> = {
                  bucket,
                };

                series.forEach((key) => {
                  const visits = group[key]?.visits ?? 0;

                  cells[`${key}_visits`] = count(visits);
                  cells[`${key}_share`] = percent(
                    rate(visits, totals[key] ?? 0),
                  );
                });

                return cells;
              })}
            />
          }
        >
          <ColumnChart
            data={distributionData}
            series={series}
            formatValue={(value) => `${Math.round(value)}%`}
            ariaLabel="Share of patients by wait band"
          />
        </ChartCard>

        <ChartCard
          title="By appointment type"
          subtitle="Median wait, longest first"
          legend={legend}
          table={rankedTable(
            appointmentRows,
            groupBy(
              data.byAppointmentType ?? [],
              (row) => row.appointment_type,
            ),
            "Appointment type",
          )}
        >
          {appointmentRows.length ? (
            <RankedBars
              rows={appointmentRows}
              series={series}
              formatValue={minutes}
            />
          ) : (
            <ChartEmpty message="No appointment types in this range." />
          )}
        </ChartCard>
      </div>

      <ChartCard
        title="By doctor"
        subtitle="Median wait, longest first. Small visit counts (n) swing easily."
        legend={legend}
        table={rankedTable(
          doctorRows,
          groupBy(data.byDoctor ?? [], (row) =>
            String(row.doctor_id),
          ),
          "Doctor",
        )}
      >
        {doctorRows.length ? (
          <RankedBars
            rows={doctorRows}
            series={series}
            formatValue={minutes}
          />
        ) : (
          <ChartEmpty message="No visits were assigned to a doctor in this range." />
        )}
      </ChartCard>
    </>
  );
}

/* ---------- flow ---------- */

function FlowStat({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-slate-100 py-2.5 last:border-b-0">
      <span className="text-sm text-slate-600">{label}</span>

      <span className="text-right">
        <span className="text-lg font-semibold text-slate-900">
          {value}
        </span>

        {detail && (
          <span className="ml-1.5 text-xs text-slate-500">
            {detail}
          </span>
        )}
      </span>
    </div>
  );
}

function FlowSection({
  flowByType,
  series,
  definitions,
}: {
  flowByType: Partial<Record<VisitTypeKey, FlowRow>>;
  series: VisitTypeKey[];
  definitions: WaitTimeAnalytics["definitions"];
}) {
  const walkIn = flowByType.walk_in;
  const scheduled = flowByType.scheduled;
  const showWalkIn = series.includes("walk_in");
  const showScheduled = series.includes("scheduled");

  return (
    <>
      <SectionHeading
        eyebrow="Patient flow"
        title="Front desk, drop-off and punctuality"
        description="Counted over every visit in the range, including patients who were never roomed."
      />

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {showWalkIn && (
          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="flex items-center gap-2 text-base font-bold text-slate-950">
              <SeriesSwatch series="walk_in" />
              Walk-in intake
            </h3>

            <p className="mt-0.5 text-sm text-slate-500">
              {definitions.arrivalToCheckin ??
                "Walk-in arrival to check-in."}
            </p>

            <div className="mt-3">
              <FlowStat
                label="Arrival → check-in (avg)"
                value={minutes(walkIn?.average_arrival_to_checkin)}
              />
              <FlowStat
                label="Arrival → roomed (avg)"
                value={minutes(walkIn?.average_arrival_to_room)}
              />
              <FlowStat
                label="Walk-in visits"
                value={count(walkIn?.total_visits ?? 0)}
              />
            </div>
          </article>
        )}

        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-base font-bold text-slate-950">
            Left or didn't arrive
          </h3>

          <p className="mt-0.5 text-sm text-slate-500">
            Counts and share of all visits of that type.
          </p>

          <div className="mt-3 space-y-3">
            {series.map((key) => {
              const row = flowByType[key];
              const total = row?.total_visits ?? 0;

              return (
                <div key={key}>
                  <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.08em] text-slate-500">
                    <SeriesSwatch series={key} />
                    {SERIES[key].label} · {count(total)} visits
                  </p>

                  <FlowStat
                    label="Left without being seen"
                    value={count(row?.left_without_being_seen ?? 0)}
                    detail={percent(
                      rate(row?.left_without_being_seen ?? 0, total),
                    )}
                  />
                  <FlowStat
                    label="No-shows"
                    value={count(row?.no_shows ?? 0)}
                    detail={percent(rate(row?.no_shows ?? 0, total))}
                  />
                </div>
              );
            })}
          </div>
        </article>

        {showScheduled && (
          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="flex items-center gap-2 text-base font-bold text-slate-950">
              <SeriesSwatch series="scheduled" />
              Scheduled punctuality
            </h3>

            <p className="mt-0.5 text-sm text-slate-500">
              {definitions.scheduledDelay ??
                "Roomed time compared with the booked appointment time."}
            </p>

            <div className="mt-4">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm text-slate-600">
                  Roomed within 10 min of appointment
                </span>

                <span className="text-2xl font-semibold text-slate-900">
                  {percent(
                    scheduled?.pct_seen_within_10_of_appointment,
                  )}
                </span>
              </div>

              <div className="mt-2">
                <Meter
                  value={
                    scheduled?.pct_seen_within_10_of_appointment ??
                    null
                  }
                  series="scheduled"
                />
              </div>
            </div>

            <div className="mt-3">
              <FlowStat
                label="Average delay past appointment (early = 0)"
                value={minutes(
                  scheduled?.average_delay_past_appointment,
                )}
              />
              <FlowStat
                label="Scheduled visits"
                value={count(scheduled?.total_visits ?? 0)}
              />
            </div>
          </article>
        )}
      </div>
    </>
  );
}

/* ---------- consult length accuracy ---------- */

function ConsultAccuracySection({
  data,
}: {
  data: WaitTimeAnalytics;
}) {
  const rows = data.consultAccuracy ?? [];

  const hasAnyVisits = rows.some(
    (row) => (row.visits ?? 0) > 0,
  );

  // Median actual length, or a muted "no visits" label.
  const actualCell = (
    value: number | null | undefined,
    visitCount: number | undefined,
  ) =>
    value != null ? (
      <span>
        {minutes(value)}
        {visitCount != null && (
          <span className="ml-1 text-xs text-slate-400">
            (n={visitCount})
          </span>
        )}
      </span>
    ) : (
      <span className="text-slate-400">—</span>
    );

  return (
    <>
      <SectionHeading
        eyebrow="Scheduling"
        title="Consult length accuracy"
        description="Booked length for every appointment type compared with how long consults actually took, for walk-ins and scheduled visits. Consistent overruns push every later patient's wait up."
      />

      <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        {rows.length === 0 ? (
          <div className="flex flex-col items-center px-4 py-8 text-center">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">
              <Timer size={20} />
            </div>

            <p className="mt-3 text-sm font-bold text-slate-900">
              No appointment types set up
            </p>
          </div>
        ) : (
          <>
            <DataTable
              caption="Consult length accuracy"
              columns={[
                { key: "type", label: "Appointment type" },
                { key: "booked", label: "Booked", align: "right" },
                {
                  key: "actual",
                  label: "Median actual",
                  align: "right",
                },
                {
                  key: "walkIn",
                  label: "Walk-in",
                  align: "right",
                },
                {
                  key: "scheduled",
                  label: "Scheduled",
                  align: "right",
                },
                {
                  key: "difference",
                  label: "Difference",
                  align: "right",
                },
                { key: "visits", label: "Visits", align: "right" },
              ]}
              rows={rows.map((row) => {
                const difference =
                  row.booked_minutes != null &&
                  row.median_actual_minutes != null
                    ? row.median_actual_minutes - row.booked_minutes
                    : null;

                return {
                  type: row.appointment_type,
                  booked: minutes(row.booked_minutes),
                  actual:
                    row.median_actual_minutes != null ? (
                      minutes(row.median_actual_minutes)
                    ) : (
                      <span className="text-slate-400">
                        No visits yet
                      </span>
                    ),
                  walkIn: actualCell(
                    row.walk_in_median_minutes,
                    row.walk_in_visits,
                  ),
                  scheduled: actualCell(
                    row.scheduled_median_minutes,
                    row.scheduled_visits,
                  ),
                  difference:
                    difference == null ? (
                      <span className="text-slate-400">—</span>
                    ) : Math.abs(difference) < 0.05 ? (
                      "On time"
                    ) : (
                      <span
                        className={
                          difference > 0
                            ? "font-semibold text-slate-900"
                            : "text-slate-600"
                        }
                      >
                        {difference > 0 ? "+" : "−"}
                        {Math.abs(difference).toFixed(1)} min{" "}
                        {difference > 0 ? "over" : "under"}
                      </span>
                    ),
                  visits: count(row.visits),
                };
              })}
            />

            <p className="mt-3 text-xs text-slate-500">
              {hasAnyVisits
                ? "Types with no visits show their configured length. "
                : "No completed consults with an end time in this period yet. "}
              Consult end times are recorded when doctors click{" "}
              <strong>Complete Visit</strong>; very short (under 2
              min) or very long (over 3x booked) consults are left
              out as data errors.
            </p>
          </>
        )}
      </article>
    </>
  );
}

/* ---------- definitions ---------- */

function Definitions({ data }: { data: WaitTimeAnalytics }) {
  const { definitions } = data;

  const items = [
    { term: "Wait", text: definitions.wait },
    {
      term: "Arrival to check-in",
      text: definitions.arrivalToCheckin,
    },
    {
      term: "Scheduled delay",
      text: definitions.scheduledDelay,
    },
    { term: "Excluded", text: definitions.excluded },
    {
      term: "Median vs average",
      text: "The median is the middle wait: half of patients waited less. The average adds every minute together, so a few very long waits raise it.",
    },
  ].filter((item) => item.text);

  return (
    <aside className="rounded-2xl border border-slate-200 bg-slate-50/70 p-5">
      <h3 className="flex items-center gap-2 text-sm font-bold text-slate-800">
        <Info size={16} className="text-[#13B2B3]" />
        How these are measured
      </h3>

      <dl className="mt-3 grid grid-cols-1 gap-x-8 gap-y-2 text-sm md:grid-cols-2">
        {items.map((item) => (
          <div key={item.term}>
            <dt className="inline font-semibold text-slate-700">
              {item.term}:
            </dt>{" "}
            <dd className="inline text-slate-500">{item.text}</dd>
          </div>
        ))}
      </dl>
    </aside>
  );
}

export default WaitTimeAnalyticsPage;
