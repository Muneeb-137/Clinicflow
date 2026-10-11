import { useState } from "react";
import type { FormEvent } from "react";

import {
  ArrowLeft,
  Stethoscope,
} from "lucide-react";

import { Link, useNavigate } from "react-router-dom";

import { useAuth } from "../context/AuthContext";
import TwoStepForm from "../components/TwoStepForm";
import type { StaffUser, TwoStepChallenge } from "../types/auth";
import AuthBrandPanel from "../components/AuthBrandPanel";
import SessionExpiredNotice from "../components/SessionExpiredNotice";
import {
  clearSessionExpired,
  getSessionExpired,
} from "../lib/api";

/*
 * Where to go after signing in: back to the page the user
 * was on when their session expired, if it belongs to
 * this kind of account.
 */
function expiredReturnPath(isAllowed: (path: string) => boolean) {
  const expired = getSessionExpired("staff");

  clearSessionExpired();

  return expired && isAllowed(expired.returnTo)
    ? expired.returnTo
    : null;
}

function DoctorLoginPage() {
  const navigate = useNavigate();

  const {
    login,
    logout,
    verifyCode,
    resendCode,
  } = useAuth();

  // Set once the password is accepted: waiting for the
  // emailed code.
  const [challenge, setChallenge] =
    useState<TwoStepChallenge | null>(null);

  const [email, setEmail] =
    useState("");

  const [password, setPassword] =
    useState("");

  const [errorMessage, setErrorMessage] =
    useState("");

  const [submitting, setSubmitting] =
    useState(false);

  /*
   * Signed in: only physician accounts may continue.
   */
  function finishSignIn(loggedInStaff: StaffUser) {

    if (
      loggedInStaff.role !== "doctor"
    ) {
      logout();

      throw new Error(
        "This account does not have physician access.",
      );
    }

    if (!loggedInStaff.doctor_id) {
      logout();

      throw new Error(
        "This physician account is not linked to a doctor profile.",
      );
    }

    navigate(
      expiredReturnPath((path) =>
        path.startsWith("/doctor/"),
      ) ?? "/doctor/dashboard",
      {
        replace: true,
      },
    );
  }

  async function handleSubmit(
  event: FormEvent,
) {
  event.preventDefault();

  try {
    setSubmitting(true);
    setErrorMessage("");

    const result = await login(
      email.trim(),
      password,
    );

    if (result.status === "two_step") {
      setChallenge(result.challenge);
      return;
    }

    finishSignIn(result.user);
  } catch (error) {
    setErrorMessage(
      error instanceof Error
        ? error.message
        : "Unable to log in.",
    );
  } finally {
    setSubmitting(false);
  }
}

  return (
    <div className="min-h-screen bg-[#F7F9FC] lg:grid lg:grid-cols-[0.9fr_1.1fr]">
      <AuthBrandPanel />

      {/* RIGHT LOGIN AREA */}
      <section className="relative flex items-center justify-center px-6 py-12 sm:px-10 lg:px-16">
        <div className="absolute left-6 top-6 lg:hidden">
          <button
            type="button"
            onClick={() =>
              navigate("/login")
            }
            className="text-xl font-bold"
          >
            <span className="text-slate-900">
              Clinic
            </span>

            <span className="text-[#13B2B3]">
              Flow
            </span>
          </button>
        </div>

        <div className="w-full max-w-md">
          <button
            type="button"
            onClick={() =>
              navigate("/login")
            }
            className="mb-8 inline-flex items-center gap-2 text-sm font-medium text-slate-500 transition hover:text-[#13B2B3]"
          >
            <ArrowLeft className="h-4 w-4" />

            Back to portal selection
          </button>

          <div className="mb-8">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-[#13B2B3]/20 bg-[#13B2B3]/5 px-3 py-1.5">
              <Stethoscope
                size={14}
                className="text-[#13B2B3]"
              />

              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[#109c9d]">
                Physician Access
              </span>
            </div>

            <h2 className="text-3xl font-bold tracking-tight text-slate-950">
              Welcome back, Doctor
            </h2>

            <p className="mt-2 text-sm leading-6 text-slate-500">
              Sign in to access your ClinicFlow
              physician workspace.
            </p>
          </div>

          <div className="rounded-[28px] border border-slate-200/80 bg-white p-8 shadow-[0_20px_60px_rgba(15,23,42,0.08)] sm:p-9">
            {challenge ? (
              <TwoStepForm
                challenge={challenge}
                onVerify={async (code, trust) => {
                  finishSignIn(await verifyCode(challenge.challengeId, code, trust));
                }}
                onResend={() => resendCode(challenge.challengeId)}
                onCancel={() => {
                  setChallenge(null);
                  setPassword("");
                  setSubmitting(false);
                }}
              />
            ) : (
            <>
            <form
              onSubmit={handleSubmit}
              className="space-y-5"
            >
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  Email
                </label>

                <input
                  type="email"
                  value={email}
                  onChange={(event) =>
                    setEmail(
                      event.target.value,
                    )
                  }
                  placeholder="Enter your physician email"
                  autoComplete="email"
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3.5 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-[#13B2B3] focus:ring-4 focus:ring-[#13B2B3]/10"
                  required
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  Password
                </label>

                <input
                  type="password"
                  value={password}
                  onChange={(event) =>
                    setPassword(
                      event.target.value,
                    )
                  }
                  placeholder="Enter your password"
                  autoComplete="current-password"
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3.5 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-[#13B2B3] focus:ring-4 focus:ring-[#13B2B3]/10"
                  required
                />
              </div>

              <SessionExpiredNotice portal="staff" />

              {errorMessage && (
                <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {errorMessage}
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="mt-2 w-full rounded-xl bg-[#13B2B3] px-4 py-3.5 font-semibold text-white shadow-sm transition hover:bg-[#109c9d] hover:shadow-md focus:outline-none focus:ring-4 focus:ring-[#13B2B3]/20 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting
                  ? "Signing in..."
                  : "Sign in"}
              </button>
            </form>

            <p className="mt-4 text-center text-sm">
              <Link
                to="/forgot-password?portal=staff"
                className="font-medium text-[#13B2B3] hover:underline"
              >
                Forgot password?
              </Link>
            </p>
            </>
            )}
          </div>

          <p className="mt-6 text-center text-xs text-slate-400">
            Secure access for authorized physicians
          </p>
        </div>
      </section>
    </div>
  );
}

export default DoctorLoginPage;