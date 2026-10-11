import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { MailCheck } from "lucide-react";

import type { TwoStepChallenge } from "../types/auth";

/*
 * Second sign-in step, shared by the staff, doctor and
 * patient login pages: enter the 6-digit code that was
 * emailed, optionally trust this device for 30 days.
 */
type TwoStepFormProps = {
  challenge: TwoStepChallenge;
  // Resolves when signed in; throws with a message.
  onVerify: (code: string, trustDevice: boolean) => Promise<void>;
  // Resolves with the (masked) email the new code went to.
  onResend: () => Promise<string>;
  onCancel: () => void;
};

const RESEND_WAIT_SECONDS = 30;

function TwoStepForm({ challenge, onVerify, onResend, onCancel }: TwoStepFormProps) {
  const [code, setCode] = useState("");
  const [trustDevice, setTrustDevice] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [emailHint, setEmailHint] = useState(challenge.emailHint);
  const [resendIn, setResendIn] = useState(RESEND_WAIT_SECONDS);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = window.setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [resendIn]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();

    if (!/^\d{6}$/.test(code)) {
      setError("Enter the 6-digit code from the email.");
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      await onVerify(code, trustDevice);
    } catch (verifyError) {
      setError(verifyError instanceof Error ? verifyError.message : "That code didn't work.");
      setCode("");
      inputRef.current?.focus();
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResend() {
    setError("");
    setInfo("");

    try {
      const hint = await onResend();
      setEmailHint(hint);
      setInfo("A new code is on its way. The previous code no longer works.");
      setResendIn(RESEND_WAIT_SECONDS);
    } catch (resendError) {
      setError(resendError instanceof Error ? resendError.message : "Couldn't send a new code.");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="flex items-start gap-3 rounded-2xl border border-[#13B2B3]/20 bg-[#13B2B3]/5 px-4 py-3">
        <MailCheck size={20} className="mt-0.5 shrink-0 text-[#13B2B3]" />
        <p className="text-sm leading-6 text-slate-700">
          We emailed a 6-digit code to <strong>{emailHint}</strong>. It expires in 10 minutes.
        </p>
      </div>

      <div>
        <label htmlFor="two-step-code" className="mb-2 block text-sm font-medium text-slate-700">
          Sign-in code
        </label>
        <input
          ref={inputRef}
          id="two-step-code"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          value={code}
          onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
          placeholder="123456"
          className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3.5 text-center text-2xl font-semibold tracking-[0.5em] text-slate-900 outline-none transition focus:border-[#13B2B3] focus:ring-4 focus:ring-[#13B2B3]/10"
        />
      </div>

      <label className="flex items-start gap-3 text-sm text-slate-600">
        <input
          type="checkbox"
          checked={trustDevice}
          onChange={(event) => setTrustDevice(event.target.checked)}
          className="mt-1 accent-[#13B2B3]"
        />
        <span>
          Trust this device for 30 days
          <span className="block text-xs text-slate-400">
            Don't tick this on a shared or public computer.
          </span>
        </span>
      </label>

      {info && (
        <p className="rounded-xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-800">{info}</p>
      )}

      {error && (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-xl bg-[#13B2B3] px-4 py-3.5 text-sm font-semibold text-white transition hover:bg-[#109c9d] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submitting ? "Checking..." : "Verify and sign in"}
      </button>

      <div className="flex items-center justify-between text-sm">
        <button
          type="button"
          onClick={handleResend}
          disabled={resendIn > 0}
          className="font-medium text-[#13B2B3] hover:underline disabled:cursor-default disabled:text-slate-400 disabled:no-underline"
        >
          {resendIn > 0 ? `Send a new code in ${resendIn}s` : "Send a new code"}
        </button>
        <button type="button" onClick={onCancel} className="font-medium text-slate-500 hover:text-slate-800">
          Use a different account
        </button>
      </div>
    </form>
  );
}

export default TwoStepForm;
