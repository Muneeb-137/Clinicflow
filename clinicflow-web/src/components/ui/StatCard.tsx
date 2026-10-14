import type { ReactNode } from "react";

import { Card } from "./Card";

/*
 * KPI tile: label with an icon chip on the top line, then
 * the value and a short caption using the card's full
 * width.
 */
export function StatCard({
  label,
  value,
  caption,
  icon,
  loading = false,
}: {
  label: string;
  value: ReactNode;
  caption?: ReactNode;
  icon: ReactNode;
  loading?: boolean;
}) {
  return (
    <Card padded={false} className="flex flex-col p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-slate-500">{label}</p>

        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600">
          {icon}
        </span>
      </div>

      {loading ? (
        <div className="mt-2 h-8 w-20 animate-pulse rounded-lg bg-slate-100" />
      ) : (
        <div className="mt-1 text-3xl font-bold tracking-tight text-slate-950">
          {value}
        </div>
      )}

      {caption && !loading && (
        <p className="mt-auto pt-1 text-xs text-slate-500">{caption}</p>
      )}
    </Card>
  );
}
