import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  CalendarDays,
  CalendarPlus,
  Clock3,
  DoorOpen,
  ListOrdered,
  MapPin,
  Stethoscope,
} from "lucide-react";

import { apiFetch } from "../lib/api";
import { socket } from "../socket";
import { usePatientAuth } from "../context/PatientAuthContext";
import { formatDoctorName } from "../utils/formatDoctorName";
import { clinicToday } from "../utils/clinicTime";
import {
  fetchWaitTimeSummary,
  formatClockTime,
  formatWaitRange,
  roundMinutes,
} from "../components/waittime/waitTimeFormat";
import type { WaitTimeSummary } from "../components/waittime/waitTimeTypes";
import ClinicVideoHero from "../components/ClinicVideoHero";
import { WaitSummaryStrip } from "../components/waittime/WaitTimeTiles";

/*
 * Patient portal home: the patient's own visit today (if
 * any), where they are in line, and their next booked
 * appointment. Only the patient's own information.
 */

type MyAppointment = {
  appointment_id: number;
  appointment_date: string;
  start_time: string | null;
  status: string;
  visit_type: "scheduled" | "walk_in";
  doctor_first_name: string | null;
  doctor_last_name: string | null;
  appointment_type_name: string | null;
};

type QueueRow = {
  appointment_id: number;
  status: string;
  is_current_patient?: boolean;
  doctor_first_name: string | null;
  doctor_last_name: string | null;
};

const dateKey = (value: string) => value.slice(0, 10);

// "2026-10-09" -> "Friday, October 9"
function formatDay(value: string) {
  const [year, month, day] = dateKey(value)
    .split("-")
    .map(Number);

  return new Date(year, month - 1, day).toLocaleDateString(
    "en-CA",
    { weekday: "long", month: "long", day: "numeric" },
  );
}

// "15:30:00" -> "3:30 PM" (booked times are clinic times)
function formatWallTime(value: string | null) {
  const match = value ? /^(\d{1,2}):(\d{2})/.exec(value) : null;

  if (!match) {
    return null;
  }

  const hours = Number(match[1]);

  return `${hours % 12 || 12}:${match[2]} ${hours >= 12 ? "PM" : "AM"}`;
}

function PatientDashboardPage() {
  const { patient } = usePatientAuth();

  const [appointments, setAppointments] = useState<MyAppointment[]>([]);
  const [myQueueRow, setMyQueueRow] = useState<QueueRow | null>(null);
  const [waitSummary, setWaitSummary] =
    useState<WaitTimeSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadSequence = useRef(0);

  async function load() {
    const requestId = ++loadSequence.current;

    try {
      const [appointmentsResponse, queueResponse, summary] =
        await Promise.all([
          apiFetch("/api/patient-auth/me/appointments"),
          apiFetch("/api/patient-queue/today"),
          fetchWaitTimeSummary().catch(() => null),
        ]);

      const appointmentsData = await appointmentsResponse.json();
      const queueData = await queueResponse.json();

      if (requestId !== loadSequence.current) {
        return;
      }

      if (!appointmentsResponse.ok) {
        throw new Error(
          appointmentsData.message ??
            "Unable to load your appointments.",
        );
      }

      setAppointments(appointmentsData.appointments ?? []);
      setMyQueueRow(
        queueResponse.ok && Array.isArray(queueData)
          ? ((queueData as QueueRow[]).find(
              (row) => row.is_current_patient,
            ) ?? null)
          : null,
      );
      setWaitSummary(summary);
      setError("");
    } catch (loadError) {
      if (requestId === loadSequence.current) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load your dashboard.",
        );
      }
    } finally {
      if (requestId === loadSequence.current) {
        setLoading(false);
      }
    }
  }

  useEffect(() => {
    void load();

    const handleUpdate = () => void load();

    socket.on("clinicflow:updated", handleUpdate);

    const interval = window.setInterval(() => {
      if (!document.hidden) {
        void load();
      }
    }, 60_000);

    return () => {
      window.clearInterval(interval);
      socket.off("clinicflow:updated", handleUpdate);
    };
  }, []);

  const today = clinicToday();

  // Today's booked visit not checked in yet.
  const todaysBooking =
    appointments.find(
      (appointment) =>
        dateKey(appointment.appointment_date) === today &&
        appointment.visit_type === "scheduled" &&
        appointment.status === "scheduled",
    ) ?? null;

  // Next booked visit after today's.
  const nextBooking =
    appointments
      .filter(
        (appointment) =>
          appointment.visit_type === "scheduled" &&
          appointment.status === "scheduled" &&
          dateKey(appointment.appointment_date) >= today &&
          appointment.appointment_id !==
            todaysBooking?.appointment_id,
      )
      .sort((a, b) =>
        `${dateKey(a.appointment_date)} ${a.start_time ?? ""}`.localeCompare(
          `${dateKey(b.appointment_date)} ${b.start_time ?? ""}`,
        ),
      )[0] ?? null;

  const myPrediction = waitSummary?.myPrediction ?? null;
  const expectedMinutes = roundMinutes(
    myPrediction?.expectedWaitMinutes,
  );
  const waitRange = formatWaitRange(
    myPrediction?.lowerWaitMinutes,
    myPrediction?.upperWaitMinutes,
  );
  const laterStart =
    myPrediction?.walkInBlock?.status === "later"
      ? formatClockTime(myPrediction.projectedStartAt)
      : null;

  const firstName = patient?.first_name ?? "";

  return (
    <section className="mx-auto w-full max-w-5xl space-y-6">
      <ClinicVideoHero />

      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">
          {firstName ? `Hi, ${firstName}` : "Welcome"}
        </h1>
        <p className="mt-1 text-slate-500">
          Your visits and your place in line, in one place.
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="h-40 animate-pulse rounded-2xl border border-slate-200 bg-white" />
      ) : (
        <TodayCard
          queueRow={myQueueRow}
          todaysBooking={todaysBooking}
          expectedMinutes={expectedMinutes}
          waitRange={waitRange}
          laterStart={laterStart}
          patientsAhead={myPrediction?.patientsAhead ?? null}
        />
      )}

      {/* Clinic-wide wait times today (no other patients' details). */}
      <div>
        <h2 className="mb-3 text-lg font-bold text-slate-900">
          Clinic wait times today
        </h2>
        <WaitSummaryStrip summary={waitSummary} loading={loading && !waitSummary} />
      </div>

      <div className="grid gap-4 md:grid-cols-[1.4fr_1fr]">
        {/* NEXT APPOINTMENT */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2 text-sm font-semibold text-[#13B2B3]">
            <CalendarDays size={17} />
            Next appointment
          </div>

          {loading ? (
            <div className="mt-4 h-16 animate-pulse rounded-xl bg-slate-100" />
          ) : nextBooking ? (
            <div className="mt-3">
              <p className="text-xl font-bold text-slate-950">
                {formatDay(nextBooking.appointment_date)}
                {formatWallTime(nextBooking.start_time) &&
                  ` at ${formatWallTime(nextBooking.start_time)}`}
              </p>
              <p className="mt-1 text-sm text-slate-500">
                {formatDoctorName(
                  nextBooking.doctor_first_name,
                  nextBooking.doctor_last_name,
                )}
                {nextBooking.appointment_type_name &&
                  ` · ${nextBooking.appointment_type_name}`}
              </p>
              <Link
                to="/patient/appointments"
                className="mt-4 inline-flex text-sm font-semibold text-[#13B2B3] hover:underline"
              >
                View or cancel
              </Link>
            </div>
          ) : (
            <div className="mt-3">
              <p className="font-semibold text-slate-700">
                No upcoming appointments.
              </p>
              <Link
                to="/patient/book"
                className="mt-4 inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
              >
                <CalendarPlus size={16} />
                Book an appointment
              </Link>
            </div>
          )}
        </div>

        {/* QUICK LINKS */}
        <div className="grid gap-3">
          <QuickLink
            to="/patient/book"
            icon={<CalendarPlus size={18} />}
            title="Book an appointment"
          />
          <QuickLink
            to="/patient/appointments"
            icon={<CalendarDays size={18} />}
            title="My appointments"
          />
          <QuickLink
            to="/patient/queue"
            icon={<ListOrdered size={18} />}
            title="Live queue"
          />
        </div>
      </div>
    </section>
  );
}

function TodayCard({
  queueRow,
  todaysBooking,
  expectedMinutes,
  waitRange,
  laterStart,
  patientsAhead,
}: {
  queueRow: QueueRow | null;
  todaysBooking: MyAppointment | null;
  expectedMinutes: number | null;
  waitRange: string | null;
  laterStart: string | null;
  patientsAhead: number | null;
}) {
  const doctor = queueRow
    ? formatDoctorName(
        queueRow.doctor_first_name,
        queueRow.doctor_last_name,
        "",
      )
    : "";

  // With the doctor.
  if (queueRow?.status === "roomed") {
    return (
      <StatusCard
        tone="blue"
        icon={<DoorOpen size={22} />}
        label="Today"
        title="You're in your visit"
        detail={doctor ? `With ${doctor}.` : undefined}
      />
    );
  }

  // Checked in and waiting.
  if (queueRow?.status === "checked_in") {
    const title = laterStart
      ? `You'll be seen at about ${laterStart}`
      : expectedMinutes === null
        ? "You're checked in"
        : expectedMinutes === 0
          ? "You're next"
          : `About ${expectedMinutes} min to wait`;

    const parts = [
      patientsAhead === null
        ? null
        : patientsAhead === 0
          ? "No one is ahead of you."
          : `${patientsAhead} ${patientsAhead === 1 ? "patient is" : "patients are"} ahead of you.`,
      !laterStart && expectedMinutes && waitRange
        ? `Likely between ${waitRange} minutes.`
        : null,
    ].filter(Boolean);

    return (
      <StatusCard
        tone="teal"
        icon={<Clock3 size={22} />}
        label="Today · Checked in"
        title={title}
        detail={parts.join(" ") || "The front desk will keep you updated."}
        link={{ to: "/patient/queue", label: "See the live queue" }}
      />
    );
  }

  // Walk-in on the list, not checked in.
  if (queueRow?.status === "scheduled") {
    return (
      <StatusCard
        tone="sky"
        icon={<MapPin size={22} />}
        label="Today · Walk-in"
        title="Please check in at the front desk"
        detail="You're on today's walk-in list. Your place in line appears once you're checked in."
      />
    );
  }

  // Booked for later today.
  if (todaysBooking) {
    const time = formatWallTime(todaysBooking.start_time);

    return (
      <StatusCard
        tone="teal"
        icon={<Stethoscope size={22} />}
        label="Today"
        title={time ? `Appointment at ${time}` : "Appointment today"}
        detail={`${formatDoctorName(
          todaysBooking.doctor_first_name,
          todaysBooking.doctor_last_name,
        )}. Please check in at the front desk when you arrive.`}
      />
    );
  }

  return (
    <StatusCard
      tone="slate"
      icon={<CalendarDays size={22} />}
      label="Today"
      title="No visit today"
      detail="When you arrive for a visit, your place in line will show here."
    />
  );
}

const TONES = {
  teal: "border-[#13B2B3]/25 bg-gradient-to-r from-[#F2FCFC] to-white text-[#13B2B3]",
  blue: "border-blue-200 bg-gradient-to-r from-blue-50 to-white text-blue-600",
  sky: "border-sky-200 bg-gradient-to-r from-sky-50 to-white text-sky-600",
  slate: "border-slate-200 bg-white text-slate-400",
};

function StatusCard({
  tone,
  icon,
  label,
  title,
  detail,
  link,
}: {
  tone: keyof typeof TONES;
  icon: React.ReactNode;
  label: string;
  title: string;
  detail?: string;
  link?: { to: string; label: string };
}) {
  return (
    <div className={`rounded-2xl border p-5 shadow-sm sm:p-6 ${TONES[tone]}`}>
      <div className="flex items-start gap-4">
        <div className="hidden h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white shadow-sm sm:flex">
          {icon}
        </div>

        <div className="min-w-0">
          <p className="text-sm font-semibold">{label}</p>
          <p className="mt-1 text-2xl font-bold tracking-tight text-slate-950">
            {title}
          </p>
          {detail && (
            <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">
              {detail}
            </p>
          )}
          {link && (
            <Link
              to={link.to}
              className="mt-3 inline-flex text-sm font-semibold text-[#13B2B3] hover:underline"
            >
              {link.label}
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

function QuickLink({
  to,
  icon,
  title,
}: {
  to: string;
  icon: React.ReactNode;
  title: string;
}) {
  return (
    <Link
      to={to}
      className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-4 text-sm font-semibold text-slate-800 shadow-sm transition hover:border-[#13B2B3]/40 hover:bg-[#13B2B3]/5"
    >
      <span className="text-[#13B2B3]">{icon}</span>
      {title}
    </Link>
  );
}

export default PatientDashboardPage;
