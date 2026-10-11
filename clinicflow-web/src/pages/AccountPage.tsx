import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { KeyRound, LogOut, ShieldCheck, UserRound } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { apiFetch } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { usePatientAuth } from "../context/PatientAuthContext";
import PatientProfileSection from "../components/PatientProfileSection";

/*
 * "My account" for every portal: who you are signed in
 * as, change password, and sign out on every device.
 */
type AccountPageProps = {
  portal: "staff" | "patient";
};

const MIN_LENGTH = 8;

function AccountPage({ portal }: AccountPageProps) {
  const navigate = useNavigate();
  const { staff, logout: staffLogout } = useAuth();
  const { patient, logout: patientLogout } = usePatientAuth();

  const api = portal === "patient" ? "/api/patient-auth" : "/api/auth";
  const user = portal === "patient" ? patient : staff;
  const signInPath =
    portal === "patient"
      ? "/patient/login"
      : staff?.role === "doctor"
        ? "/doctor/login"
        : "/login/staff";

  const [security, setSecurity] = useState<{
    open_sessions: number;
    trusted_devices: number;
  } | null>(null);

  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function loadSecurity() {
    try {
      const response = await apiFetch(`${api}/security`);
      if (response.ok) setSecurity(await response.json());
    } catch {
      // Optional information.
    }
  }

  useEffect(() => {
    void loadSecurity();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api]);

  async function changePassword(event: FormEvent) {
    event.preventDefault();
    setMessage("");
    setError("");

    if (next.length < MIN_LENGTH) {
      setError(`Use at least ${MIN_LENGTH} characters for the new password.`);
      return;
    }

    if (next !== confirm) {
      setError("The new passwords don't match.");
      return;
    }

    setSaving(true);

    try {
      const response = await apiFetch(`${api}/change-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ current_password: current, new_password: next }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message ?? "Unable to change the password.");
      }

      setMessage(data.message);
      setCurrent("");
      setNext("");
      setConfirm("");
      await loadSecurity();
    } catch (changeError) {
      setError(changeError instanceof Error ? changeError.message : "Unable to change the password.");
    } finally {
      setSaving(false);
    }
  }

  async function signOutEverywhere() {
    if (
      !window.confirm(
        "Sign out on every device, including this one? Trusted devices will need a sign-in code again.",
      )
    ) {
      return;
    }

    try {
      await apiFetch(`${api}/logout-everywhere`, { method: "POST" });
    } finally {
      if (portal === "patient") patientLogout();
      else staffLogout();
      navigate(signInPath, { replace: true });
    }
  }

  const inputClass =
    "mt-1 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-[#13B2B3] focus:ring-4 focus:ring-[#13B2B3]/10";

  return (
    <section className="mx-auto w-full max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-950 sm:text-3xl">My account</h1>
        <p className="mt-1 text-slate-500">
          {portal === "patient"
            ? "Your details, notifications and sign-in security."
            : "Your sign-in details and security."}
        </p>
      </div>

      {/* WHO */}
      <div className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#13B2B3]/10 text-[#13B2B3]">
          <UserRound size={22} />
        </div>
        <div className="min-w-0">
          <p className="font-semibold text-slate-900">
            {user ? `${user.first_name} ${user.last_name}` : "—"}
          </p>
          <p className="truncate text-sm text-slate-500">{user?.email}</p>
          {staff && portal === "staff" && (
            <p className="mt-0.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
              {staff.role === "admin"
                ? "Administrator"
                : staff.role === "doctor"
                  ? "Physician"
                  : "Receptionist"}
            </p>
          )}
        </div>
      </div>

      {/* Patients: contact details, email, text messages. */}
      {portal === "patient" && <PatientProfileSection />}

      {/* PASSWORD */}
      <form
        onSubmit={changePassword}
        className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"
      >
        <div className="flex items-center gap-2 font-bold text-slate-900">
          <KeyRound size={18} className="text-[#13B2B3]" />
          Change password
        </div>

        <label className="block text-sm font-semibold text-slate-700">
          Current password
          <input
            type="password"
            autoComplete="current-password"
            value={current}
            onChange={(event) => setCurrent(event.target.value)}
            className={inputClass}
          />
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-semibold text-slate-700">
            New password
            <input
              type="password"
              autoComplete="new-password"
              value={next}
              onChange={(event) => setNext(event.target.value)}
              className={inputClass}
            />
          </label>
          <label className="block text-sm font-semibold text-slate-700">
            Confirm new password
            <input
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
              className={inputClass}
            />
          </label>
        </div>

        <p className="text-xs text-slate-400">
          At least {MIN_LENGTH} characters. Changing it signs you out on your other devices.
        </p>

        {message && (
          <p className="rounded-xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-800">
            {message}
          </p>
        )}
        {error && (
          <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
        )}

        <button
          type="submit"
          disabled={saving || !current || !next}
          className="rounded-xl bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50"
        >
          {saving ? "Saving..." : "Change password"}
        </button>
      </form>

      {/* SIGN-INS */}
      <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex items-center gap-2 font-bold text-slate-900">
          <ShieldCheck size={18} className="text-[#13B2B3]" />
          Sign-in security
        </div>

        <ul className="space-y-1.5 text-sm text-slate-600">
          <li>Two-step sign-in is on: a code is emailed to you when you sign in on a new device.</li>
          {security && (
            <>
              <li>
                Signed in on {security.open_sessions}{" "}
                {security.open_sessions === 1 ? "device" : "devices"} right now.
              </li>
              <li>
                {security.trusted_devices === 0
                  ? "No trusted devices."
                  : `${security.trusted_devices} trusted ${
                      security.trusted_devices === 1 ? "device skips" : "devices skip"
                    } the code for 30 days.`}
              </li>
            </>
          )}
        </ul>

        <button
          type="button"
          onClick={signOutEverywhere}
          className="inline-flex items-center gap-2 rounded-xl border border-rose-200 px-4 py-2.5 text-sm font-semibold text-rose-700 transition hover:bg-rose-50"
        >
          <LogOut size={16} />
          Sign out on all devices
        </button>
        <p className="text-xs text-slate-400">
          Use this if you signed in on a shared computer or think someone else knows your
          password. It also forgets all trusted devices.
        </p>
      </div>
    </section>
  );
}

export default AccountPage;
