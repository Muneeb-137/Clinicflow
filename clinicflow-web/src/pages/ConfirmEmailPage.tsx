import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CheckCircle2, XCircle } from "lucide-react";

import AuthBrandPanel from "../components/AuthBrandPanel";
import { apiFetch } from "../lib/api";

/*
 * Opened from the "confirm your new email" link.
 */
function ConfirmEmailPage() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const [state, setState] = useState<{ ok: boolean; message: string } | null>(null);
  const started = useRef(false);

  useEffect(() => {
    // Run once (the link works only once).
    if (started.current) return;
    started.current = true;

    if (!token) {
      setState({ ok: false, message: "This link is incomplete." });
      return;
    }

    (async () => {
      try {
        const response = await apiFetch("/api/patient-profile/email/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        const data = await response.json();
        setState({ ok: response.ok, message: data.message ?? "Something went wrong." });
      } catch (error) {
        setState({ ok: false, message: error instanceof Error ? error.message : "Something went wrong." });
      }
    })();
  }, [token]);

  return (
    <div className="min-h-screen bg-[#F7F9FC] lg:grid lg:grid-cols-[0.9fr_1.1fr]">
      <AuthBrandPanel />

      <section className="flex items-center justify-center px-6 py-12 sm:px-10 lg:px-16">
        <div className="w-full max-w-md rounded-[28px] border border-slate-200/80 bg-white p-8 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
          <h1 className="text-2xl font-bold text-slate-950">Confirm your email</h1>

          {!state ? (
            <p className="mt-4 text-sm text-slate-500">Confirming...</p>
          ) : (
            <div className="mt-4 flex items-start gap-3">
              {state.ok ? (
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[#13B2B3]" />
              ) : (
                <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-rose-500" />
              )}
              <p className="text-sm leading-6 text-slate-700">{state.message}</p>
            </div>
          )}

          <Link
            to="/patient/login"
            className="mt-6 block w-full rounded-xl bg-[#13B2B3] px-4 py-3.5 text-center text-sm font-semibold text-white transition hover:bg-[#109c9d]"
          >
            Go to sign in
          </Link>
        </div>
      </section>
    </div>
  );
}

export default ConfirmEmailPage;
