import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CalendarClock,
  CalendarOff,
  Copy,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";

import { apiFetch } from "../lib/api";
import { clinicToday } from "../utils/clinicTime";

/*
 * =========================================================
 * SCHEDULES (admin)
 * =========================================================
 *
 * Doctors' weekly hours (booked appointments, walk-ins,
 * blocked time such as lunch), how many booked patients
 * they take each day, and time off / clinic holidays.
 */

type BlockType = "scheduled" | "walk_in" | "blocked";

type Block = {
  start_time: string;
  end_time: string;
  block_type: BlockType;
  block_reason: string | null;
};

type DaySchedule = {
  day_of_week: number;
  blocks: Block[];
  settings: {
    scheduled_patient_capacity: number;
    booking_interval_minutes: number;
    max_long_visits_per_day: number | null;
  } | null;
};

type Doctor = {
  doctor_id: number;
  first_name: string;
  last_name: string;
  specialty: string | null;
};

type TimeOff = {
  time_off_id: number;
  doctor_id: number | null;
  doctor_name: string | null;
  start_date: string;
  end_date: string;
  start_time: string | null;
  end_time: string | null;
  reason: string | null;
};

type AffectedBooking = {
  appointment_id: number;
  appointment_date: string;
  start_time: string;
  doctor_name: string;
  patient_name: string;
  patient_phone: string | null;
};

// Monday first, as clinics usually read a week.
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];
const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

const BLOCK_TYPE_LABELS: Record<BlockType, string> = {
  scheduled: "Booked appointments",
  walk_in: "Walk-ins",
  blocked: "Blocked",
};

const BLOCK_REASONS: Record<string, string> = {
  lunch: "Lunch",
  catch_up: "Catch-up",
  meeting: "Meeting",
  paperwork: "Paperwork",
  offsite: "Offsite",
  other: "Other",
};

const BLOCK_STYLES: Record<BlockType, string> = {
  scheduled: "border-teal-200 bg-teal-50 text-teal-800",
  walk_in: "border-orange-200 bg-orange-50 text-orange-800",
  blocked: "border-slate-200 bg-slate-100 text-slate-600",
};

const INTERVALS = [5, 10, 15, 20, 30, 45, 60];

const toMinutes = (time: string) => {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
};

function formatTime(time: string) {
  const [h, m] = time.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}

function formatDate(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-CA", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function blockLabel(block: Block) {
  return block.block_type === "blocked"
    ? (BLOCK_REASONS[block.block_reason ?? "other"] ?? "Blocked")
    : BLOCK_TYPE_LABELS[block.block_type];
}

// Pairs of overlapping blocks in a day (old data entered by SQL).
function findOverlaps(blocks: Block[]) {
  const sorted = [...blocks].sort(
    (a, b) => toMinutes(a.start_time) - toMinutes(b.start_time),
  );

  return sorted.some(
    (block, index) =>
      index > 0 &&
      toMinutes(block.start_time) < toMinutes(sorted[index - 1].end_time),
  );
}

async function readJson(response: Response) {
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message ?? "Something went wrong.");
  }

  return data;
}

function SchedulePage() {
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [doctorId, setDoctorId] = useState<number | null>(null);
  const [week, setWeek] = useState<DaySchedule[] | null>(null);
  const [timeOff, setTimeOff] = useState<TimeOff[]>([]);
  const [outsideHours, setOutsideHours] = useState<AffectedBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState<{
    message: string;
    affected: AffectedBooking[];
  } | null>(null);

  const [editingDay, setEditingDay] = useState<DaySchedule | null>(null);
  const [addingTimeOff, setAddingTimeOff] = useState(false);

  const loadWeek = useCallback(async (id: number) => {
    const data = await readJson(
      await apiFetch(`/api/schedule/doctors/${id}/week`),
    );
    setWeek(data.days as DaySchedule[]);
  }, []);

  const loadTimeOff = useCallback(async () => {
    const [list, outside] = await Promise.all([
      apiFetch("/api/schedule/time-off").then(readJson),
      apiFetch("/api/schedule/bookings-outside-hours?days=90").then(readJson),
    ]);
    setTimeOff(list as TimeOff[]);
    setOutsideHours(outside as AffectedBooking[]);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const list = (await readJson(await apiFetch("/api/doctors"))) as Doctor[];
        setDoctors(list);
        setDoctorId(list[0]?.doctor_id ?? null);
        await loadTimeOff();
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Unable to load schedules.");
      } finally {
        setLoading(false);
      }
    })();
  }, [loadTimeOff]);

  useEffect(() => {
    if (doctorId === null) return;

    setWeek(null);
    loadWeek(doctorId).catch((loadError) =>
      setError(loadError instanceof Error ? loadError.message : "Unable to load the schedule."),
    );
  }, [doctorId, loadWeek]);

  const selectedDoctor = doctors.find((doctor) => doctor.doctor_id === doctorId) ?? null;

  async function afterChange(message: string, affected: AffectedBooking[]) {
    setNotice({ message, affected });
    setError("");
    if (doctorId !== null) await loadWeek(doctorId);
    await loadTimeOff();
  }

  async function removeTimeOff(item: TimeOff) {
    const who = item.doctor_name ?? "the whole clinic";
    if (!window.confirm(`Remove this time off for ${who}? Those hours become bookable again.`)) {
      return;
    }

    try {
      await readJson(
        await apiFetch(`/api/schedule/time-off/${item.time_off_id}`, { method: "DELETE" }),
      );
      await afterChange("Time off removed.", []);
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : "Unable to remove the time off.");
    }
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-[#13B2B3]">
            <CalendarClock size={18} />
            Schedules
          </div>
          <h1 className="text-2xl font-bold text-slate-950 sm:text-3xl">Doctor schedules</h1>
          <p className="mt-1 max-w-2xl text-slate-500">
            Weekly hours, lunch and blocked time, and time off. Changes apply straight
            away to booking, the calendar, walk-ins and wait estimates. Existing
            bookings are never moved; you'll see any that need a call.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setAddingTimeOff(true)}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
        >
          <CalendarOff size={17} />
          Add time off or holiday
        </button>
      </div>

      {error && (
        <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          <span className="flex-1">{error}</span>
          <button type="button" aria-label="Dismiss" onClick={() => setError("")}>
            <X size={16} />
          </button>
        </div>
      )}

      {notice && (
        <AffectedNotice
          message={notice.message}
          affected={notice.affected}
          onClose={() => setNotice(null)}
        />
      )}

      {outsideHours.length > 0 && !notice?.affected.length && (
        <AffectedNotice
          tone="warning"
          message={`${outsideHours.length} upcoming ${
            outsideHours.length === 1 ? "booking falls" : "bookings fall"
          } outside the doctor's hours. Contact these patients to move them.`}
          affected={outsideHours}
        />
      )}

      {/* WEEKLY HOURS */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-bold text-slate-900">Weekly hours</h2>
            <p className="text-sm text-slate-500">
              The same every week, unless there is time off.
            </p>
          </div>

          <select
            value={doctorId ?? ""}
            onChange={(event) => setDoctorId(Number(event.target.value))}
            disabled={loading || doctors.length === 0}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 outline-none focus:border-[#13B2B3]"
            aria-label="Doctor"
          >
            {doctors.map((doctor) => (
              <option key={doctor.doctor_id} value={doctor.doctor_id}>
                Dr. {doctor.first_name} {doctor.last_name}
              </option>
            ))}
          </select>
        </div>

        {!week ? (
          <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 7 }, (_, index) => (
              <div key={index} className="h-40 animate-pulse rounded-xl bg-slate-100" />
            ))}
          </div>
        ) : (
          <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-4">
            {WEEK_ORDER.map((dayOfWeek) => {
              const day = week[dayOfWeek];
              const overlaps = findOverlaps(day.blocks);
              const hasBooked = day.blocks.some((block) => block.block_type === "scheduled");

              return (
                <div
                  key={dayOfWeek}
                  className={`flex flex-col rounded-xl border p-4 ${
                    overlaps ? "border-amber-300 bg-amber-50/40" : "border-slate-200"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-bold text-slate-900">{DAY_NAMES[dayOfWeek]}</h3>
                    <button
                      type="button"
                      onClick={() => setEditingDay(day)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                    >
                      <Pencil size={13} />
                      Edit
                    </button>
                  </div>

                  {day.blocks.length === 0 ? (
                    <p className="mt-3 text-sm text-slate-400">Not working</p>
                  ) : (
                    <ul className="mt-3 space-y-1.5">
                      {day.blocks.map((block, index) => (
                        <li
                          key={index}
                          className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold ${BLOCK_STYLES[block.block_type]}`}
                        >
                          {formatTime(block.start_time)}–{formatTime(block.end_time)} ·{" "}
                          {blockLabel(block)}
                        </li>
                      ))}
                    </ul>
                  )}

                  {hasBooked && (
                    <p className="mt-3 text-xs text-slate-500">
                      {day.settings
                        ? `Up to ${day.settings.scheduled_patient_capacity} booked patients${
                            day.settings.max_long_visits_per_day !== null
                              ? ` (max ${day.settings.max_long_visits_per_day} long visits)`
                              : ""
                          } · times every ${day.settings.booking_interval_minutes} min`
                        : "No booking limit set. Booked appointments can't be made until you set one."}
                    </p>
                  )}

                  {overlaps && (
                    <p className="mt-2 flex items-start gap-1.5 text-xs font-medium text-amber-700">
                      <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                      Some blocks overlap. Edit this day to fix it.
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* TIME OFF */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="font-bold text-slate-900">Time off and holidays</h2>
          <p className="text-sm text-slate-500">
            Today and later. No bookings or walk-ins are offered during these times.
          </p>
        </div>

        {timeOff.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-slate-400">
            No upcoming time off.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {timeOff.map((item) => (
              <li
                key={item.time_off_id}
                className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="font-semibold text-slate-900">
                    {item.doctor_name ?? "Whole clinic closed"}
                  </p>
                  <p className="text-sm text-slate-500">
                    {item.start_date === item.end_date
                      ? formatDate(item.start_date)
                      : `${formatDate(item.start_date)} – ${formatDate(item.end_date)}`}
                    {" · "}
                    {item.start_time && item.end_time
                      ? `${formatTime(item.start_time)}–${formatTime(item.end_time)}`
                      : "All day"}
                    {item.reason && ` · ${item.reason}`}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => removeTimeOff(item)}
                  className="inline-flex items-center gap-1.5 self-start rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-700 transition hover:bg-rose-50 sm:self-auto"
                >
                  <Trash2 size={13} />
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {editingDay && selectedDoctor && (
        <DayEditor
          doctor={selectedDoctor}
          day={editingDay}
          week={week ?? []}
          onClose={() => setEditingDay(null)}
          onSaved={async (message, affected) => {
            setEditingDay(null);
            await afterChange(message, affected);
          }}
        />
      )}

      {addingTimeOff && (
        <TimeOffForm
          doctors={doctors}
          defaultDoctorId={doctorId}
          onClose={() => setAddingTimeOff(false)}
          onSaved={async (message, affected) => {
            setAddingTimeOff(false);
            await afterChange(message, affected);
          }}
        />
      )}
    </section>
  );
}

function AffectedNotice({
  message,
  affected,
  tone = "info",
  onClose,
}: {
  message: string;
  affected: AffectedBooking[];
  tone?: "info" | "warning";
  onClose?: () => void;
}) {
  const warn = tone === "warning" || affected.length > 0;

  return (
    <div
      className={`rounded-xl border px-4 py-3 text-sm ${
        warn ? "border-amber-200 bg-amber-50 text-amber-900" : "border-teal-200 bg-teal-50 text-teal-900"
      }`}
    >
      <div className="flex items-start gap-3">
        {warn && <AlertTriangle size={17} className="mt-0.5 shrink-0" />}
        <div className="min-w-0 flex-1">
          <p className="font-semibold">
            {message}
            {affected.length > 0 &&
              tone === "info" &&
              ` ${affected.length} upcoming ${
                affected.length === 1 ? "booking is" : "bookings are"
              } now outside the doctor's hours. Contact these patients to move them:`}
          </p>

          {affected.length > 0 && (
            <ul className="mt-2 space-y-1">
              {affected.slice(0, 20).map((booking) => (
                <li key={booking.appointment_id} className="text-xs">
                  {formatDate(booking.appointment_date)} at {formatTime(booking.start_time)} ·{" "}
                  {booking.patient_name}
                  {booking.patient_phone && ` (${booking.patient_phone})`} · {booking.doctor_name}
                </li>
              ))}
              {affected.length > 20 && (
                <li className="text-xs">…and {affected.length - 20} more.</li>
              )}
            </ul>
          )}
        </div>
        {onClose && (
          <button type="button" aria-label="Dismiss" onClick={onClose}>
            <X size={16} />
          </button>
        )}
      </div>
    </div>
  );
}

function DayEditor({
  doctor,
  day,
  week,
  onClose,
  onSaved,
}: {
  doctor: Doctor;
  day: DaySchedule;
  week: DaySchedule[];
  onClose: () => void;
  onSaved: (message: string, affected: AffectedBooking[]) => void;
}) {
  const [blocks, setBlocks] = useState<Block[]>(() =>
    day.blocks.map((block) => ({ ...block })),
  );
  const [capacity, setCapacity] = useState(
    String(day.settings?.scheduled_patient_capacity ?? ""),
  );
  const [bookingInterval, setBookingInterval] = useState(day.settings?.booking_interval_minutes ?? 15);
  const [longLimit, setLongLimit] = useState(
    day.settings?.max_long_visits_per_day == null
      ? ""
      : String(day.settings.max_long_visits_per_day),
  );
  const [copyTo, setCopyTo] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const hasBooked = blocks.some((block) => block.block_type === "scheduled");
  const overlaps = useMemo(() => findOverlaps(blocks), [blocks]);

  const bookedMinutes = blocks
    .filter((block) => block.block_type === "scheduled")
    .reduce(
      (total, block) => total + Math.max(toMinutes(block.end_time) - toMinutes(block.start_time), 0),
      0,
    );
  const suggestedLongLimit = Math.floor(bookedMinutes / 3 / 45);

  function update(index: number, change: Partial<Block>) {
    setBlocks((current) =>
      current.map((block, i) =>
        i === index
          ? {
              ...block,
              ...change,
              block_reason:
                (change.block_type ?? block.block_type) === "blocked"
                  ? (change.block_reason ?? block.block_reason ?? "lunch")
                  : null,
            }
          : block,
      ),
    );
  }

  function addBlock() {
    const last = [...blocks].sort(
      (a, b) => toMinutes(a.end_time) - toMinutes(b.end_time),
    )[blocks.length - 1];
    const start = last?.end_time ?? "09:00";
    const startMinutes = Math.min(toMinutes(start), 22 * 60);
    const end = startMinutes + 60;
    const pad = (n: number) => String(n).padStart(2, "0");

    setBlocks((current) => [
      ...current,
      {
        start_time: `${pad(Math.floor(startMinutes / 60))}:${pad(startMinutes % 60)}`,
        end_time: `${pad(Math.floor(end / 60))}:${pad(end % 60)}`,
        block_type: "scheduled",
        block_reason: null,
      },
    ]);
  }

  async function save() {
    setError("");

    if (overlaps) {
      setError("Some blocks overlap. Adjust the times so each block ends before the next starts.");
      return;
    }

    const capacityNumber = Number(capacity || 0);

    if (hasBooked && (!Number.isInteger(capacityNumber) || capacityNumber <= 0)) {
      setError("Set how many booked patients the doctor takes on this day.");
      return;
    }

    setSaving(true);

    try {
      const body = JSON.stringify({
        blocks,
        scheduled_patient_capacity: hasBooked ? capacityNumber : 0,
        booking_interval_minutes: bookingInterval,
        max_long_visits_per_day:
          hasBooked && longLimit.trim() !== "" ? Number(longLimit) : null,
      });

      const affected: AffectedBooking[] = [];

      for (const dayOfWeek of [day.day_of_week, ...copyTo]) {
        const data = await readJson(
          await apiFetch(`/api/schedule/doctors/${doctor.doctor_id}/days/${dayOfWeek}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body,
          }),
        );
        affected.push(...(data.affected_bookings ?? []));
      }

      const days = [day.day_of_week, ...copyTo].map((d) => DAY_NAMES[d]).join(", ");
      onSaved(`Dr. ${doctor.last_name}'s hours saved for ${days}.`, affected);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      data-dialog
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/40 p-4 backdrop-blur-[2px]"
    >
      <div className="flex max-h-[calc(100dvh-2rem)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-200 px-6 py-5">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#13B2B3]">
              Dr. {doctor.first_name} {doctor.last_name}
            </p>
            <h2 className="mt-1 text-xl font-bold text-slate-950">
              {DAY_NAMES[day.day_of_week]} hours
            </h2>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            disabled={saving}
            className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100"
          >
            <X size={18} />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
          {blocks.length === 0 && (
            <p className="rounded-xl bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
              Not working this day. Add a block to set hours.
            </p>
          )}

          <ul className="space-y-3">
            {blocks.map((block, index) => (
              <li
                key={index}
                className="grid grid-cols-2 gap-2 rounded-xl border border-slate-200 p-3 sm:grid-cols-[1fr_1fr_1.4fr_1fr_auto] sm:items-end"
              >
                <label className="text-xs font-semibold text-slate-500">
                  From
                  <input
                    type="time"
                    step={300}
                    value={block.start_time}
                    onChange={(event) => update(index, { start_time: event.target.value })}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm text-slate-900"
                  />
                </label>
                <label className="text-xs font-semibold text-slate-500">
                  To
                  <input
                    type="time"
                    step={300}
                    value={block.end_time}
                    onChange={(event) => update(index, { end_time: event.target.value })}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm text-slate-900"
                  />
                </label>
                <label className="text-xs font-semibold text-slate-500">
                  Used for
                  <select
                    value={block.block_type}
                    onChange={(event) =>
                      update(index, { block_type: event.target.value as BlockType })
                    }
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm text-slate-900"
                  >
                    {Object.entries(BLOCK_TYPE_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-xs font-semibold text-slate-500">
                  Reason
                  <select
                    value={block.block_reason ?? ""}
                    disabled={block.block_type !== "blocked"}
                    onChange={(event) => update(index, { block_reason: event.target.value })}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm text-slate-900 disabled:bg-slate-50 disabled:text-slate-300"
                  >
                    {block.block_type !== "blocked" && <option value="">—</option>}
                    {Object.entries(BLOCK_REASONS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  aria-label="Remove block"
                  onClick={() => setBlocks((current) => current.filter((_, i) => i !== index))}
                  className="col-span-2 inline-flex items-center justify-center gap-1.5 rounded-lg border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-50 sm:col-span-1"
                >
                  <Trash2 size={14} />
                  <span className="sm:hidden">Remove</span>
                </button>
              </li>
            ))}
          </ul>

          <button
            type="button"
            onClick={addBlock}
            className="inline-flex items-center gap-2 rounded-xl border border-dashed border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-[#13B2B3] hover:text-[#13B2B3]"
          >
            <Plus size={16} />
            Add block
          </button>

          {overlaps && (
            <p className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              Some blocks overlap. Each block must end before the next one starts.
            </p>
          )}

          {hasBooked && (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm font-semibold text-slate-700">
                Booked patients per day
                <input
                  type="number"
                  min={1}
                  max={200}
                  value={capacity}
                  onChange={(event) => setCapacity(event.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
                />
              </label>
              <label className="text-sm font-semibold text-slate-700">
                Booking times every
                <select
                  value={bookingInterval}
                  onChange={(event) => setBookingInterval(Number(event.target.value))}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"
                >
                  {INTERVALS.map((minutes) => (
                    <option key={minutes} value={minutes}>
                      {minutes} minutes
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm font-semibold text-slate-700 sm:col-span-2">
                Long visits (45+ min) per day
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    max={50}
                    placeholder="No limit"
                    value={longLimit}
                    onChange={(event) => setLongLimit(event.target.value)}
                    className="w-32 rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setLongLimit(String(suggestedLongLimit))}
                    className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                  >
                    Use suggested ({suggestedLongLimit})
                  </button>
                </div>
                <span className="mt-1 block text-xs font-normal text-slate-500">
                  Suggested keeps about ⅓ of booked time for complex visits and
                  the rest for 15- and 30-minute visits. Leave empty for no limit.
                </span>
              </label>
            </div>
          )}

          <div>
            <p className="flex items-center gap-2 text-sm font-semibold text-slate-700">
              <Copy size={15} />
              Also use these hours on
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {WEEK_ORDER.filter((d) => d !== day.day_of_week).map((dayOfWeek) => {
                const checked = copyTo.includes(dayOfWeek);
                const replacing = (week[dayOfWeek]?.blocks.length ?? 0) > 0;

                return (
                  <label
                    key={dayOfWeek}
                    className={`inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-semibold ${
                      checked ? "border-[#13B2B3] bg-[#13B2B3]/10 text-[#0d8587]" : "border-slate-200 text-slate-600"
                    }`}
                    title={replacing ? "Replaces that day's current hours" : undefined}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() =>
                        setCopyTo((current) =>
                          checked ? current.filter((d) => d !== dayOfWeek) : [...current, dayOfWeek],
                        )
                      }
                      className="accent-[#13B2B3]"
                    />
                    {DAY_NAMES[dayOfWeek].slice(0, 3)}
                  </label>
                );
              })}
            </div>
            {copyTo.length > 0 && (
              <p className="mt-2 text-xs text-slate-500">
                This replaces the current hours on the days you tick.
              </p>
            )}
          </div>

          {error && (
            <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
              {error}
            </p>
          )}
        </div>

        <div className="flex shrink-0 justify-end gap-3 border-t border-slate-200 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="rounded-xl bg-[#13B2B3] px-5 py-2.5 text-sm font-bold text-white transition hover:bg-[#0f9b9c] disabled:opacity-60"
          >
            {saving ? "Saving..." : "Save hours"}
          </button>
        </div>
      </div>
    </div>
  );
}

function TimeOffForm({
  doctors,
  defaultDoctorId,
  onClose,
  onSaved,
}: {
  doctors: Doctor[];
  defaultDoctorId: number | null;
  onClose: () => void;
  onSaved: (message: string, affected: AffectedBooking[]) => void;
}) {
  const today = clinicToday();
  const [who, setWho] = useState<string>(
    defaultDoctorId !== null ? String(defaultDoctorId) : "clinic",
  );
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [allDay, setAllDay] = useState(true);
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("12:00");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    setError("");
    setSaving(true);

    try {
      const data = await readJson(
        await apiFetch("/api/schedule/time-off", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            doctor_id: who === "clinic" ? null : Number(who),
            start_date: startDate,
            end_date: endDate,
            start_time: allDay ? null : startTime,
            end_time: allDay ? null : endTime,
            reason: reason.trim() || null,
          }),
        }),
      );

      const doctor = doctors.find((d) => String(d.doctor_id) === who);
      onSaved(
        doctor ? `Time off added for Dr. ${doctor.last_name}.` : "Clinic closure added.",
        data.affected_bookings ?? [],
      );
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to add the time off.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      data-dialog
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/40 p-4 backdrop-blur-[2px]"
    >
      <div className="max-h-[calc(100dvh-2rem)] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-5">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#13B2B3]">
              Time off
            </p>
            <h2 className="mt-1 text-xl font-bold text-slate-950">Add time off or holiday</h2>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            disabled={saving}
            className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100"
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4 px-6 py-5">
          <label className="block text-sm font-semibold text-slate-700">
            Who
            <select
              value={who}
              onChange={(event) => setWho(event.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"
            >
              <option value="clinic">Whole clinic (holiday / closed)</option>
              {doctors.map((doctor) => (
                <option key={doctor.doctor_id} value={doctor.doctor_id}>
                  Dr. {doctor.first_name} {doctor.last_name}
                </option>
              ))}
            </select>
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-semibold text-slate-700">
              From
              <input
                type="date"
                min={today}
                value={startDate}
                onChange={(event) => {
                  setStartDate(event.target.value);
                  if (endDate < event.target.value) setEndDate(event.target.value);
                }}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
              />
            </label>
            <label className="text-sm font-semibold text-slate-700">
              To
              <input
                type="date"
                min={startDate}
                value={endDate}
                onChange={(event) => setEndDate(event.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
              />
            </label>
          </div>

          <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
            <input
              type="checkbox"
              checked={allDay}
              onChange={(event) => setAllDay(event.target.checked)}
              className="accent-[#13B2B3]"
            />
            All day
          </label>

          {!allDay && (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm font-semibold text-slate-700">
                From
                <input
                  type="time"
                  step={300}
                  value={startTime}
                  onChange={(event) => setStartTime(event.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
                />
              </label>
              <label className="text-sm font-semibold text-slate-700">
                To
                <input
                  type="time"
                  step={300}
                  value={endTime}
                  onChange={(event) => setEndTime(event.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
                />
              </label>
              <p className="text-xs text-slate-500 sm:col-span-2">
                These hours are taken off on every day in the range.
              </p>
            </div>
          )}

          <label className="block text-sm font-semibold text-slate-700">
            Reason (optional)
            <input
              type="text"
              maxLength={200}
              value={reason}
              placeholder="e.g. Thanksgiving, conference, vacation"
              onChange={(event) => setReason(event.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
            />
          </label>

          {error && (
            <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
              {error}
            </p>
          )}
        </div>

        <div className="flex justify-end gap-3 border-t border-slate-200 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="rounded-xl bg-slate-950 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-slate-800 disabled:opacity-60"
          >
            {saving ? "Saving..." : "Add time off"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default SchedulePage;
