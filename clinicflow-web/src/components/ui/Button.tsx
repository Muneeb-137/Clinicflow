import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Link } from "react-router-dom";

type Variant = "primary" | "secondary" | "ghost";

const variantClasses: Record<Variant, string> = {
  primary:
    "bg-brand-500 text-white shadow-card hover:bg-brand-600",
  secondary:
    "border border-slate-200 bg-white text-slate-700 shadow-card hover:bg-slate-50",
  ghost: "text-brand-700 hover:bg-brand-50",
};

const base =
  "inline-flex items-center justify-center gap-2 rounded-control px-4 py-2.5 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60";

/*
 * Link styled as a button (navigation actions).
 */
export function ButtonLink({
  to,
  variant = "primary",
  children,
  className = "",
}: {
  to: string;
  variant?: Variant;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Link to={to} className={`${base} ${variantClasses[variant]} ${className}`}>
      {children}
    </Link>
  );
}

export function Button({
  variant = "primary",
  children,
  className = "",
  type = "button",
  ...props
}: {
  variant?: Variant;
  children: ReactNode;
  className?: string;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type={type}
      className={`${base} ${variantClasses[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
