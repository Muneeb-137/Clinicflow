import { useEffect, useState } from "react";

import { useClinicFlowRefresh } from "../../hooks/useClinicFlowRefresh";
import { fetchWaitTimeSummary } from "./waitTimeFormat";
import type { WaitTimeSummary } from "./waitTimeTypes";

/*
 * Today's wait-time summary, reloaded whenever the
 * server broadcasts a clinic update, and every minute so
 * estimates keep moving while a doctor runs over.
 */
export function useWaitTimeSummary() {
  const liveVersion = useClinicFlowRefresh(300, 60_000);

  const [summary, setSummary] =
    useState<WaitTimeSummary | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    fetchWaitTimeSummary()
      .then((data) => {
        if (cancelled) {
          return;
        }

        setSummary(data);
        setError("");
      })
      .catch((loadError: unknown) => {
        if (cancelled) {
          return;
        }

        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load wait times.",
        );
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [liveVersion]);

  return { summary, loading, error };
}
