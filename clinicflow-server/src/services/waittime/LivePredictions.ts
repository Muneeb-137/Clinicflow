import { buildClinicState } from "./ClinicStateBuilder.js";
import {
  predictClinic,
  type ClinicPredictions,
} from "./PredictionEngine.js";
import type { ClinicState } from "./types.js";

/*
 * =========================================================
 * SHARED LIVE PREDICTIONS
 * =========================================================
 *
 * predictClinic runs ~150 simulations. Every clinic event
 * makes every open screen (dashboards, live queues,
 * patient phones) refetch at once, so each request doing
 * its own run would stall the server.
 *
 * Instead, all requests share one calculation:
 * - requests arriving while it runs wait for the same one;
 * - the result is reused for a few seconds;
 * - any clinic event (check-in, rooming, status change...)
 *   marks it out of date, so the next request recalculates
 *   with the new data.
 */

export type LivePredictions = {
  now: Date;
  state: ClinicState;
  predictions: ClinicPredictions;
};

// Reuse window. Short enough that time passing (waits
// counting down) shows up quickly even with no events.
const FRESH_MS = 10_000;

let generation = 0;

let current: {
  generation: number;
  startedAt: number;
  promise: Promise<LivePredictions>;
} | null = null;

/*
 * Called whenever clinic data changes.
 */
export function invalidateLivePredictions() {
  generation += 1;
}

export function getLivePredictions(): Promise<LivePredictions> {
  if (
    current &&
    current.generation === generation &&
    Date.now() - current.startedAt < FRESH_MS
  ) {
    return current.promise;
  }

  const entry = {
    generation,
    startedAt: Date.now(),
    promise: (async () => {
      const now = new Date();
      const state = await buildClinicState(now);

      return {
        now,
        state,
        predictions: predictClinic(state, now),
      };
    })(),
  };

  current = entry;

  // A failed run must not be served to later requests.
  entry.promise.catch(() => {
    if (current === entry) {
      current = null;
    }
  });

  return entry.promise;
}
