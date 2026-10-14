import type { ReactNode } from "react";

export type StatusTone =
  | "success"
  | "info"
  | "warning"
  | "danger"
  | "neutral"
  | "brand";

const toneClasses: Record<StatusTone, { pill: string; dot: string }> = {
  success: { pill: "bg-emerald-50 text-emerald-700 ring-emerald-200", dot: "bg-emerald-500" },
  info: { pill: "bg-blue-50 text-blue-700 ring-blue-200", dot: "bg-blue-500" },
  warning: { pill: "bg-amber-50 text-amber-800 ring-amber-200", dot: "bg-amber-500" },
  danger: { pill: "bg-rose-50 text-rose-700 ring-rose-200", dot: "bg-rose-500" },
  neutral: { pill: "bg-slate-100 text-slate-600 ring-slate-200", dot: "bg-slate-400" },
  brand: { pill: "bg-brand-50 text-brand-700 ring-brand-200", dot: "bg-brand-500" },
};

/*
 * Small status pill. The text always carries the meaning;
 * colour only reinforces it.
 */
export function StatusBadge({
  tone,
  children,
  dot = false,
}: {
  tone: StatusTone;
  children: ReactNode;
  dot?: boolean;
}) {
  const classes = toneClasses[tone];

  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${classes.pill}`}
    >
      {dot && <span className={`h-1.5 w-1.5 rounded-full ${classes.dot}`} />}
      {children}
    </span>
  );
}
