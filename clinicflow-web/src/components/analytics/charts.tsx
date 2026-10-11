import {
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from "react";

import type { VisitTypeKey } from "./types";

/*
 * Lightweight inline-SVG / HTML charts for the analytics
 * pages. No charting library: every chart here is a few
 * marks on a shared scale, so plain SVG keeps the bundle
 * small and the look in line with the rest of the app.
 *
 * Series colours were checked with the dataviz palette
 * validator against the white card surface (lightness
 * band, chroma floor, colour-blind separation, >= 3:1
 * contrast). Colour always follows the visit type, never
 * its position, so filtering never repaints a series.
 */
export const SERIES: Record<
  VisitTypeKey,
  { label: string; color: string; track: string }
> = {
  scheduled: {
    label: "Scheduled",
    color: "#0f9a9b",
    track: "#d5eff0",
  },
  walk_in: {
    label: "Walk-in",
    color: "#e8622c",
    track: "#fbe0d4",
  },
};

export const SERIES_ORDER: VisitTypeKey[] = [
  "scheduled",
  "walk_in",
];

/* Chart chrome: recessive hairlines, text in slate inks. */
const GRID = "#eef2f6";
const BASELINE = "#cbd5e1";
const TICK_TEXT = "#64748b";
const SURFACE = "#ffffff";

export type SeriesPoint = {
  value: number | null;
  detail?: string[];
};

export type SeriesValues = Partial<
  Record<VisitTypeKey, SeriesPoint>
>;

/* ---------- helpers ---------- */

export function useElementWidth<
  T extends HTMLElement,
>() {
  const ref = useRef<T | null>(null);
  const [width, setWidth] = useState(0);

  useLayoutEffect(() => {
    const element = ref.current;

    if (!element) {
      return;
    }

    setWidth(element.clientWidth);

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];

      if (entry) {
        setWidth(Math.floor(entry.contentRect.width));
      }
    });

    observer.observe(element);

    return () => observer.disconnect();
  }, []);

  return [ref, width] as const;
}

export function niceScale(
  maxValue: number,
  tickCount = 4,
): { max: number; ticks: number[] } {
  if (!(maxValue > 0)) {
    return { max: 10, ticks: [0, 5, 10] };
  }

  const raw = maxValue / tickCount;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const normalized = raw / magnitude;

  const step =
    (normalized <= 1
      ? 1
      : normalized <= 2
        ? 2
        : normalized <= 2.5
          ? 2.5
          : normalized <= 5
            ? 5
            : 10) * magnitude;

  const max = Math.ceil(maxValue / step - 1e-9) * step;
  const ticks: number[] = [];

  for (let tick = 0; tick <= max + step / 2; tick += step) {
    ticks.push(Number(tick.toFixed(6)));
  }

  return { max, ticks };
}

function formatTick(value: number) {
  return Number.isInteger(value)
    ? value.toLocaleString("en-CA")
    : value.toFixed(1);
}

/* Bar with a 4px rounded data-end, square at the baseline. */
function columnPath(
  x: number,
  y: number,
  width: number,
  height: number,
) {
  const radius = Math.min(4, width / 2, height);

  return [
    `M${x},${y + height}`,
    `V${y + radius}`,
    `Q${x},${y} ${x + radius},${y}`,
    `H${x + width - radius}`,
    `Q${x + width},${y} ${x + width},${y + radius}`,
    `V${y + height}`,
    "Z",
  ].join(" ");
}

/* ---------- small shared pieces ---------- */

export function SeriesSwatch({
  series,
  shape = "dot",
}: {
  series: VisitTypeKey;
  shape?: "dot" | "line";
}) {
  return (
    <span
      aria-hidden="true"
      className={
        shape === "line"
          ? "inline-block h-[3px] w-4 shrink-0 rounded-full"
          : "inline-block h-2.5 w-2.5 shrink-0 rounded-full"
      }
      style={{ backgroundColor: SERIES[series].color }}
    />
  );
}

export function Legend({
  series,
  shape = "dot",
}: {
  series: VisitTypeKey[];
  shape?: "dot" | "line";
}) {
  if (series.length < 2) {
    return null;
  }

  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-semibold text-slate-600">
      {series.map((key) => (
        <li key={key} className="flex items-center gap-1.5">
          <SeriesSwatch series={key} shape={shape} />
          {SERIES[key].label}
        </li>
      ))}
    </ul>
  );
}

export type TooltipRow = {
  series?: VisitTypeKey;
  label: string;
  value: string;
  detail?: string[];
};

function ChartTooltip({
  x,
  width,
  title,
  rows,
}: {
  x: number;
  width: number;
  title: string;
  rows: TooltipRow[];
}) {
  const flip = x > width / 2;

  return (
    <div
      role="status"
      className="pointer-events-none absolute top-1 z-10 min-w-[170px] max-w-[240px] rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs shadow-lg"
      style={{
        left: flip ? x - 12 : x + 12,
        transform: flip ? "translateX(-100%)" : undefined,
      }}
    >
      <p className="font-bold text-slate-900">{title}</p>

      <div className="mt-1.5 space-y-1.5">
        {rows.map((row) => (
          <div key={row.label}>
            <div className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-1.5 text-slate-600">
                {row.series && (
                  <SeriesSwatch series={row.series} />
                )}
                {row.label}
              </span>

              <span className="font-bold tabular-nums text-slate-900">
                {row.value}
              </span>
            </div>

            {row.detail?.map((line) => (
              <p
                key={line}
                className="pl-4 text-[11px] text-slate-500"
              >
                {line}
              </p>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/* Arrow-key navigation shared by the SVG charts. */
function useKeyboardIndex(count: number) {
  const [active, setActive] = useState<number | null>(
    null,
  );

  function onKeyDown(event: KeyboardEvent) {
    if (count === 0) {
      return;
    }

    if (event.key === "ArrowRight") {
      event.preventDefault();
      setActive((current) =>
        current === null
          ? 0
          : Math.min(count - 1, current + 1),
      );
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      setActive((current) =>
        current === null
          ? count - 1
          : Math.max(0, current - 1),
      );
    } else if (event.key === "Escape") {
      setActive(null);
    }
  }

  return {
    active,
    setActive,
    keyboardProps: {
      tabIndex: 0,
      onKeyDown,
      onFocus: () => setActive((current) => current ?? 0),
      onBlur: () => setActive(null),
    },
  };
}

/* ---------- chart card with a chart / table toggle ---------- */

export type TableColumn = {
  key: string;
  label: string;
  align?: "left" | "right";
};

export function DataTable({
  columns,
  rows,
  caption,
}: {
  columns: TableColumn[];
  rows: Record<string, ReactNode>[];
  caption?: string;
}) {
  return (
    <div className="max-h-[340px] overflow-auto rounded-xl border border-slate-100">
      <table className="w-full text-sm">
        {caption && <caption className="sr-only">{caption}</caption>}

        <thead className="sticky top-0 bg-slate-50 text-[11px] font-bold uppercase tracking-[0.08em] text-slate-500">
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={`whitespace-nowrap px-3 py-2 ${
                  column.align === "right"
                    ? "text-right"
                    : "text-left"
                }`}
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>

        <tbody className="divide-y divide-slate-100">
          {rows.map((row, index) => (
            <tr key={index}>
              {columns.map((column) => (
                <td
                  key={column.key}
                  className={`whitespace-nowrap px-3 py-2 text-slate-700 ${
                    column.align === "right"
                      ? "text-right tabular-nums"
                      : "text-left"
                  }`}
                >
                  {row[column.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ChartCard({
  title,
  subtitle,
  legend,
  table,
  children,
  className = "",
}: {
  title: string;
  subtitle?: string;
  legend?: ReactNode;
  table?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const [view, setView] = useState<"chart" | "table">(
    "chart",
  );

  return (
    <article
      className={`min-w-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm ${className}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base font-bold text-slate-950">
            {title}
          </h3>

          {subtitle && (
            <p className="mt-0.5 text-sm text-slate-500">
              {subtitle}
            </p>
          )}
        </div>

        {table && (
          <div
            role="group"
            aria-label={`${title} view`}
            className="flex shrink-0 rounded-lg bg-slate-100 p-0.5 text-xs font-bold"
          >
            {(["chart", "table"] as const).map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={view === option}
                onClick={() => setView(option)}
                className={`rounded-md px-2.5 py-1 capitalize transition ${
                  view === option
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                {option}
              </button>
            ))}
          </div>
        )}
      </div>

      {legend && view === "chart" && (
        <div className="mt-3">{legend}</div>
      )}

      <div className="mt-4">
        {view === "table" && table ? table : children}
      </div>
    </article>
  );
}

export function ChartEmpty({
  message,
}: {
  message: string;
}) {
  return (
    <div className="flex h-[200px] items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-6 text-center text-sm text-slate-500">
      {message}
    </div>
  );
}

/* ---------- grouped column chart ---------- */

export type ColumnDatum = {
  key: string;
  label: string;
  title: string;
  values: SeriesValues;
};

export function ColumnChart({
  data,
  series,
  formatValue,
  ariaLabel,
  height = 220,
}: {
  data: ColumnDatum[];
  series: VisitTypeKey[];
  formatValue: (value: number) => string;
  ariaLabel: string;
  height?: number;
}) {
  const [containerRef, width] =
    useElementWidth<HTMLDivElement>();
  const { active, setActive, keyboardProps } =
    useKeyboardIndex(data.length);

  const margin = { top: 18, right: 8, bottom: 26, left: 40 };
  const plotWidth = Math.max(0, width - margin.left - margin.right);
  const plotHeight = height - margin.top - margin.bottom;

  let maxValue = 0;

  data.forEach((datum) =>
    series.forEach((key) => {
      const value = datum.values[key]?.value;

      if (value != null && value > maxValue) {
        maxValue = value;
      }
    }),
  );

  const scale = niceScale(maxValue);
  const band = data.length ? plotWidth / data.length : 0;
  const gap = 2;
  const barWidth = Math.max(
    2,
    Math.min(
      24,
      (band * 0.72 - gap * (series.length - 1)) /
        series.length,
    ),
  );
  const groupWidth =
    barWidth * series.length + gap * (series.length - 1);

  const y = (value: number) =>
    margin.top + plotHeight - (value / scale.max) * plotHeight;

  const labelStep = Math.max(
    1,
    Math.ceil(data.length / Math.max(1, Math.floor(plotWidth / 34))),
  );

  /* Direct-label only each series' peak, never every bar. */
  const peaks = new Map<string, number>();

  series.forEach((key) => {
    let best = -1;
    let bestValue = -Infinity;

    data.forEach((datum, index) => {
      const value = datum.values[key]?.value;

      if (value != null && value > bestValue) {
        bestValue = value;
        best = index;
      }
    });

    if (best >= 0) {
      const id = `${best}`;
      const existing = peaks.get(id);

      /* Two peaks in one group would collide: keep the taller. */
      if (existing === undefined || bestValue > existing) {
        peaks.set(id, bestValue);
      }
    }
  });

  const activeDatum = active !== null ? data[active] : null;

  return (
    <div
      ref={containerRef}
      className="relative w-full rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-[#13B2B3]/40"
      style={{ height }}
      aria-label={`${ariaLabel}. Use left and right arrow keys to read values.`}
      role="group"
      {...keyboardProps}
      onMouseLeave={() => setActive(null)}
    >
      {width > 0 && (
        <svg
          width={width}
          height={height}
          className="block"
          aria-hidden="true"
        >
          {scale.ticks.map((tick) => (
            <g key={tick}>
              <line
                x1={margin.left}
                x2={width - margin.right}
                y1={y(tick)}
                y2={y(tick)}
                stroke={tick === 0 ? BASELINE : GRID}
                strokeWidth={1}
                shapeRendering="crispEdges"
              />

              <text
                x={margin.left - 8}
                y={y(tick)}
                dy="0.32em"
                textAnchor="end"
                fontSize={11}
                fill={TICK_TEXT}
                className="tabular-nums"
              >
                {formatTick(tick)}
              </text>
            </g>
          ))}

          {data.map((datum, index) => {
            const bandX = margin.left + index * band;
            const groupX = bandX + (band - groupWidth) / 2;
            const isActive = active === index;

            return (
              <g key={datum.key}>
                {isActive && (
                  <rect
                    x={bandX}
                    y={margin.top}
                    width={band}
                    height={plotHeight}
                    fill="#f1f5f9"
                    opacity={0.7}
                  />
                )}

                {series.map((key, seriesIndex) => {
                  const value = datum.values[key]?.value;

                  if (value == null || value <= 0) {
                    return null;
                  }

                  const top = y(value);

                  return (
                    <path
                      key={key}
                      d={columnPath(
                        groupX + seriesIndex * (barWidth + gap),
                        top,
                        barWidth,
                        margin.top + plotHeight - top,
                      )}
                      fill={SERIES[key].color}
                      opacity={
                        active === null || isActive ? 1 : 0.45
                      }
                    />
                  );
                })}

                {peaks.has(`${index}`) && (
                  <text
                    x={bandX + band / 2}
                    y={y(peaks.get(`${index}`) ?? 0) - 6}
                    textAnchor="middle"
                    fontSize={11}
                    fontWeight={600}
                    fill="#334155"
                  >
                    {formatValue(peaks.get(`${index}`) ?? 0)}
                  </text>
                )}

                {index % labelStep === 0 && (
                  <text
                    x={bandX + band / 2}
                    y={height - 8}
                    textAnchor="middle"
                    fontSize={11}
                    fill={TICK_TEXT}
                  >
                    {datum.label}
                  </text>
                )}

                {/* Hit target: the whole band, taller than the bar. */}
                <rect
                  x={bandX}
                  y={margin.top}
                  width={band}
                  height={plotHeight}
                  fill="transparent"
                  onMouseEnter={() => setActive(index)}
                />
              </g>
            );
          })}
        </svg>
      )}

      {activeDatum && active !== null && (
        <ChartTooltip
          x={margin.left + active * band + band / 2}
          width={width}
          title={activeDatum.title}
          rows={series.map((key) => {
            const point = activeDatum.values[key];

            return {
              series: series.length > 1 ? key : undefined,
              label: SERIES[key].label,
              value:
                point?.value != null
                  ? formatValue(point.value)
                  : "No data",
              detail: point?.detail,
            };
          })}
        />
      )}
    </div>
  );
}

/* ---------- daily trend line chart ---------- */

export type TrendPoint = {
  date: string;
  values: SeriesValues;
};

function parseDate(value: string) {
  const [year, month, day] = value
    .slice(0, 10)
    .split("-")
    .map(Number);

  return new Date(year, (month ?? 1) - 1, day ?? 1);
}

function dayIndex(start: Date, value: Date) {
  return Math.round(
    (Date.UTC(
      value.getFullYear(),
      value.getMonth(),
      value.getDate(),
    ) -
      Date.UTC(
        start.getFullYear(),
        start.getMonth(),
        start.getDate(),
      )) /
      86_400_000,
  );
}

export function formatShortDate(value: string) {
  return parseDate(value).toLocaleDateString("en-CA", {
    month: "short",
    day: "numeric",
  });
}

export function formatLongDate(value: string) {
  return parseDate(value).toLocaleDateString("en-CA", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function TrendChart({
  points,
  series,
  startDate,
  endDate,
  formatValue,
  ariaLabel,
  height = 260,
}: {
  points: TrendPoint[];
  series: VisitTypeKey[];
  startDate: string;
  endDate: string;
  formatValue: (value: number) => string;
  ariaLabel: string;
  height?: number;
}) {
  const [containerRef, width] =
    useElementWidth<HTMLDivElement>();
  const { active, setActive, keyboardProps } =
    useKeyboardIndex(points.length);

  const margin = { top: 16, right: 52, bottom: 28, left: 40 };
  const plotWidth = Math.max(0, width - margin.left - margin.right);
  const plotHeight = height - margin.top - margin.bottom;

  const start = parseDate(startDate);
  const totalDays = Math.max(
    1,
    dayIndex(start, parseDate(endDate)),
  );

  const x = (date: string) =>
    margin.left +
    (dayIndex(start, parseDate(date)) / totalDays) * plotWidth;

  let maxValue = 0;

  points.forEach((point) =>
    series.forEach((key) => {
      const value = point.values[key]?.value;

      if (value != null && value > maxValue) {
        maxValue = value;
      }
    }),
  );

  const scale = niceScale(maxValue);

  const y = (value: number) =>
    margin.top + plotHeight - (value / scale.max) * plotHeight;

  /* ~5 date ticks across the range. */
  const tickCount = Math.max(
    2,
    Math.min(6, Math.floor(plotWidth / 90)),
  );
  const dateTicks: string[] = [];

  for (let index = 0; index < tickCount; index += 1) {
    const offset = Math.round(
      (index / (tickCount - 1)) * totalDays,
    );
    const date = new Date(start);

    date.setDate(date.getDate() + offset);
    dateTicks.push(
      `${date.getFullYear()}-${String(
        date.getMonth() + 1,
      ).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`,
    );
  }

  /*
   * Lines connect neighbouring days with data (bridging up
   * to a long weekend). Longer gaps break the line so the
   * chart never implies data that was not recorded.
   */
  const MAX_BRIDGE_DAYS = 3;

  const seriesPaths = series.map((key) => {
    const segments: string[] = [];
    let current = "";
    let previousDate: string | null = null;
    const marks: { date: string; value: number }[] = [];

    points.forEach((point) => {
      const value = point.values[key]?.value;

      if (value == null) {
        return;
      }

      const px = x(point.date);
      const py = y(value);
      const bridged =
        previousDate !== null &&
        dayIndex(parseDate(previousDate), parseDate(point.date)) <=
          MAX_BRIDGE_DAYS;

      if (bridged && current) {
        current += ` L${px},${py}`;
      } else {
        if (current) {
          segments.push(current);
        }

        current = `M${px},${py}`;
      }

      previousDate = point.date;
      marks.push({ date: point.date, value });
    });

    if (current) {
      segments.push(current);
    }

    return { key, d: segments.join(" "), marks };
  });

  const showMarkers = points.length <= 60;

  /* End labels only when they would not collide. */
  const endLabels = seriesPaths
    .map(({ key, marks }) => {
      const last = marks[marks.length - 1];

      return last
        ? { key, value: last.value, py: y(last.value), px: x(last.date) }
        : null;
    })
    .filter(
      (
        label,
      ): label is {
        key: VisitTypeKey;
        value: number;
        py: number;
        px: number;
      } => label !== null,
    );

  const labelsCollide =
    endLabels.length > 1 &&
    Math.abs(endLabels[0].py - endLabels[1].py) < 14;

  function handleMove(event: MouseEvent<SVGRectElement>) {
    if (!points.length) {
      return;
    }

    const bounds = event.currentTarget.getBoundingClientRect();
    const pointer = event.clientX - bounds.left + margin.left;
    let nearest = 0;
    let nearestDistance = Infinity;

    points.forEach((point, index) => {
      const distance = Math.abs(x(point.date) - pointer);

      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearest = index;
      }
    });

    setActive(nearest);
  }

  const activePoint = active !== null ? points[active] : null;

  return (
    <div
      ref={containerRef}
      className="relative w-full rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-[#13B2B3]/40"
      style={{ height }}
      aria-label={`${ariaLabel}. Use left and right arrow keys to read values.`}
      role="group"
      {...keyboardProps}
      onMouseLeave={() => setActive(null)}
    >
      {width > 0 && (
        <svg
          width={width}
          height={height}
          className="block"
          aria-hidden="true"
        >
          {scale.ticks.map((tick) => (
            <g key={tick}>
              <line
                x1={margin.left}
                x2={margin.left + plotWidth}
                y1={y(tick)}
                y2={y(tick)}
                stroke={tick === 0 ? BASELINE : GRID}
                strokeWidth={1}
                shapeRendering="crispEdges"
              />

              <text
                x={margin.left - 8}
                y={y(tick)}
                dy="0.32em"
                textAnchor="end"
                fontSize={11}
                fill={TICK_TEXT}
              >
                {formatTick(tick)}
              </text>
            </g>
          ))}

          {dateTicks.map((tick, index) => (
            <text
              key={tick}
              x={x(tick)}
              y={height - 8}
              textAnchor={
                index === 0
                  ? "start"
                  : index === dateTicks.length - 1
                    ? "end"
                    : "middle"
              }
              fontSize={11}
              fill={TICK_TEXT}
            >
              {formatShortDate(tick)}
            </text>
          ))}

          {activePoint && (
            <line
              x1={x(activePoint.date)}
              x2={x(activePoint.date)}
              y1={margin.top}
              y2={margin.top + plotHeight}
              stroke={BASELINE}
              strokeWidth={1}
            />
          )}

          {seriesPaths.map(({ key, d, marks }) => (
            <g key={key}>
              <path
                d={d}
                fill="none"
                stroke={SERIES[key].color}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
              />

              {marks.map((mark) => {
                const isActive =
                  activePoint?.date === mark.date;

                if (!showMarkers && !isActive) {
                  return null;
                }

                return (
                  <circle
                    key={mark.date}
                    cx={x(mark.date)}
                    cy={y(mark.value)}
                    r={isActive ? 5 : 4}
                    fill={SERIES[key].color}
                    stroke={SURFACE}
                    strokeWidth={2}
                  />
                );
              })}
            </g>
          ))}

          {!labelsCollide &&
            endLabels.map((label) => (
              <text
                key={label.key}
                x={Math.min(label.px + 8, width - 2)}
                y={label.py}
                dy="0.32em"
                fontSize={11}
                fontWeight={600}
                fill="#334155"
                textAnchor={
                  label.px + 8 > width - margin.right + 40
                    ? "end"
                    : "start"
                }
              >
                {formatValue(label.value)}
              </text>
            ))}

          <rect
            x={margin.left}
            y={margin.top}
            width={plotWidth}
            height={plotHeight}
            fill="transparent"
            onMouseMove={handleMove}
          />
        </svg>
      )}

      {activePoint && (
        <ChartTooltip
          x={x(activePoint.date)}
          width={width}
          title={formatLongDate(activePoint.date)}
          rows={series.map((key) => {
            const point = activePoint.values[key];

            return {
              series: series.length > 1 ? key : undefined,
              label: SERIES[key].label,
              value:
                point?.value != null
                  ? formatValue(point.value)
                  : "No visits",
              detail: point?.detail,
            };
          })}
        />
      )}
    </div>
  );
}

/* ---------- ranked horizontal bars (HTML) ---------- */

export type RankedRow = {
  key: string;
  label: string;
  values: SeriesValues;
  meta?: Partial<Record<VisitTypeKey, string>>;
};

export function RankedBars({
  rows,
  series,
  formatValue,
}: {
  rows: RankedRow[];
  series: VisitTypeKey[];
  formatValue: (value: number) => string;
}) {
  const [hovered, setHovered] = useState<string | null>(
    null,
  );

  let maxValue = 0;

  rows.forEach((row) =>
    series.forEach((key) => {
      const value = row.values[key]?.value;

      if (value != null && value > maxValue) {
        maxValue = value;
      }
    }),
  );

  const max = maxValue > 0 ? maxValue : 1;

  return (
    <ul className="space-y-1">
      {rows.map((row) => (
        <li
          key={row.key}
          tabIndex={0}
          onMouseEnter={() => setHovered(row.key)}
          onMouseLeave={() => setHovered(null)}
          onFocus={() => setHovered(row.key)}
          onBlur={() => setHovered(null)}
          className={`grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)] items-center gap-3 rounded-lg px-2 py-2 outline-none transition sm:grid-cols-[minmax(0,11rem)_minmax(0,1fr)] ${
            hovered === row.key ? "bg-slate-50" : ""
          } focus-visible:ring-2 focus-visible:ring-[#13B2B3]/40`}
        >
          <span
            className="truncate text-sm font-semibold text-slate-800"
            title={row.label}
          >
            {row.label}
          </span>

          <div className="space-y-[2px]">
            {series.map((key) => {
              const value = row.values[key]?.value;
              const meta = row.meta?.[key];

              return (
                <div
                  key={key}
                  className="flex h-[14px] items-center gap-2"
                >
                  {value != null ? (
                    <>
                      <div
                        className="h-[10px] min-w-[2px] rounded-r-[4px]"
                        style={{
                          width: `calc((100% - 7.5rem) * ${value / max})`,
                          backgroundColor: SERIES[key].color,
                        }}
                      />

                      <span className="shrink-0 whitespace-nowrap text-xs font-semibold tabular-nums text-slate-700">
                        {formatValue(value)}
                        {meta && (
                          <span className="ml-1 font-normal text-slate-400">
                            {meta}
                          </span>
                        )}
                      </span>
                    </>
                  ) : (
                    <span className="text-[11px] text-slate-400">
                      {series.length > 1
                        ? `No ${SERIES[key].label.toLowerCase()} visits`
                        : "No visits"}
                    </span>
                  )}
                </div>
              );
            })}

            {hovered === row.key &&
              series.some((key) => row.values[key]?.detail) && (
                <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] text-slate-500">
                  {series.map((key) =>
                    row.values[key]?.detail ? (
                      <span
                        key={key}
                        className="flex items-center gap-1.5"
                      >
                        {series.length > 1 && (
                          <SeriesSwatch series={key} />
                        )}
                        {row.values[key]?.detail?.join(" · ")}
                      </span>
                    ) : null,
                  )}
                </div>
              )}
          </div>
        </li>
      ))}
    </ul>
  );
}

/* ---------- meter ---------- */

export function Meter({
  value,
  series,
}: {
  value: number | null;
  series: VisitTypeKey;
}) {
  const clamped =
    value == null ? 0 : Math.max(0, Math.min(100, value));

  return (
    <div
      className="h-1.5 w-full overflow-hidden rounded-full"
      style={{ backgroundColor: SERIES[series].track }}
      aria-hidden="true"
    >
      <div
        className="h-full rounded-full"
        style={{
          width: `${clamped}%`,
          backgroundColor: SERIES[series].color,
        }}
      />
    </div>
  );
}
