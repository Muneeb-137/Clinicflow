import type { ReactNode } from "react";

/*
 * Shared surface for panels and tiles. One radius, one
 * border, one shadow, so every page looks related.
 */
export function Card({
  children,
  className = "",
  padded = true,
}: {
  children: ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return (
    <div
      className={`rounded-card border border-slate-200 bg-white shadow-card ${
        padded ? "p-5 sm:p-6" : ""
      } ${className}`}
    >
      {children}
    </div>
  );
}

/*
 * Title row inside a Card: optional eyebrow, title, short
 * description, and an action (badge, link, button) on the
 * right.
 */
export function CardHeader({
  eyebrow,
  title,
  description,
  action,
  icon,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex min-w-0 items-start gap-3">
        {icon && (
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-control bg-brand-50 text-brand-600">
            {icon}
          </span>
        )}

        <div className="min-w-0">
          {eyebrow && (
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-600">
              {eyebrow}
            </p>
          )}

          <h2 className="text-lg font-bold tracking-tight text-slate-900">
            {title}
          </h2>

          {description && (
            <p className="mt-0.5 text-sm text-slate-500">
              {description}
            </p>
          )}
        </div>
      </div>

      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
