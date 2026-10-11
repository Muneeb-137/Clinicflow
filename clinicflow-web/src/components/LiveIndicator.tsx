import { useSyncExternalStore } from "react";

import {
  getLiveStatus,
  subscribeLiveStatus,
} from "../socket";

/*
 * Shows whether this screen is receiving real-time updates.
 * Live pages reload on their own (and catch up after a
 * reconnect), so they need no Refresh button.
 */
function LiveIndicator() {
  const status = useSyncExternalStore(
    subscribeLiveStatus,
    getLiveStatus,
  );

  const look =
    status === "live"
      ? {
          label: "Live",
          title: "Updates appear automatically.",
          pill: "border-emerald-200 bg-emerald-50 text-emerald-700",
          dot: "bg-emerald-500",
          ping: true,
        }
      : status === "reconnecting"
        ? {
            label: "Reconnecting…",
            title:
              "Connection lost. This screen will update as soon as it reconnects.",
            pill: "border-amber-200 bg-amber-50 text-amber-800",
            dot: "bg-amber-500",
            ping: false,
          }
        : {
            label: "Connecting…",
            title: "Connecting to live updates.",
            pill: "border-slate-200 bg-white text-slate-500",
            dot: "bg-slate-400",
            ping: false,
          };

  return (
    <span
      role="status"
      aria-live="polite"
      title={look.title}
      className={`inline-flex items-center gap-2 self-center whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-semibold ${look.pill}`}
    >
      <span className="relative flex h-2 w-2">
        {look.ping && (
          <span
            className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 motion-reduce:animate-none ${look.dot}`}
          />
        )}
        <span
          className={`relative inline-flex h-2 w-2 rounded-full ${look.dot}`}
        />
      </span>
      {look.label}
    </span>
  );
}

export default LiveIndicator;
