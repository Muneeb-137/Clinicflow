import { useState } from "react";
import type { FormEvent } from "react";
import { CheckCircle2 } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";

import AuthBrandPanel from "../components/AuthBrandPanel";
import { apiFetch } from "../lib/api";
import { portalSettings } from "./ForgotPasswordPage";

const MIN_LENGTH = 8;

/*
 * Opened from the reset email: choose a new password. All
 * other sign-ins on the account are ended.
 */
function ResetPasswordPage() {
  const [params] = useSearchParams();
  const settings = portalSettings(params.get("portal"));
  const token = params.get("token") ?? "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState("");
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");

    if (password.length < MIN_LENGTH) {
      setError(`Use at least ${MIN_LENGTH} characters.`);
      return;
    }

    if (password !== confirm) {
      setError("The two passwords don't match.");
      return;
    }

    setSubmitting(true);

    try {
      const response = await apiFetch(`${settings.api}/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message ?? "Unable to change the password.");
      }

      setDone(data.message);
    } catch (resetError) {
      setError(resetError instanceof Error ? resetError.message : "Unable to change the password.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#F7F9FC] lg:grid lg:grid-cols-[0.9fr_1.1fr]">
      <AuthBrandPanel />

      <section className="flex items-center justify-center px-6 py-12 sm:px-10 lg:px-16">
        <div className="w-full max-w-md">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#109c9d]">
            {settings.label}
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">
            Choose a new password
          </h1>

          <div className="mt-8 rounded-[28px] border border-slate-200/80 bg-white p-8 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
            {!token ? (
              <p className="text-sm text-slate-600">
                This link is incomplete.{" "}
                <Link to={`/forgot-password?portal=${settings.portal}`} className="font-semibold text-[#13B2B3]">
                  Ask for a new reset link
                </Link>
                .
              </p>
            ) : done ? (
              <div>
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[#13B2B3]" />
                  <p className="text-sm leading-6 text-slate-700">
                    {done} For your security, you were signed out everywhere else.
                  </p>
                </div>
                <Link
                  to={settings.signInPath}
                  className="mt-6 block w-full rounded-xl bg-[#13B2B3] px-4 py-3.5 text-center text-sm font-semibold text-white transition hover:bg-[#109c9d]"
                >
                  Sign in
                </Link>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label htmlFor="new-password" className="mb-2 block text-sm font-medium text-slate-700">
                    New password
                  </label>
                  <input
                    id="new-password"
                    type="password"
                    autoComplete="new-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-4 py-3.5 text-slate-900 outline-none transition focus:border-[#13B2B3] focus:ring-4 focus:ring-[#13B2B3]/10"
                  />
                  <p className="mt-1.5 text-xs text-slate-400">At least {MIN_LENGTH} characters.</p>
                </div>

                <div>
                  <label htmlFor="confirm-password" className="mb-2 block text-sm font-medium text-slate-700">
                    Confirm new password
                  </label>
                  <input
                    id="confirm-password"
                    type="password"
                    autoComplete="new-password"
                    value={confirm}
                    onChange={(event) => setConfirm(event.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-4 py-3.5 text-slate-900 outline-none transition focus:border-[#13B2B3] focus:ring-4 focus:ring-[#13B2B3]/10"
                  />
                </div>

                {error && (
                  <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {error}{" "}
                    {error.includes("expired") && (
                      <Link to={`/forgot-password?portal=${settings.portal}`} className="font-semibold underline">
                        Get a new link
                      </Link>
                    )}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full rounded-xl bg-[#13B2B3] px-4 py-3.5 text-sm font-semibold text-white transition hover:bg-[#109c9d] disabled:opacity-60"
                >
                  {submitting ? "Saving..." : "Change password"}
                </button>
              </form>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

export default ResetPasswordPage;
