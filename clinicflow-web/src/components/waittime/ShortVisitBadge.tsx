import { Hourglass } from "lucide-react";

export const SHORT_VISIT_TOOLTIP =
  "Accepted near the end of walk-in hours — visit may be shorter than usual.";

/*
 * Rows that may carry the walk-in capacity override flag
 * (set when staff chose "Add anyway" on a walk-in that
 * would run past walk-in hours).
 */
export type CapacityOverrideFlag = {
  walk_in_capacity_override?: boolean;
};

/*
 * Amber "Short visit" pill shown to front desk and
 * doctors. "label" matches the uppercase 11px row tags
 * (Walk-In / Booked Patient); "pill" is the regular
 * text-xs status pill.
 */
export function ShortVisitBadge({
  variant = "pill",
}: {
  variant?: "pill" | "label";
}) {
  return (
    <span
      title={SHORT_VISIT_TOOLTIP}
      aria-label={`Short visit. ${SHORT_VISIT_TOOLTIP}`}
      className={
        variant === "label"
          ? "inline-flex shrink-0 items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-amber-700"
          : "inline-flex shrink-0 items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-700"
      }
    >
      <Hourglass size={12} />
      Short visit
    </span>
  );
}
