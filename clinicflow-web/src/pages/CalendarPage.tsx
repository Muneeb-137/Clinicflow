import { apiFetch } from "../lib/api";
import { useEffect, useMemo, useRef, useState } from "react";
import { useClinicFlowRefresh } from "../hooks/useClinicFlowRefresh";
import { useNavigate } from "react-router-dom";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ArrowRight,
  CalendarClock,
  X,
} from "lucide-react";

type CalendarSummaryRow = {
  doctor_id: number;
  first_name: string;
  last_name: string;
  specialty: string | null;

  slot_date: string;

  total_slots: number;
  booked_slots: number;
  patient_booking_slots: number;

  walk_in_start_time: string | null;
  walk_in_end_time: string | null;
};

type NextAvailableDoctor = {
  doctor_id: number;
  first_name: string;
  last_name: string;
  specialty: string | null;

  next_available_date: string | null;
  next_available_time: string | null;
};

type WalkInScheduleDoctor = {
  doctor_id: number;
  first_name: string;
  last_name: string;
  specialty: string | null;

  schedule_date: string;

  walk_in_start_time: string | null;
  walk_in_end_time: string | null;
};


type AppointmentSlot = {
  slot_id: number;
  doctor_id: number;
  slot_date: string;
  start_time: string;
  end_time: string;
  slot_type: "scheduled" | "walk_in" | "flexible";
  // past: already over. full: no bookings left that day.
  slot_status: "available" | "booked" | "blocked" | "past" | "full";
  // Lunch, meeting... (blocked hours only)
  blocked_reason?: string | null;
};

const BLOCK_REASON_LABELS: Record<string, string> = {
  lunch: "Lunch",
  catch_up: "Catch-up time",
  meeting: "Meeting",
  paperwork: "Paperwork",
  offsite: "Offsite",
  time_off: "Time off",
  other: "Blocked time",
};

type SelectedDoctorSchedule = {
  doctorId: number;
  firstName: string;
  lastName: string;
  specialty: string;
  date: string;
};



type CalendarDay = {
  date: string;
  dayName: string;
  shortDate: string;
  fullLabel: string;
};

function formatDateForApi(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function getStartOfWeek(date: Date) {
  const result = new Date(date);
  const day = result.getDay();

  const differenceToMonday = day === 0 ? -6 : 1 - day;

  result.setDate(result.getDate() + differenceToMonday);
  result.setHours(0, 0, 0, 0);

  return result;
}

function addDays(date: Date, numberOfDays: number) {
  const result = new Date(date);
  result.setDate(result.getDate() + numberOfDays);

  return result;
}

function createCalendarDays(weekStart: Date): CalendarDay[] {
  return Array.from({ length: 7 }, (_, index) => {
    const date = addDays(weekStart, index);

    return {
      date: formatDateForApi(date),

      dayName: date.toLocaleDateString("en-CA", {
        weekday: "short",
      }),

      shortDate: date.toLocaleDateString("en-CA", {
        month: "short",
        day: "numeric",
      }),

      fullLabel: date.toLocaleDateString("en-CA", {
        weekday: "long",
        month: "long",
        day: "numeric",
      }),
    };
  });
}

function formatTime(time: string | null) {
  if (!time) {
    return "No openings";
  }

  const [hourString, minuteString] = time.split(":");

  const hour = Number(hourString);
  const minute = minuteString ?? "00";

  const period = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 || 12;

  return `${displayHour}:${minute} ${period}`;
}

function getCapacityStatus(
  patientBookingSlots: number,
  bookedSlots: number,
) {
  const patientCapacity =
    patientBookingSlots + bookedSlots;

  if (patientCapacity === 0) {
    return {
      label: "No schedule",
      className:
        "border-slate-200 bg-slate-50 text-slate-600",
      dotClassName: "bg-slate-400",
    };
  }

  const bookedPercentage =
    (bookedSlots / patientCapacity) * 100;

  if (patientBookingSlots === 0) {
    return {
      label: "Fully booked",
      className:
        "border-rose-200 bg-rose-50 text-rose-700",
      dotClassName: "bg-rose-500",
    };
  }

  if (bookedPercentage >= 75) {
    return {
      label: "Almost full",
      className:
        "border-orange-200 bg-orange-50 text-orange-700",
      dotClassName: "bg-orange-500",
    };
  }

  if (bookedPercentage >= 40) {
    return {
      label: "Filling up",
      className:
        "border-amber-200 bg-amber-50 text-amber-700",
      dotClassName: "bg-amber-500",
    };
  }

  return {
    label: "Plenty available",
    className:
      "border-emerald-200 bg-emerald-50 text-[emerald-700]",
    dotClassName: "bg-emerald-500",
  };
}

function formatScheduleDate(date: string) {
  return new Date(`${date}T00:00:00`).toLocaleDateString(
    "en-CA",
    {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    },
  );
}

function formatSlotType(slot: AppointmentSlot) {
  if (slot.slot_status === "blocked") {
    return (
      BLOCK_REASON_LABELS[slot.blocked_reason ?? ""] ?? "Blocked Time"
    );
  }

  if (slot.slot_status === "past") {
    return slot.slot_type === "walk_in" ? "Walk-In Hours" : "Past";
  }

  if (slot.slot_status === "full") {
    return "Day Fully Booked";
  }

  if (slot.slot_status === "booked") {
    return "Booked Appointment";
  }

  if (slot.slot_type === "walk_in") {
    return "Walk-In Reserved";
  }

  return "Available Appointment";
}

function getSlotBadge(slot: AppointmentSlot) {
  if (slot.slot_status === "past") {
    return {
      label: "Past",
      className: "bg-slate-50 text-slate-400",
      dotClassName: "bg-slate-300",
    };
  }

  if (slot.slot_status === "full") {
    return {
      label: "Full",
      className: "bg-amber-50 text-amber-700",
      dotClassName: "bg-amber-500",
    };
  }

  if (slot.slot_status === "blocked") {
    return {
      label: "Blocked",
      className: "bg-slate-100 text-slate-700",
      dotClassName: "bg-slate-500",
    };
  }

  if (slot.slot_status === "booked") {
    return {
      label: "Booked",
      className: "bg-blue-50 text-blue-700",
      dotClassName: "bg-blue-500",
    };
  }

  if (slot.slot_type === "walk_in") {
    return {
      label: "Walk-In",
      className: "bg-orange-50 text-orange-700",
      dotClassName: "bg-orange-500",
    };
  }

  return {
    label: "Available",
    className: "bg-teal-50 text-teal-700",
    dotClassName: "bg-teal-500",
  };
}

type DoctorDayScheduleProps = {
  doctorId: number;
  doctorName: string;
  date: string;
};

function DoctorDaySchedule({
  doctorId,
  doctorName,
  date,
}: DoctorDayScheduleProps) {
  const navigate = useNavigate();
  const [slots, setSlots] = useState<AppointmentSlot[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const loadDoctorSchedule = async () => {
      try {
        setIsLoading(true);
        setError("");

        const response = await apiFetch(
          `/api/doctors/${doctorId}/slots?date=${date}`,
        );

        const responseData = await response.json();

        if (!response.ok) {
          throw new Error(
            responseData.message ||
              "Unable to load the physician schedule.",
          );
        }

        setSlots(responseData as AppointmentSlot[]);
      } catch (error) {
        console.error(
          "Error loading physician schedule:",
          error,
        );

        setSlots([]);

        setError(
          error instanceof Error
            ? error.message
            : "Something went wrong while loading the schedule.",
        );
      } finally {
        setIsLoading(false);
      }
    };

    void loadDoctorSchedule();
  }, [doctorId, date]);

  const bookedCount = slots.filter(
    (slot) => slot.slot_status === "booked",
  ).length;

  const availableCount = slots.filter(
    (slot) =>
      slot.slot_status === "available" &&
      slot.slot_type === "scheduled",
  ).length;

  

  const blockedCount = slots.filter(
    (slot) => slot.slot_status === "blocked",
  ).length;

  if (isLoading) {
    return (
      <div className="flex min-h-[320px] items-center justify-center">
        <div className="text-center">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-[#13B2B3]" />

          <p className="mt-4 text-sm font-medium text-slate-500">
            Loading physician schedule...
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm font-medium text-rose-700">
        {error}
      </div>
    );
  }

  if (slots.length === 0) {
    return (
      <div className="flex min-h-[280px] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 text-center">
        <CalendarClock
          size={34}
          className="text-slate-400"
        />

        <h3 className="mt-4 font-bold text-slate-900">
          No schedule available
        </h3>

        <p className="mt-1 max-w-sm text-sm leading-6 text-slate-500">
          This physician does not have any appointment
          slots configured for this date.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="grid gap-3 sm:grid-cols-3">
        <article className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3">
          <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-blue-600">
            Booked
          </p>

          <p className="mt-1 text-2xl font-bold text-blue-800">
            {bookedCount}
          </p>
        </article>

        <article className="rounded-2xl border border-teal-100 bg-teal-50 px-4 py-3">
          <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-teal-600">
            Available
          </p>

          <p className="mt-1 text-2xl font-bold text-teal-800">
            {availableCount}
          </p>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
          <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-slate-500">
            Blocked
          </p>

          <p className="mt-1 text-2xl font-bold text-slate-800">
            {blockedCount}
          </p>
        </article>
      </div>

      <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200">
        <div className="grid grid-cols-[105px_1fr_auto] items-center border-b border-slate-200 bg-slate-50 px-4 py-3">
          <p className="text-xs font-bold uppercase tracking-[0.1em] text-slate-500">
            Time
          </p>

          <p className="text-xs font-bold uppercase tracking-[0.1em] text-slate-500">
            Schedule
          </p>

          <p className="text-xs font-bold uppercase tracking-[0.1em] text-slate-500">
            Status
          </p>
        </div>

        <div className="divide-y divide-slate-100">
          {slots.map((slot) => {
            const badge = getSlotBadge(slot);

            return (
              <div
                key={slot.slot_id}
                className="grid grid-cols-[105px_1fr_auto] items-center gap-3 px-4 py-3 transition hover:bg-slate-50"
              >
                <div>
                  <p className="text-sm font-bold text-slate-900">
                    {formatTime(slot.start_time)}
                  </p>

                  <p className="mt-0.5 text-[10px] text-slate-400">
                    to {formatTime(slot.end_time)}
                  </p>
                </div>

                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-800">
                    {formatSlotType(slot)}
                  </p>

                  <p className="mt-0.5 text-xs text-slate-500">
                    {slot.slot_status === "booked"
                      ? "A patient appointment occupies this time."
                      : slot.slot_status === "past"
                        ? "This time has already passed."
                        : slot.slot_status === "full"
                          ? "The physician's booking limit for this day has been reached."
                          : slot.slot_status === "blocked"
                        ? "This time is unavailable for bookings."
                        : slot.slot_type === "walk_in"
                          ? "Reserved for an in-clinic walk-in."
                          : "Available for a regular patient appointment."}
                  </p>
                </div>

               <div className="flex items-center justify-end gap-2">
                <span
                  className={[
                    "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold",
                    badge.className,
                  ].join(" ")}
                >
                  <span
                    className={[
                      "h-1.5 w-1.5 rounded-full",
                      badge.dotClassName,
                    ].join(" ")}
                  />

                  {badge.label}
                </span>

                {slot.slot_status === "available" &&
                  slot.slot_type !== "walk_in" && (
                    <button
                      type="button"
                      onClick={() => {
                        navigate("/appointments/book", {
                          state: {
                            calendarBooking: {
                              doctorId,
                              doctorName,
                              date,
                              startTime: slot.start_time,
                              slotId: slot.slot_id,
                            },
                          },
                        });
                      }}
                      className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-xl bg-[#13B2B3] px-3 py-2 text-xs font-bold text-white transition hover:bg-[#0f9b9c]"
                    >
                      Book Appointment
                      <ArrowRight size={13} />
                    </button>
                  )}
              </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function CalendarPage() {
  const [weekStart, setWeekStart] = useState(() =>
    getStartOfWeek(new Date()),
  );

  const [summaryRows, setSummaryRows] = useState<
    CalendarSummaryRow[]
  >([]);

  const [nextAvailableDoctors, setNextAvailableDoctors] =
    useState<NextAvailableDoctor[]>([]);

    const [nextAvailableDate, setNextAvailableDate] =
  useState(() => formatDateForApi(new Date()));

  const [walkInDate, setWalkInDate] =
    useState(() => formatDateForApi(new Date()));

  const [walkInSchedule, setWalkInSchedule] =
    useState<WalkInScheduleDoctor[]>([]);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const [
  selectedDoctorSchedule,
  setSelectedDoctorSchedule,
] = useState<SelectedDoctorSchedule | null>(null);

  const calendarDays = useMemo(
    () => createCalendarDays(weekStart),
    [weekStart],
  );

  const weekEnd = useMemo(
    () => addDays(weekStart, 6),
    [weekStart],
  );

  const doctors = useMemo(() => {
    const doctorMap = new Map<
      number,
      {
        doctorId: number;
        firstName: string;
        lastName: string;
        specialty: string;
      }
    >();

    summaryRows.forEach((row) => {
      doctorMap.set(row.doctor_id, {
        doctorId: row.doctor_id,
        firstName: row.first_name,
        lastName: row.last_name,
        specialty:
          row.specialty ?? "Family Physician",
      });
    });

    return Array.from(doctorMap.values());
  }, [summaryRows]);

  const rowsByDoctorAndDate = useMemo(() => {
    const rowMap = new Map<
      string,
      CalendarSummaryRow
    >();

    summaryRows.forEach((row) => {
      const normalizedDate = row.slot_date.slice(0, 10);

      rowMap.set(
        `${row.doctor_id}-${normalizedDate}`,
        row,
      );
    });

    return rowMap;
  }, [summaryRows]);

 

/*
 * Find the busiest scheduled day
 * in the currently selected week.
 */
type BusiestDay = {
  date: string;
  booked: number;
  capacity: number;
  percentage: number;
};

const busiestDay = useMemo<BusiestDay | null>(() => {
  const totalsByDate = new Map<
    string,
    {
      booked: number;
      capacity: number;
    }
  >();

  for (const row of summaryRows) {
    const date = row.slot_date.slice(0, 10);

    const current = totalsByDate.get(date) ?? {
      booked: 0,
      capacity: 0,
    };

    current.booked += row.booked_slots;

    current.capacity +=
      row.booked_slots +
      row.patient_booking_slots;

    totalsByDate.set(date, current);
  }

  let result: BusiestDay | null = null;

  for (const [date, totals] of totalsByDate) {
    if (totals.capacity === 0) {
      continue;
    }

    const percentage =
      (totals.booked / totals.capacity) * 100;

    if (
      result === null ||
      percentage > result.percentage
    ) {
      result = {
        date,
        booked: totals.booked,
        capacity: totals.capacity,
        percentage,
      };
    }
  }

  return result;
}, [summaryRows]);

  const liveVersion = useClinicFlowRefresh();

  const loadedWeekKeyRef = useRef("");

  useEffect(() => {
    const loadCalendarSummary = async () => {
      try {
        const startDate = formatDateForApi(weekStart);
        const endDate = formatDateForApi(weekEnd);

        // Show the spinner when the week changes, not on
        // live-update refreshes of the same week.
        const weekKey = `${startDate}:${endDate}`;

        if (loadedWeekKeyRef.current !== weekKey) {
          setIsLoading(true);
        }

        setError("");

        const response = await apiFetch(
          `/api/calendar/summary?startDate=${startDate}&endDate=${endDate}`,
        );

        const responseData = await response.json();

        if (!response.ok) {
          throw new Error(
            responseData.message ||
              "Unable to load weekly calendar.",
          );
        }

        setSummaryRows(
          responseData as CalendarSummaryRow[],
        );

        loadedWeekKeyRef.current = weekKey;
      } catch (error) {
        console.error(
          "Error loading weekly calendar:",
          error,
        );

        setSummaryRows([]);

        setError(
          error instanceof Error
            ? error.message
            : "Something went wrong while loading the weekly calendar.",
        );
      } finally {
        setIsLoading(false);
      }
    };

    void loadCalendarSummary();
  }, [weekStart, weekEnd, liveVersion]);

  useEffect(() => {
  const loadNextAvailable = async () => {
    try {
      const response = await apiFetch(
        `/api/calendar/next-available?date=${nextAvailableDate}`,
      );

      const responseData = await response.json();

      if (!response.ok) {
        throw new Error(
          responseData.message ||
            "Unable to load next availability.",
        );
      }

      setNextAvailableDoctors(
        responseData as NextAvailableDoctor[],
      );
    } catch (error) {
      console.error(
        "Error loading next availability:",
        error,
      );

      setNextAvailableDoctors([]);
    }
  };

  void loadNextAvailable();
}, [nextAvailableDate, liveVersion]);

useEffect(() => {
  const loadWalkInSchedule = async () => {
    try {
      const response = await apiFetch(
        `/api/calendar/walk-in-schedule?date=${walkInDate}`,
      );

      const responseData = await response.json();

      if (!response.ok) {
        throw new Error(
          responseData.message ||
            "Unable to load walk-in schedule.",
        );
      }

      setWalkInSchedule(
        responseData as WalkInScheduleDoctor[],
      );
    } catch (error) {
      console.error(
        "Error loading walk-in schedule:",
        error,
      );

      setWalkInSchedule([]);
    }
  };

  void loadWalkInSchedule();
}, [walkInDate]);



  useEffect(() => {
  if (!selectedDoctorSchedule) {
    return;
  }

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      setSelectedDoctorSchedule(null);
    }
  };

  const previousOverflow = document.body.style.overflow;

  document.body.style.overflow = "hidden";
  window.addEventListener("keydown", handleKeyDown);

  return () => {
    document.body.style.overflow = previousOverflow;
    window.removeEventListener("keydown", handleKeyDown);
  };
}, [selectedDoctorSchedule]);

  const goToPreviousWeek = () => {
    setWeekStart((currentWeekStart) =>
      addDays(currentWeekStart, -7),
    );
  };

  const goToNextWeek = () => {
    setWeekStart((currentWeekStart) =>
      addDays(currentWeekStart, 7),
    );
  };

  const goToCurrentWeek = () => {
    setWeekStart(getStartOfWeek(new Date()));
  };

  return (
    <section className="mx-auto w-full max-w-[1600px] space-y-3">
      <header className="rounded-3xl border border-slate-200 bg-white px-6 py-4 shadow-sm">
  <div className="flex items-center gap-3">
    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#13B2B3]/10 text-[#13B2B3]">
      <CalendarDays size={24} />
    </div>

    <div>
      <h1 className="text-2xl font-bold text-slate-950">
        Clinic Calendar
      </h1>

      <p className="mt-1 text-sm text-slate-500">
        Review physician availability, scheduled capacity and clinic demand.
      </p>
    </div>
  </div>
</header>

      <div className="flex items-end justify-between gap-4 px-1">
  <div>
    <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#13B2B3]">
      Daily Availability
    </p>

    <h2 className="mt-1 text-xl font-bold text-slate-950">
      Physician availability by date
    </h2>

    <p className="mt-1 text-sm text-slate-500">
      Check scheduled appointment openings and walk-in hours for specific dates.
    </p>
  </div>
</div>
      
      

      <div className="grid gap-4 lg:grid-cols-2">
 {/* Next Available */}
<article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
  <div className="flex items-start justify-between gap-4">
    <div>
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
        Next Available
      </p>

      <p className="mt-1 text-sm text-slate-500">
        Next appointment available on selected date
      </p>
    </div>

    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-[#13B2B3]">
      <CalendarClock size={19} />
    </div>
  </div>

  <div className="mt-4 border-y border-slate-100 py-3">
    <label
      htmlFor="next-available-date"
      className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.1em] text-slate-500"
    >
      Appointment Date
    </label>

    <input
      id="next-available-date"
      type="date"
      value={nextAvailableDate}
      onChange={(event) =>
        setNextAvailableDate(event.target.value)
      }
      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700 outline-none transition focus:border-[#13B2B3] focus:bg-white focus:ring-4 focus:ring-teal-100"
    />
  </div>

  <div className="mt-4 space-y-3">
    {nextAvailableDoctors.length === 0 ? (
      <p className="text-sm text-slate-500">
        No physician availability for this date.
      </p>
    ) : (
      nextAvailableDoctors.map((doctor) => (
        <div
          key={doctor.doctor_id}
          className="flex items-center justify-between gap-3"
        >
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-slate-900">
              Dr. {doctor.first_name} {doctor.last_name}
            </p>

            <p className="truncate text-xs text-slate-500">
              {doctor.specialty ?? "Family Physician"}
            </p>
          </div>

          <div className="shrink-0 text-right">
            {doctor.next_available_time ? (
              <p className="text-sm font-bold text-[#13B2B3]">
                {formatTime(
                  doctor.next_available_time,
                )}
              </p>
            ) : (
              <p className="text-xs font-semibold text-slate-400">
                No openings
              </p>
            )}
          </div>
        </div>
      ))
    )}
  </div>
</article>

 {/* Walk-In Schedule */}
<article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
  <div>
    <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
      Walk-In Schedule
    </p>

    <p className="mt-1 text-sm text-slate-500">
      Physician walk-in hours on selected date
    </p>
  </div>

  <div className="mt-4 border-y border-slate-100 py-3">
    <label
      htmlFor="walk-in-date"
      className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.1em] text-slate-500"
    >
      Walk-In Date
    </label>

    <input
      id="walk-in-date"
      type="date"
      value={walkInDate}
      onChange={(event) =>
        setWalkInDate(event.target.value)
      }
      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700 outline-none transition focus:border-[#13B2B3] focus:bg-white focus:ring-4 focus:ring-teal-100"
    />
  </div>

  <div className="mt-4 space-y-3">
    {walkInSchedule.length === 0 ? (
      <p className="text-sm text-slate-500">
        No physician walk-in schedules for this date.
      </p>
    ) : (
      walkInSchedule.map((doctor) => (
        <div
          key={doctor.doctor_id}
          className="flex items-center justify-between gap-3"
        >
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-slate-900">
              Dr. {doctor.first_name} {doctor.last_name}
            </p>

            <p className="truncate text-xs text-slate-500">
              {doctor.specialty ?? "Family Physician"}
            </p>
          </div>

          <div className="shrink-0">
            {doctor.walk_in_start_time &&
            doctor.walk_in_end_time ? (
              <span className="inline-flex rounded-lg bg-orange-50 px-2.5 py-1.5 text-xs font-bold text-orange-700">
                {formatTime(
                  doctor.walk_in_start_time,
                )}
                {" – "}
                {formatTime(
                  doctor.walk_in_end_time,
                )}
              </span>
            ) : (
              <span className="text-xs font-semibold text-slate-400">
                No walk-ins
              </span>
            )}
          </div>
        </div>
      ))
    )}
  </div>
</article>
</div>

  <div className="mt-8">
  <div className="flex flex-col gap-4 px-1 lg:flex-row lg:items-end lg:justify-between">
    <div>
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#13B2B3]">
        Weekly Schedule
      </p>

      <h2 className="mt-1 text-xl font-bold text-slate-950">
        Scheduled capacity
      </h2>

      <p className="mt-1 text-sm text-slate-500">
        Review scheduled patient capacity and clinic demand across the selected week.
      </p>
    </div>

    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={goToCurrentWeek}
        className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 transition hover:border-[#13B2B3] hover:text-[#13B2B3]"
      >
        Today
      </button>

      <button
        type="button"
        onClick={goToPreviousWeek}
        aria-label="Previous week"
        className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:border-[#13B2B3] hover:text-[#13B2B3]"
      >
        <ChevronLeft size={19} />
      </button>

      <div className="min-w-[220px] rounded-xl border border-slate-200 bg-white px-4 py-2 text-center">
        <p className="text-sm font-bold text-slate-900">
          {weekStart.toLocaleDateString("en-CA", {
            month: "short",
            day: "numeric",
          })}
          {" – "}
          {weekEnd.toLocaleDateString("en-CA", {
            month: "short",
            day: "numeric",
            year: "numeric",
          })}
        </p>
      </div>

      <button
        type="button"
        onClick={goToNextWeek}
        aria-label="Next week"
        className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:border-[#13B2B3] hover:text-[#13B2B3]"
      >
        <ChevronRight size={19} />
      </button>
    </div>
  </div>
</div>

<article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
  <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
    <div className="shrink-0">
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
        Busiest Day
      </p>

      <p className="mt-1 text-sm text-slate-500">
        Highest scheduled utilization this week
      </p>
    </div>

    {busiestDay ? (
      <div className="flex flex-1 flex-col gap-4 lg:flex-row lg:items-center lg:justify-end">
        <div className="lg:min-w-[170px]">
          <p className="text-lg font-bold text-slate-950">
            {new Date(
              `${busiestDay.date}T00:00:00`,
            ).toLocaleDateString("en-CA", {
              weekday: "long",
            })}
          </p>

          <p className="mt-0.5 text-sm text-slate-500">
            {new Date(
              `${busiestDay.date}T00:00:00`,
            ).toLocaleDateString("en-CA", {
              month: "short",
              day: "numeric",
            })}
          </p>
        </div>

        <div className="w-full max-w-md">
          <div className="mb-2 flex items-center justify-between gap-4">
            <p className="text-xs font-medium text-slate-500">
              {busiestDay.booked} of{" "}
              {busiestDay.capacity} scheduled patient spaces booked
            </p>

            <p className="text-xl font-bold text-[#13B2B3]">
              {Math.round(busiestDay.percentage)}%
            </p>
          </div>

          <div className="h-2 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-[#13B2B3] transition-all"
              style={{
                width: `${Math.min(
                  busiestDay.percentage,
                  100,
                )}%`,
              }}
            />
          </div>
        </div>
      </div>
    ) : (
      <p className="text-sm text-slate-500">
        No scheduled capacity this week.
      </p>
    )}
  </div>
</article>

      {error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm font-medium text-rose-700">
          {error}
        </div>
      )}

      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        {isLoading ? (
          <div className="flex min-h-[420px] items-center justify-center">
            <div className="text-center">
              <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-[#13B2B3]" />

              <p className="mt-4 text-sm font-medium text-slate-500">
                Loading weekly calendar...
              </p>
            </div>
          </div>
        ) : (
          <div className="overflow-hidden">
            <div className="w-full">
              <div className="grid grid-cols-[210px_repeat(7,minmax(0,1fr))] border-b border-slate-200 bg-slate-50">
                <div className="flex items-center px-5 py-4">
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
                    Physicians
                  </p>
                </div>

                {calendarDays.map((day) => {
                  const isToday =
                    day.date ===
                    formatDateForApi(new Date());

                  return (
                    <div
                      key={day.date}
                      className={[
                        "border-l border-slate-200 px-3 py-4 text-center",
                        isToday
                          ? "bg-[#13B2B3]/10"
                          : "",
                      ].join(" ")}
                    >
                      <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">
                        {day.dayName}
                      </p>

                      <p
                        className={[
                          "mt-1 text-sm font-bold",
                          isToday
                            ? "text-[#13B2B3]"
                            : "text-slate-900",
                        ].join(" ")}
                      >
                        {day.shortDate}
                      </p>
                    </div>
                  );
                })}
              </div>

              {doctors.map((doctor) => (
                <div
                  key={doctor.doctorId}
                  className="grid grid-cols-[210px_repeat(7,minmax(0,1fr))] border-b border-slate-200 last:border-b-0"
                >
                  <div className="flex items-center gap-3 bg-white px-5 py-4">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#13B2B3]/10 text-sm font-bold text-[#13B2B3]">
                      {doctor.firstName.charAt(0)}
                      {doctor.lastName.charAt(0)}
                    </div>

                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-slate-950">
                        Dr. {doctor.firstName}{" "}
                        {doctor.lastName}
                      </p>

                      <p className="mt-0.5 truncate text-xs text-slate-500">
                        {doctor.specialty}
                      </p>
                    </div>
                  </div>

                  {calendarDays.map((day) => {
                    const row = rowsByDoctorAndDate.get(
                      `${doctor.doctorId}-${day.date}`,
                    );

                    const patientBookingSlots =
                      row?.patient_booking_slots ?? 0;

                    const bookedSlots =
                      row?.booked_slots ?? 0;

                   

                    const status = getCapacityStatus(
                      patientBookingSlots,
                      bookedSlots,
                    );

                    const patientCapacity =
                      patientBookingSlots + bookedSlots;

                    const bookingPercentage =
                      patientCapacity > 0
                        ? Math.round(
                            (bookedSlots /
                              patientCapacity) *
                              100,
                          )
                        : 0;

                    return (
                      <div
                        key={day.date}
                         className="group min-w-0 border-l border-slate-200 px-2.5 py-4 text-left transition hover:bg-slate-50"

                      >
                        <div
                          className={[
                            "inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[10px] font-bold",
                            status.className,
                          ].join(" ")}
                        >
                          <span
                            className={[
                              "h-1.5 w-1.5 rounded-full",
                              status.dotClassName,
                            ].join(" ")}
                          />

                          {status.label}
                        </div>

                        <div className="mt-3 flex items-end justify-between gap-2">
                          <div>
                            <p className="text-lg font-bold text-slate-950">
                              {bookedSlots}
                              <span className="text-sm font-medium text-slate-400">
                                /{patientCapacity}
                              </span>
                            </p>

                            <p className="text-[11px] font-medium text-slate-500">
                              patient slots booked
                            </p>
                          </div>

                          <p className="text-xs font-bold text-[#13B2B3]">
                            {bookingPercentage}%
                          </p>
                        </div>

                        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
                          <div
                            className="h-full rounded-full bg-[#13B2B3] transition-all"
                            style={{
                              width: `${Math.min(
                                bookingPercentage,
                                100,
                              )}%`,
                            }}
                          />
                        </div>

                        <div className="mt-3 text-[11px]">
                          <div className="rounded-lg bg-teal-50 px-2 py-1.5">
                            <p className="font-bold text-teal-700">
                              {patientBookingSlots}
                            </p>

                            <p className="text-slate-500">
                              available
                            </p>
                          </div>
                        </div>
                        <button
                        type="button"
                        onClick={() => {
                            setSelectedDoctorSchedule({
                            doctorId: doctor.doctorId,
                            firstName: doctor.firstName,
                            lastName: doctor.lastName,
                            specialty: doctor.specialty,
                            date: day.date,
                            });
                        }}
                        className="group/view mt-3 flex w-full items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-slate-200 bg-white px-2 py-2.5 text-[10px] font-bold text-slate-600 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-[#13B2B3] hover:bg-teal-50 hover:text-[#13B2B3] hover:shadow-md focus:outline-none focus:ring-4 focus:ring-teal-100"
                        >
                        <span className="flex items-center gap-2">
                            <CalendarClock size={14} />
                            View Schedule
                        </span>
                        </button>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

       {/* Doctor Schedule Modal */}
      {selectedDoctorSchedule && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-slate-950/45 px-4 py-6 backdrop-blur-[3px]"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setSelectedDoctorSchedule(null);
            }
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="doctor-day-schedule-title"
            className="flex w-full max-w-4xl flex-col rounded-[28px] border border-white/70 bg-white shadow-2xl max-h-[calc(100dvh-2rem)] overflow-y-auto"
          >
            <header className="flex items-start justify-between border-b border-slate-200 px-6 py-5">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#13B2B3]">
                  Physician Day Schedule
                </p>

                <h2
                  id="doctor-day-schedule-title"
                  className="mt-1 text-2xl font-bold text-slate-950"
                >
                  Dr. {selectedDoctorSchedule.firstName}{" "}
                  {selectedDoctorSchedule.lastName}
                </h2>

                <p className="mt-1 text-sm text-slate-500">
                  {selectedDoctorSchedule.specialty}
                </p>

                <p className="mt-3 text-sm font-semibold text-[#13B2B3]">
                  {formatScheduleDate(
                    selectedDoctorSchedule.date,
                  )}
                </p>
              </div>

              <button
                type="button"
                onClick={() =>
                  setSelectedDoctorSchedule(null)
                }
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 transition hover:bg-rose-50 hover:text-rose-600"
              >
                <X size={20} />
              </button>
            </header>

            <div className="overflow-y-auto p-6">
              <DoctorDaySchedule
                doctorId={selectedDoctorSchedule.doctorId}
                doctorName={`${selectedDoctorSchedule.firstName} ${selectedDoctorSchedule.lastName}`}
                date={selectedDoctorSchedule.date}
              />
            </div>
          </section>
        </div>
      )}
    </section>
  );
}

export default CalendarPage;