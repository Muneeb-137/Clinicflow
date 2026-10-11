import { apiFetch } from "../lib/api";
import { MailCheck } from "lucide-react";
import { useState } from "react";
import {
  useNavigate,
  useSearchParams,
} from "react-router-dom";

function PatientCheckEmailPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [resending, setResending] = useState(false);
  const [message, setMessage] = useState("");
  const [messageIsError, setMessageIsError] =
    useState(false);

  /*
    Email from the link (set after registration).
    When it is missing, ask for it instead of sending
    a placeholder to the server.
  */
  const emailFromQuery =
    searchParams.get("email")?.trim() ?? "";

  const [enteredEmail, setEnteredEmail] =
    useState("");

  const email =
    emailFromQuery || enteredEmail.trim();

  const canResend =
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

    async function handleResend() {
  if (!canResend) {
    setMessageIsError(true);
    setMessage(
      "Enter the email address you registered with.",
    );
    return;
  }

  try {
    setResending(true);
    setMessage("");
    setMessageIsError(false);

    const response = await apiFetch(
      "/api/patient-auth/resend-verification",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
        }),
      },
    );

    const data = await response
      .json()
      .catch(() => ({}));

    if (!response.ok) {
      // Includes 429 "Please wait a minute..." and
      // rate-limit messages from the server.
      throw new Error(
        data.message ??
          (response.status === 429
            ? "Too many requests. Please wait a minute and try again."
            : "Unable to resend verification email."),
      );
    }

    setMessage(
      data.message ??
        "Verification email sent.",
    );
  } catch (error) {
    setMessageIsError(true);
    setMessage(
      error instanceof Error
        ? error.message
        : "Unable to resend verification email.",
    );
  } finally {
    setResending(false);
  }
}

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F7F9FC] px-6">
      <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#13B2B3]/10">
          <MailCheck className="h-8 w-8 text-[#13B2B3]" />
        </div>

        <h1 className="mt-6 text-2xl font-bold text-slate-900">
          Check your email
        </h1>

        <p className="mt-3 text-sm text-slate-500">
          We sent a verification link to
        </p>

        <p className="mt-1 font-semibold text-slate-800">
          {emailFromQuery || "your email"}
        </p>

        <p className="mt-4 text-sm leading-6 text-slate-500">
          Click the link in the email to verify your address
          and activate your ClinicFlow account.
        </p>

        {!emailFromQuery && (
          <div className="mt-6 text-left">
            <label
              htmlFor="resend-email"
              className="text-sm font-medium text-slate-700"
            >
              Email address
            </label>

            <input
              id="resend-email"
              type="email"
              autoComplete="email"
              value={enteredEmail}
              onChange={(event) =>
                setEnteredEmail(event.target.value)
              }
              placeholder="you@example.com"
              className="mt-1.5 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-[#13B2B3] focus:ring-4 focus:ring-[#13B2B3]/10"
            />
          </div>
        )}

        <button
  type="button"
  onClick={handleResend}
  disabled={resending || !canResend}
  className="mt-6 w-full rounded-xl border border-[#13B2B3]/30 bg-white px-4 py-3 text-sm font-semibold text-[#13B2B3] transition hover:bg-[#13B2B3]/5 disabled:cursor-not-allowed disabled:opacity-60"
>
  {resending
    ? "Sending..."
    : "Resend verification email"}
</button>

{message && (
  <p
    className={`mt-4 text-sm ${
      messageIsError
        ? "text-red-600"
        : "text-slate-500"
    }`}
    role={messageIsError ? "alert" : "status"}
  >
    {message}
  </p>
)}

        <button
          type="button"
          onClick={() => navigate("/patient/login")}
          className="mt-8 w-full rounded-xl bg-[#13B2B3] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#109c9d]"
        >
          Back to sign in
        </button>
      </div>
    </div>
  );
}

export default PatientCheckEmailPage;