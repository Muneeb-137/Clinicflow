import { useEffect, useState } from "react";

import { socket } from "../socket";

/*
 * Returns a number that increases whenever the server
 * broadcasts a clinic update. Add it to a data-loading
 * effect's dependency list to reload on live changes:
 *
 *   const liveVersion = useClinicFlowRefresh();
 *   useEffect(() => { load(); }, [liveVersion]);
 *
 * Bursts of events (one action often sends two) are
 * collapsed into a single reload.
 *
 * pollMs also bumps the counter on a timer, for data that
 * changes with the clock alone (e.g. wait estimates while
 * a doctor runs over, with no new events). Skipped while
 * the tab is hidden.
 */
export function useClinicFlowRefresh(
  debounceMs = 300,
  pollMs?: number,
): number {
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!pollMs) {
      return;
    }

    const interval = window.setInterval(() => {
      if (!document.hidden) {
        setVersion((current) => current + 1);
      }
    }, pollMs);

    return () => {
      window.clearInterval(interval);
    };
  }, [pollMs]);

  useEffect(() => {
    let timer:
      | ReturnType<typeof setTimeout>
      | undefined;

    function handleUpdate() {
      clearTimeout(timer);

      timer = setTimeout(() => {
        setVersion((current) => current + 1);
      }, debounceMs);
    }

    socket.on(
      "clinicflow:updated",
      handleUpdate,
    );

    return () => {
      clearTimeout(timer);

      socket.off(
        "clinicflow:updated",
        handleUpdate,
      );
    };
  }, [debounceMs]);

  return version;
}
