import { apiFetch } from "../lib/api";
import {
  useState,
} from "react";

import {
  useNavigate,
  useSearchParams,
} from "react-router-dom";

function DoctorAcceptInvitePage() {
  const navigate =
    useNavigate();

  const [searchParams] =
    useSearchParams();

  const token =
    searchParams.get("token");

  const [
    password,
    setPassword,
  ] = useState("");

  const [
    confirmPassword,
    setConfirmPassword,
  ] = useState("");

  const [
    errorMessage,
    setErrorMessage,
  ] = useState("");

  const [
    loading,
    setLoading,
  ] = useState(false);

  const [
    success,
    setSuccess,
  ] = useState(false);

  async function handleSubmit(
    event:
      React.FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    setErrorMessage("");

    if (!token) {
      setErrorMessage(
        "This invitation link is invalid.",
      );

      return;
    }

    if (
      password.length < 8
    ) {
      setErrorMessage(
        "Password must be at least 8 characters.",
      );

      return;
    }

    if (
      password !==
      confirmPassword
    ) {
      setErrorMessage(
        "Passwords do not match.",
      );

      return;
    }

    try {
      setLoading(true);

      const response =
        await apiFetch(
          "/api/doctor-auth/accept-invite",
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",
            },
            body:
              JSON.stringify({
                token,
                password,
              }),
          },
        );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data.message ??
            "Unable to create doctor account.",
        );
      }

      setSuccess(true);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to create doctor account.",
      );
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F7F9FC] px-6">
        <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <h1 className="text-2xl font-bold text-slate-950">
            Account created
          </h1>

          <p className="mt-3 text-sm leading-6 text-slate-500">
            Your ClinicFlow Doctor Portal
            account is ready.
          </p>

          <button
            type="button"
            onClick={() =>
              navigate(
                "/doctor/login",
              )
            }
            className="mt-7 w-full rounded-xl bg-[#13B2B3] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#109c9d]"
          >
            Continue to sign in
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F7F9FC] px-6">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#13B2B3]">
          Physician Access
        </p>

        <h1 className="mt-3 text-3xl font-bold tracking-tight text-slate-950">
          Create your password
        </h1>

        <p className="mt-2 text-sm leading-6 text-slate-500">
          Set a password to activate
          your ClinicFlow Doctor Portal
          account.
        </p>

        {!token && (
          <div className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            This invitation link is
            missing its security token.
          </div>
        )}

        <form
          onSubmit={handleSubmit}
          className="mt-7 space-y-5"
        >
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">
              Password
            </label>

            <input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(event) =>
                setPassword(
                  event.target.value,
                )
              }
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-[#13B2B3] focus:ring-4 focus:ring-[#13B2B3]/10"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">
              Confirm password
            </label>

            <input
              type="password"
              required
              minLength={8}
              value={
                confirmPassword
              }
              onChange={(event) =>
                setConfirmPassword(
                  event.target.value,
                )
              }
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-[#13B2B3] focus:ring-4 focus:ring-[#13B2B3]/10"
            />
          </div>

          {errorMessage && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {errorMessage}
            </div>
          )}

          <button
            type="submit"
            disabled={
              loading || !token
            }
            className="w-full rounded-xl bg-[#13B2B3] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#109c9d] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading
              ? "Creating account..."
              : "Create Doctor Account"}
          </button>
        </form>
      </div>
    </div>
  );
}

export default DoctorAcceptInvitePage;