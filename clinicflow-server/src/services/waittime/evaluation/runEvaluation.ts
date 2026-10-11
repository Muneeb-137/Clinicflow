import "dotenv/config";

import { pool } from "../../../db.js";

import {
  summarize,
  summarizeByVisitType,
  type AccuracySummary,
  type PredictionOutcome,
} from "./metrics.js";

import { replayHistory } from "./replayHistory.js";

import {
  runSyntheticScenario,
  type ScenarioConfig,
} from "./syntheticClinic.js";

/*
 * Wait-time accuracy report.
 *
 *   npm run eval:waittime
 *   npm run eval:waittime -- --synthetic-only
 *   npm run eval:waittime -- --history-only 2026-07-01 2026-10-31
 *
 * 1. Synthetic clinic days with known truth (quiet,
 *    normal, busy, and a front desk that waits for the
 *    appointment time).
 * 2. Replay of real history from the database.
 */

const hours = (h: number, m = 0) => h * 60 + m;

const BASE: Omit<
  ScenarioConfig,
  | "name"
  | "description"
  | "seed"
  | "bookingFill"
  | "walkInsPerHour"
> = {
  days: 20,

  doctors: [
    {
      id: 1,
      bookedBlocks: [
        [hours(9), hours(12)],
        [hours(15), hours(17)],
      ],
      walkInBlocks: [[hours(13), hours(15)]],
    },
    {
      id: 2,
      bookedBlocks: [[hours(9), hours(12)]],
      walkInBlocks: [[hours(13), hours(17)]],
    },
    {
      id: 3,
      bookedBlocks: [],
      walkInBlocks: [
        [hours(9), hours(12)],
        [hours(13), hours(17)],
      ],
    },
  ],

  appointmentTypes: [
    {
      id: 1,
      bookedMinutes: 15,
      actualFactor: 0.9,
      sigma: 0.35,
      bookedWeight: 3,
      walkInWeight: 4,
    },
    {
      id: 2,
      bookedMinutes: 30,
      actualFactor: 0.9,
      sigma: 0.35,
      bookedWeight: 4,
      walkInWeight: 4,
    },
    {
      id: 3,
      bookedMinutes: 45,
      actualFactor: 0.95,
      sigma: 0.3,
      bookedWeight: 1,
      walkInWeight: 0.5,
    },
  ],

  noShowRate: 0.08,
  arrivalOffsetMean: -8,
  arrivalOffsetSd: 7,
  walkInFormsMinutes: [2, 8],
  // Clinic policy: booked patients are seen at their
  // appointment time, not earlier.
  earlyRoomingMinutes: 0,
};

const SCENARIOS: ScenarioConfig[] = [
  {
    ...BASE,
    name: "Quiet",
    description: "60% of slots booked, 3 walk-ins/hour",
    seed: 101,
    bookingFill: 0.6,
    walkInsPerHour: 3,
  },
  {
    ...BASE,
    name: "Normal",
    description: "80% of slots booked, 6 walk-ins/hour",
    seed: 202,
    bookingFill: 0.8,
    walkInsPerHour: 6,
  },
  {
    ...BASE,
    name: "Busy",
    description: "95% of slots booked, 10 walk-ins/hour",
    seed: 303,
    bookingFill: 0.95,
    walkInsPerHour: 10,
  },
  {
    ...BASE,
    name: "Normal, desk rooms booked patients early",
    description:
      "As Normal, but the front desk rooms early booked patients whenever their doctor is free (breaks the policy)",
    seed: 404,
    bookingFill: 0.8,
    walkInsPerHour: 6,
    earlyRoomingMinutes: Number.POSITIVE_INFINITY,
  },
];

const fmt = (value: number | null, suffix = "") =>
  value === null ? "-" : `${value}${suffix}`;

function row(
  label: string,
  summary: AccuracySummary,
) {
  return {
    "": label,
    patients: summary.predictions,
    "can estimate": fmt(summary.coveragePct, "%"),
    "avg actual": fmt(summary.averageActualMinutes, "m"),
    "avg error": fmt(summary.meanAbsErrorMinutes, "m"),
    "median error": fmt(summary.medianAbsErrorMinutes, "m"),
    bias: fmt(summary.biasMinutes, "m"),
    "within 10m": fmt(summary.within10Pct, "%"),
    "in range": fmt(summary.rangeHitPct, "%"),
    "naive avg error": fmt(
      summary.baselineMeanAbsErrorMinutes,
      "m",
    ),
  };
}

function report(
  title: string,
  outcomes: PredictionOutcome[],
  arrival?: PredictionOutcome[],
) {
  const byType = summarizeByVisitType(outcomes);

  const rows = [
    row("Walk-in (at check-in)", byType.walk_in),
    row("Scheduled (at check-in)", byType.scheduled),
  ];

  if (arrival) {
    rows.push(
      row(
        "Walk-in (at arrival)",
        summarize(arrival),
      ),
    );
  }

  console.log(`\n=== ${title} ===`);
  console.table(rows);

  return byType;
}

async function main() {
  const args = process.argv.slice(2);
  const historyOnly = args.includes("--history-only");
  const syntheticOnly = args.includes("--synthetic-only");

  if (!historyOnly) {
    for (const scenario of SCENARIOS) {
      const result = runSyntheticScenario(scenario);

      report(
        `Synthetic: ${scenario.name} (${scenario.description}; ${scenario.days} days, ${result.unserved} not seen)`,
        result.outcomes,
        result.arrivalOutcomes,
      );
    }

    // Design check: the engine ignores late, not-yet-
    // arrived booked patients. Compare with reserving
    // their time instead.
    const normal = SCENARIOS[1];

    const reserveLate = runSyntheticScenario(normal, {
      lateBookingPolicy: "reserve",
    });

    report(
      `Comparison: ${normal.name} if late bookings were RESERVED (default ignores them)`,
      reserveLate.outcomes,
      reserveLate.arrivalOutcomes,
    );
  }

  if (!syntheticOnly) {
    const dateArgs = args.filter((arg) =>
      /^\d{4}-\d{2}-\d{2}$/.test(arg),
    );

    const start = dateArgs[0] ?? "2026-01-01";
    const end =
      dateArgs[1] ??
      new Date().toISOString().slice(0, 10);

    const history = await replayHistory(start, end);

    report(
      `Real history ${start} to ${end} (${history.days} days, ${history.skipped} invalid waits skipped)`,
      history.outcomes,
    );
  }

  console.log(`
How to read this:
- avg/median error: how far the prediction was from the real wait.
- bias: + means the engine predicted longer than reality.
- within 10m: share of predictions within 10 minutes of the real wait.
- in range: share of real waits inside the predicted range (+/-2 min).
- naive avg error: a simple "today's average wait so far" guess, for comparison.
`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
