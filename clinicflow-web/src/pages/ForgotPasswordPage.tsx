import { useState } from "react";
import type { FormEvent } from "react";
import { ArrowLeft, MailCheck } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";

import AuthBrandPanel from "../components/AuthBrandPanel";
import { apiFetch } from "../lib/api";

/*
 * "Forgot password": emails a reset link. Works for staff
 * and doctors (portal=staff) and patients (portal=patient).
 */
export function portalSettings(portal: string | null) {
  return portal === "patient"
    ? {
        portal: "patient" as const,
        api: "/api/patient-auth",
        signInPath: "/patient/login",
        label: "Patient portal",
      }
    : {
        portal: "staff" as const,
        api: "/api/auth",
        signInPath: "/login/staff",
        label: "Staff & doctors",
      };
}

function ForgotPasswordPage() {
  const [params] = useSearchParams();
  const settings = portalSettings(params.get("portal"));

  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState("");
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError("");

    try {
      const response = await apiFetch(`${settings.api}/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message ?? "Unable to send the email.");
      }

      setSent(data.message);
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "Unable to send the email.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#F7F9FC] lg:grid lg:grid-cols-[0.9fr_1.1fr]">
      <AuthBrandPanel />

      <section className="flex items-center justify-center px-6 py-12 sm:px-10 lg:px-16">
        <div className="w-full max-w-md">
          <Link
            to={settings.signInPath}
            className="mb-8 inline-flex items-center gap-2 text-sm font-medium text-slate-500 transition hover:text-[#13B2B3]"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to sign in
          </Link>

          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#109c9d]">
            {settings.label}
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">
            Reset your password
          </h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            Enter the email you sign in with and we'll send you a link to choose a new
            password.
          </p>

          <div className="mt-8 rounded-[28px] border border-slate-200/80 bg-white p-8 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
            {sent ? (
              <div className="flex items-start gap-3">
                <MailCheck className="mt-0.5 h-5 w-5 shrink-0 text-[#13B2B3]" />
                <div>
                  <p className="text-sm leading-6 text-slate-700">{sent}</p>
                  <p className="mt-3 text-xs text-slate-400">
                    Didn't get it? Check spam, or try again in a few minutes.
                  </p>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label htmlFor="forgot-email" className="mb-2 block text-sm font-medium text-slate-700">
                    Email
                  </label>
                  <input
                    id="forgot-email"
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-4 py-3.5 text-slate-900 outline-none transition focus:border-[#13B2B3] focus:ring-4 focus:ring-[#13B2B3]/10"
                  />
                </div>

                {error && (
                  <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {error}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full rounded-xl bg-[#13B2B3] px-4 py-3.5 text-sm font-semibold text-white transition hover:bg-[#109c9d] disabled:opacity-60"
                >
                  {submitting ? "Sending..." : "Send reset link"}
                </button>
              </form>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

export default ForgotPasswordPage;
