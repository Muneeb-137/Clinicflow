import {
  ArrowLeft,
  ArrowRight,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useState } from "react";

import logo from "../assets/logo-new.svg";
import AuthBrandPanel from "../components/AuthBrandPanel";
import { usePatientAuth } from "../context/PatientAuthContext";
import TwoStepForm from "../components/TwoStepForm";
import type { TwoStepChallenge } from "../types/auth";

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
  const expired = getSessionExpired("patient");

  clearSessionExpired();

  return expired && isAllowed(expired.returnTo)
    ? expired.returnTo
    : null;
}

function PatientLoginPage() {
  const navigate = useNavigate();
  const { login, verifyCode, resendCode } = usePatientAuth();

  // Set once the password is accepted: waiting for the
  // emailed code.
  const [challenge, setChallenge] =
    useState<TwoStepChallenge | null>(null);

  function finishSignIn() {
    navigate(
      expiredReturnPath((path) =>
        path.startsWith("/patient/"),
      ) ?? "/patient/dashboard",
    );
  }

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] =
    useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(
  event: React.FormEvent<HTMLFormElement>,
) {
  event.preventDefault();

  try {
    setLoading(true);
    setErrorMessage("");

    const result = await login(email, password);

    if (result.status === "two_step") {
      setChallenge(result.challenge);
      return;
    }

    finishSignIn();
  } catch (error) {
    setErrorMessage(
      error instanceof Error
        ? error.message
        : "Unable to sign in.",
    );
  } finally {
    setLoading(false);
  }
}


  return (
  <div className="min-h-screen bg-[#F7F9FC] lg:grid lg:grid-cols-[0.9fr_1.1fr]">
    <AuthBrandPanel />

      {/* RIGHT SIDE */}
      <main className="flex min-h-screen items-center justify-center px-6 py-12 sm:px-10">
        <div className="w-full max-w-md">
          <button
            type="button"
            onClick={() => navigate("/login")}
            className="mb-8 inline-flex items-center gap-2 text-sm font-medium text-slate-500 transition hover:text-[#13B2B3]"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to portal selection
          </button>

          <div className="lg:hidden">
            <img
              src={logo}
              alt="ClinicFlow"
              className="mb-10 h-9 w-auto"
            />
          </div>

          <div className="mb-8">
             <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-[#13B2B3]/20 bg-[#13B2B3]/5 px-3 py-1.5">
    <span className="h-2 w-2 rounded-full bg-[#13B2B3]" />

    <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[#109c9d]">
      Patient Access
    </span>
  </div>

  <h2 className="text-3xl font-bold tracking-tight text-slate-950">
    Welcome back
  </h2>

  <p className="mt-2 text-sm leading-6 text-slate-500">
    Sign in to continue to your ClinicFlow account.
  </p>
</div>

          {challenge ? (
            <TwoStepForm
              challenge={challenge}
              onVerify={async (code, trust) => {
                await verifyCode(challenge.challengeId, code, trust);
      finishSignIn();
              }}
              onResend={() => resendCode(challenge.challengeId)}
              onCancel={() => {
                setChallenge(null);
                setPassword("");
                setLoading(false);
              }}
            />
          ) : (
          <>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label
                htmlFor="email"
                className="mb-2 block text-sm font-medium text-slate-700"
              >
                Email address
              </label>

              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(event) =>
                  setEmail(event.target.value)
                }
                placeholder="you@example.com"
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-[#13B2B3] focus:ring-4 focus:ring-[#13B2B3]/10"
              />
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <label
                  htmlFor="password"
                  className="text-sm font-medium text-slate-700"
                >
                  Password
                </label>

                <button
                  type="button"
                  className="text-sm font-medium text-[#13B2B3] hover:text-teal-600"
                >
                  Forgot password?
                </button>
              </div>

              <input
                id="password"
                type="password"
                required
                value={password}
                onChange={(event) =>
                  setPassword(event.target.value)
                }
                placeholder="Enter your password"
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-[#13B2B3] focus:ring-4 focus:ring-[#13B2B3]/10"
              />
            </div>

            <SessionExpiredNotice portal="patient" />

            {errorMessage && (
  <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
    {errorMessage}
  </div>
)}

            <button
  type="submit"
  disabled={loading}
  className="group flex w-full items-center justify-center gap-2 rounded-xl bg-[#13B2B3] px-5 py-3.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#109c9d] disabled:cursor-not-allowed disabled:opacity-60"
>
  {loading ? "Signing in..." : "Sign in"}

  {!loading && (
    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
  )}
</button>
          </form>

          <p className="mt-4 text-center text-sm">
            <Link
              to="/forgot-password?portal=patient"
              className="font-medium text-[#13B2B3] hover:underline"
            >
              Forgot password?
            </Link>
          </p>
          </>
          )}

          <div className="my-8 flex items-center gap-4">
            <div className="h-px flex-1 bg-slate-200" />
            <span className="text-xs font-medium uppercase tracking-wider text-slate-400">
              New patient
            </span>
            <div className="h-px flex-1 bg-slate-200" />
          </div>

          <Link
            to="/patient/register"
            className="flex w-full items-center justify-center rounded-xl border border-slate-200 bg-white px-5 py-3.5 text-sm font-semibold text-slate-700 transition hover:border-[#13B2B3]/40 hover:bg-teal-50/30 hover:text-[#13B2B3]"
          >
            Create patient account
          </Link>
        </div>
      </main>
    </div>
  );
}

export default PatientLoginPage;