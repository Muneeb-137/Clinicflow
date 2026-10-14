import { useMemo } from "react";
import { BellRing, CheckCircle2, ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";

import { Card, CardHeader } from "../components/ui/Card";
import { StatusBadge, type StatusTone } from "../components/ui/StatusBadge";
import { CLINIC_TIME_ZONE } from "../utils/clinicTime";
import type { QueueAppointment } from "../types/appointment";

// A booked patient this many minutes past their start time
// without arriving is flagged as late.
const LATE_AFTER_MINUTES = 10;

// A checked-in patient waiting this long is flagged.
const LONG_WAIT_MINUTES = 30;

const MAX_ITEMS = 6;

type AttentionItem = {
  key: string;
  tone: StatusTone;
  label: string;
  patient: string;
  detail: string;
  priority: number;
};

// Minutes since midnight, clinic time.
function clinicMinutesNow(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: CLINIC_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);

  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? 0);
  return hour * 60 + minute;
}

// "14:30:00" -> minutes since midnight.
function wallTimeMinutes(value: string | null) {
  if (!value) return null;
  const [hour, minute] = value.split(":").map(Number);
  return Number.isFinite(hour) && Number.isFinite(minute)
    ? hour * 60 + minute
    : null;
}

// "14:30:00" -> "2:30 PM".
function formatWallTime(value: string) {
  const minutes = wallTimeMinutes(value);
  if (minutes === null) return value;
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  const suffix = hour >= 12 ? "PM" : "AM";
  return `${hour % 12 || 12}:${String(minute).padStart(2, "0")} ${suffix}`;
}

/*
 * Patients the front desk should act on now, built only
 * from today's flow: booked patients running late, people
 * who arrived but aren't checked in, long waits, and
 * intake forms still pending.
 */
function NeedsAttentionPanel({
  appointments,
  projectedDoctorNames = {},
  loading,
  error,
}: {
  appointments: QueueAppointment[];
  // appointment_id -> "Dr. First Last" for patients not
  // yet assigned a doctor (same as the Live Queue).
  projectedDoctorNames?: Record<string, string>;
  loading: boolean;
  error: string;
}) {
  const items = useMemo(() => {
    const nowMinutes = clinicMinutesNow();
    const list: AttentionItem[] = [];

    for (const appointment of appointments) {
      const patient = `${appointment.patient_first_name} ${appointment.patient_last_name}`;
      const waited = Number(appointment.waiting_minutes) || 0;

      if (appointment.status === "scheduled" && appointment.arrived_at) {
        list.push({
          key: `${appointment.appointment_id}-arrived`,
          tone: "info",
          label: "Check in",
          patient,
          detail: "Arrived, not checked in yet",
          priority: 2,
        });
        continue;
      }

      if (
        appointment.status === "scheduled" &&
        appointment.visit_type === "scheduled" &&
        appointment.start_time
      ) {
        const start = wallTimeMinutes(appointment.start_time);
        if (start !== null && nowMinutes - start >= LATE_AFTER_MINUTES) {
          list.push({
            key: `${appointment.appointment_id}-late`,
            tone: "warning",
            label: "Late",
            patient,
            detail: `Booked ${formatWallTime(appointment.start_time)} · ${
              nowMinutes - start
            } min late`,
            priority: 3,
          });
        }
        continue;
      }

      if (appointment.status === "checked_in") {
        if (waited >= LONG_WAIT_MINUTES) {
          list.push({
            key: `${appointment.appointment_id}-wait`,
            tone: "danger",
            label: "Long wait",
            patient,
            detail: `Waiting ${Math.round(waited)} min · ${
              appointment.doctor_last_name
                ? `Dr. ${appointment.doctor_last_name}`
                : projectedDoctorNames[appointment.appointment_id]
                  ? `Projected: ${projectedDoctorNames[appointment.appointment_id]}`
                  : "Next available doctor"
            }`,
            priority: 1,
          });
        }

        if (appointment.forms_status === "pending") {
          list.push({
            key: `${appointment.appointment_id}-forms`,
            tone: "warning",
            label: "Forms",
            patient,
            detail: "Intake forms not completed",
            priority: 4,
          });
        }
      }
    }

    return list.sort((a, b) => a.priority - b.priority);
  }, [appointments, projectedDoctorNames]);

  const shown = items.slice(0, MAX_ITEMS);

  return (
    <Card className="flex h-full flex-col">
      <CardHeader
        icon={<BellRing size={18} />}
        title="Needs attention"
        description="Patients to act on now."
        action={
          !loading && items.length > 0 ? (
            <StatusBadge tone="warning">{items.length}</StatusBadge>
          ) : null
        }
      />

      <div className="mt-4 flex-1">
        {loading ? (
          <div className="space-y-2">
            {[0, 1, 2].map((index) => (
              <div key={index} className="h-14 animate-pulse rounded-control bg-slate-100" />
            ))}
          </div>
        ) : error ? (
          <p className="rounded-control border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
            {error}
          </p>
        ) : shown.length === 0 ? (
          <div className="flex h-full min-h-[160px] flex-col items-center justify-center rounded-control border border-dashed border-slate-200 text-center">
            <CheckCircle2 size={26} className="text-emerald-500" />
            <p className="mt-2 font-semibold text-slate-800">All clear</p>
            <p className="text-sm text-slate-500">
              Nothing needs attention right now.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {shown.map((item) => (
              <li key={item.key} className="flex items-center gap-3 py-2.5">
                <div className="w-[6.5rem] shrink-0">
                  <StatusBadge tone={item.tone} dot>
                    {item.label}
                  </StatusBadge>
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-900">
                    {item.patient}
                  </p>
                  <p className="truncate text-xs text-slate-500">{item.detail}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {!loading && !error && (
        <Link
          to="/queue/current"
          className="mt-4 inline-flex items-center gap-1 self-start text-sm font-semibold text-brand-700 hover:underline"
        >
          {items.length > MAX_ITEMS
            ? `See all ${items.length} in the live queue`
            : "Open live queue"}
          <ChevronRight size={16} />
        </Link>
      )}
    </Card>
  );
}

export default NeedsAttentionPanel;
