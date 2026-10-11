import { useEffect, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { Mail, MessageSquareText, Phone, UserRound } from "lucide-react";

import { apiFetch } from "../lib/api";

/*
 * Patient "My account" sections: contact details, email
 * and text messages. Name and date of birth are shown but
 * only staff can change them.
 */

type Profile = {
  first_name: string;
  last_name: string;
  date_of_birth: string | null;
  email: string;
  phone: string | null;
  address_line: string | null;
  city: string | null;
  province: string | null;
  postal_code: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  pending_email: string | null;
  sms_phone: string | null;
  sms_verified: boolean;
  sms_opt_in: boolean;
  sms_reminders: boolean;
  sms_booking_updates: boolean;
  sms_wait_updates: boolean;
  sms_stopped: boolean;
  sms_mode: "twilio" | "log";
};

const CONTACT_FIELDS = [
  ["phone", "Phone", "tel"],
  ["address_line", "Street address", "street-address"],
  ["city", "City", "address-level2"],
  ["province", "Province", "address-level1"],
  ["postal_code", "Postal code", "postal-code"],
  ["emergency_contact_name", "Emergency contact name", "off"],
  ["emergency_contact_phone", "Emergency contact phone", "off"],
] as const;

type ContactKey = (typeof CONTACT_FIELDS)[number][0];

async function send(url: string, method: string, body?: unknown) {
  const response = await apiFetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message ?? "Something went wrong.");
  }

  return data as { message: string };
}

const inputClass =
  "mt-1 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-[#13B2B3] focus:ring-4 focus:ring-[#13B2B3]/10";

function Card({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex items-center gap-2 font-bold text-slate-900">
        <span className="text-[#13B2B3]">{icon}</span>
        {title}
      </div>
      {children}
    </div>
  );
}

function Feedback({ message, error }: { message: string; error: string }) {
  return (
    <>
      {message && (
        <p className="rounded-xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-800">{message}</p>
      )}
      {error && (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
      )}
    </>
  );
}

function PatientProfileSection() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loadError, setLoadError] = useState("");

  async function load() {
    try {
      const response = await apiFetch("/api/patient-profile");
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? "Unable to load your profile.");
      setProfile(data as Profile);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Unable to load your profile.");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  if (loadError) {
    return <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{loadError}</p>;
  }

  if (!profile) {
    return <div className="h-48 animate-pulse rounded-2xl border border-slate-200 bg-white" />;
  }

  return (
    <>
      <ContactCard profile={profile} onSaved={load} />
      <EmailCard profile={profile} />
      <TextMessagesCard profile={profile} onChanged={load} />
    </>
  );
}

function ContactCard({ profile, onSaved }: { profile: Profile; onSaved: () => void }) {
  const [values, setValues] = useState<Record<ContactKey, string>>(() =>
    Object.fromEntries(CONTACT_FIELDS.map(([key]) => [key, profile[key] ?? ""])) as Record<ContactKey, string>,
  );
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    setError("");

    try {
      setMessage((await send("/api/patient-profile", "PATCH", values)).message);
      onSaved();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card icon={<UserRound size={18} />} title="Your details">
      <div className="grid gap-3 rounded-xl bg-slate-50 px-4 py-3 text-sm sm:grid-cols-2">
        <p>
          <span className="block text-xs font-semibold uppercase tracking-wide text-slate-400">Name</span>
          {profile.first_name} {profile.last_name}
        </p>
        <p>
          <span className="block text-xs font-semibold uppercase tracking-wide text-slate-400">Date of birth</span>
          {profile.date_of_birth ?? "—"}
        </p>
        <p className="text-xs text-slate-500 sm:col-span-2">
          To correct your name or date of birth, please contact the clinic.
        </p>
      </div>

      <form onSubmit={save} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          {CONTACT_FIELDS.map(([key, label, autoComplete]) => (
            <label
              key={key}
              className={`block text-sm font-semibold text-slate-700 ${key === "address_line" ? "sm:col-span-2" : ""}`}
            >
              {label}
              <input
                type={key.includes("phone") ? "tel" : "text"}
                autoComplete={autoComplete}
                value={values[key]}
                onChange={(event) => setValues((current) => ({ ...current, [key]: event.target.value }))}
                className={inputClass}
              />
            </label>
          ))}
        </div>

        <Feedback message={message} error={error} />

        <button
          type="submit"
          disabled={saving}
          className="rounded-xl bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save details"}
        </button>
      </form>
    </Card>
  );
}

function EmailCard({ profile }: { profile: Profile }) {
  const [newEmail, setNewEmail] = useState("");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    setError("");

    try {
      setMessage(
        (await send("/api/patient-profile/email", "POST", {
          new_email: newEmail.trim(),
          current_password: password,
        })).message,
      );
      setNewEmail("");
      setPassword("");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to change your email.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card icon={<Mail size={18} />} title="Email">
      <p className="text-sm text-slate-600">
        You sign in with <strong>{profile.email}</strong>. Sign-in codes are sent here.
      </p>

      {profile.pending_email && !message && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Waiting for you to confirm <strong>{profile.pending_email}</strong>. Check that inbox for the link.
        </p>
      )}

      <form onSubmit={save} className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-semibold text-slate-700">
          New email
          <input
            type="email"
            autoComplete="email"
            value={newEmail}
            onChange={(event) => setNewEmail(event.target.value)}
            className={inputClass}
          />
        </label>
        <label className="block text-sm font-semibold text-slate-700">
          Current password
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className={inputClass}
          />
        </label>

        <div className="space-y-3 sm:col-span-2">
          <Feedback message={message} error={error} />
          <button
            type="submit"
            disabled={saving || !newEmail || !password}
            className="rounded-xl bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50"
          >
            {saving ? "Sending..." : "Change email"}
          </button>
        </div>
      </form>
    </Card>
  );
}

function TextMessagesCard({ profile, onChanged }: { profile: Profile; onChanged: () => void }) {
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const active = profile.sms_verified && profile.sms_opt_in && !profile.sms_stopped;

  async function run(action: () => Promise<{ message: string }>, after?: () => void) {
    setBusy(true);
    setMessage("");
    setError("");

    try {
      setMessage((await action()).message);
      after?.();
      onChanged();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  const toggle = (key: "reminders" | "booking_updates" | "wait_updates", value: boolean) =>
    run(() => send("/api/patient-profile/sms", "PATCH", { [key]: value }));

  return (
    <Card icon={<MessageSquareText size={18} />} title="Text messages">
      <p className="text-sm text-slate-600">
        Get appointment reminders, booking confirmations and wait-time updates by text.
        Texts never include health details. Message and data rates may apply; reply STOP
        to any text to stop them.
      </p>

      {profile.sms_mode === "log" && (
        <p className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-xs text-slate-500">
          Test mode: texts are written to the server log instead of being sent.
        </p>
      )}

      {profile.sms_stopped && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          You replied STOP, so texts are paused. Reply START to {profile.sms_phone ?? "our number"} or confirm
          your number again below to turn them back on.
        </p>
      )}

      {profile.sms_verified && profile.sms_phone && (
        <div className="flex flex-col gap-3 rounded-xl border border-slate-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-center gap-2 text-sm text-slate-700">
            <Phone size={16} className="text-[#13B2B3]" />
            {profile.sms_phone} · {active ? "Texts on" : "Texts off"}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => run(() => send("/api/patient-profile/sms", "PATCH", { opt_in: !profile.sms_opt_in }))}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              {profile.sms_opt_in ? "Turn off" : "Turn on"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => run(() => send("/api/patient-profile/sms", "DELETE"))}
              className="rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-700 transition hover:bg-rose-50"
            >
              Remove number
            </button>
          </div>
        </div>
      )}

      {active && (
        <div className="space-y-2">
          {(
            [
              ["reminders", "Appointment reminders (the day before and 2 hours before)", profile.sms_reminders],
              ["booking_updates", "Booking confirmations, changes and cancellations", profile.sms_booking_updates],
              ["wait_updates", "Wait-time updates while you're at the clinic", profile.sms_wait_updates],
            ] as const
          ).map(([key, label, checked]) => (
            <label key={key} className="flex items-start gap-3 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={checked}
                disabled={busy}
                onChange={(event) => toggle(key, event.target.checked)}
                className="mt-0.5 accent-[#13B2B3]"
              />
              {label}
            </label>
          ))}
        </div>
      )}

      {(!profile.sms_verified || profile.sms_stopped) && (
        <div className="space-y-3">
          {!codeSent ? (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <label className="block flex-1 text-sm font-semibold text-slate-700">
                Mobile number
                <input
                  type="tel"
                  autoComplete="tel"
                  placeholder="416-555-1234"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  className={inputClass}
                />
              </label>
              <button
                type="button"
                disabled={busy || !phone}
                onClick={() =>
                  run(() => send("/api/patient-profile/sms/start", "POST", { phone }), () => setCodeSent(true))
                }
                className="rounded-xl bg-[#13B2B3] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#109c9d] disabled:opacity-50"
              >
                Text me a code
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <label className="block flex-1 text-sm font-semibold text-slate-700">
                Code from the text
                <input
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={code}
                  onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                  className={inputClass}
                />
              </label>
              <button
                type="button"
                disabled={busy || code.length !== 6}
                onClick={() =>
                  run(() => send("/api/patient-profile/sms/verify", "POST", { code }), () => {
                    setCodeSent(false);
                    setCode("");
                    setPhone("");
                  })
                }
                className="rounded-xl bg-[#13B2B3] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#109c9d] disabled:opacity-50"
              >
                Turn on texts
              </button>
              <button
                type="button"
                onClick={() => setCodeSent(false)}
                className="text-sm font-medium text-slate-500 hover:text-slate-800"
              >
                Use another number
              </button>
            </div>
          )}
        </div>
      )}

      <Feedback message={message} error={error} />
    </Card>
  );
}

export default PatientProfileSection;
