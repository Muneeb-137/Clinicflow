import { useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Check,
  Clock3,
  Info,
  LoaderCircle,
} from "lucide-react";



type DateTimeStepProps = {
  selectedDate: string;
  selectedTime: string;
  durationMinutes: number;

  availableTimes: string[];
  selectedTimeIsHeld: boolean;
  // The doctor's long (45+ min) visits are full that day.
  longVisitLimitReached?: boolean;

  isLoadingSlots: boolean;
  slotsError: string;

  onDateSelect: (date: string) => void;
  onTimeSelect: (time: string) => void;
  onBack: () => void;
  onContinue: () => void;
};

function getTodayDate() {
  const today = new Date();

  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function formatSelectedDate(dateValue: string) {
  if (!dateValue) {
    return "No date selected";
  }

  const date = new Date(`${dateValue}T12:00:00`);

  // An unexpected value must not crash the page
  // (Intl throws on invalid dates).
  if (Number.isNaN(date.getTime())) {
    return dateValue;
  }

  return new Intl.DateTimeFormat("en-CA", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

/*
 * PostgreSQL returns TIME values such as:
 * 09:00:00
 *
 * This converts them to:
 * 9:00 AM
 */
function formatTime(timeValue: string) {
  const [hoursString, minutesString] = timeValue.split(":");

  const hours = Number(hoursString);
  const minutes = Number(minutesString);

  if (
    Number.isNaN(hours) ||
    Number.isNaN(minutes)
  ) {
    return timeValue;
  }

  const date = new Date();

  date.setHours(hours, minutes, 0, 0);

  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

function getSlotHour(startTime: string) {
  const [hoursString] = startTime.split(":");
  return Number(hoursString);
}

function DateTimeStep({
  selectedDate,
  selectedTime,
  durationMinutes,
  availableTimes,
  longVisitLimitReached = false,
  selectedTimeIsHeld,
  isLoadingSlots,
  slotsError,
  onDateSelect,
  onTimeSelect,
  onBack,
  onContinue,
}: DateTimeStepProps) {
  const [timeWarning, setTimeWarning] = useState("");
 /*
 * The backend only returns times that are actually
 * available for this physician, date and appointment type.
 */
const morningTimes = availableTimes.filter(
  (time) => getSlotHour(time) < 12,
);

const afternoonTimes = availableTimes.filter(
  (time) => getSlotHour(time) >= 12,
);

const selectedTimeIsAvailable =
  availableTimes.includes(selectedTime);

const selectedTimeIsPast =
  selectedTime !== "" &&
  isPastTime(selectedDate, selectedTime);

const canContinue =
  selectedDate.trim() !== "" &&
  selectedTime.trim() !== "" &&
  !selectedTimeIsPast &&
  (
    selectedTimeIsHeld ||
    (
      selectedTimeIsAvailable &&
      !isLoadingSlots &&
      !slotsError
    )
  );
  return (
    <section className="overflow-hidden rounded-[26px] border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-6 py-5 lg:px-8">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-teal-50 text-[#13B2B3]">
            <CalendarDays size={24} />
          </div>

          <div>
            <h2 className="text-xl font-bold text-slate-950">
              Choose Date &amp; Time
            </h2>

            <p className="mt-1 text-sm text-slate-500">
              Select an available appointment date and start
              time.
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-6 p-6 lg:grid-cols-[0.8fr_1.2fr] lg:p-8">
        {/* Date section */}
        <div>
          <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
            <label
              htmlFor="appointment-date"
              className="flex items-center gap-2 text-sm font-bold text-slate-900"
            >
              <CalendarDays
                size={18}
                className="text-[#13B2B3]"
              />

              Appointment Date
            </label>

            <p className="mt-2 text-sm leading-6 text-slate-500">
              Choose the day the patient will visit the
              clinic.
            </p>

            <input
              id="appointment-date"
              type="date"
              min={getTodayDate()}
              value={selectedDate}
              onChange={(event) =>
                onDateSelect(event.target.value)
              }
              className="mt-5 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3.5 text-sm font-semibold text-slate-800 outline-none transition focus:border-teal-500 focus:ring-4 focus:ring-teal-500/10"
            />

            <div className="mt-5 rounded-2xl border border-teal-100 bg-white p-4">
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#13B2B3]">
                Selected Date
              </p>

              <p className="mt-2 text-sm font-bold text-slate-900">
                {formatSelectedDate(selectedDate)}
              </p>
            </div>
          </div>

          <div className="mt-4 flex items-start gap-3 rounded-2xl border border-cyan-100 bg-cyan-50 px-4 py-4">
            <Info
              size={20}
              className="mt-0.5 shrink-0 text-cyan-700"
            />

            <p className="text-xs leading-5 text-cyan-800">
              Available times are based on the physician&apos;s
              schedule, appointment duration and current booking
              availability.
            </p>
          </div>
          </div>

        

        {/* Time section */}
        <div className="rounded-3xl border border-slate-200 p-5">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div>
              <div className="flex items-center gap-2">
                <Clock3
                  size={19}
                  className="text-[#13B2B3]"
                />

                <h3 className="text-base font-bold text-slate-900">
                  Available Times
                </h3>
              </div>

              <p className="mt-2 text-sm text-slate-500">
                Appointment duration: {durationMinutes}{" "}
                minutes
              </p>
            </div>

            {selectedTime && canContinue && (
              <div className="w-fit rounded-full bg-teal-50 px-3 py-1.5 text-xs font-bold text-[#13B2B3]">
                {formatTime(selectedTime)} selected
              </div>
            )}
          </div>

          {!selectedDate && (
            <EmptyDateState />
          )}

          {selectedDate && isLoadingSlots && (
            <LoadingSlotsState />
          )}

          {selectedDate &&
            !isLoadingSlots &&
            slotsError && (
              <SlotsErrorState message={slotsError} />
            )}
            {selectedDate &&
              selectedTime &&
              selectedTimeIsHeld && (
                <div className="mt-6 rounded-2xl border border-teal-200 bg-teal-50 p-5">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-[#13B2B3] shadow-sm">
                      <Check size={20} strokeWidth={3} />
                    </div>

                    <div>
                      <p className="text-sm font-bold text-slate-900">
                        {formatTime(selectedTime)} — Reserved for you
                      </p>

                      <p className="mt-1 text-xs leading-5 text-slate-600">
                        This time is temporarily reserved while you complete
                        the booking.
                      </p>
                    </div>
                  </div>
                </div>
            )}
              {selectedDate &&
                !isLoadingSlots &&
                !slotsError &&
                availableTimes.length === 0 &&
                !selectedTimeIsHeld &&
                (longVisitLimitReached ? (
                  <div className="mt-6 flex min-h-[200px] flex-col items-center justify-center rounded-2xl border border-amber-200 bg-amber-50 px-6 text-center">
                    <h4 className="font-bold text-slate-900">
                      No long-visit spots left on this day
                    </h4>
                    <p className="mt-2 max-w-sm text-sm leading-6 text-slate-600">
                      This physician keeps part of each day for shorter
                      visits, and today's longer appointments are already
                      booked. Please choose another day.
                    </p>
                  </div>
                ) : (
                  <NoSlotsState />
                ))}

          {selectedDate &&
            !isLoadingSlots &&
            !slotsError &&
            availableTimes.length === 0 &&
            selectedTimeIsHeld && (
              <div className="mt-6 flex min-h-[220px] flex-col items-center justify-center rounded-2xl border border-teal-200 bg-teal-50 px-6 text-center">
                <Check
                  size={38}
                  className="text-[#13B2B3]"
                />

                <h4 className="mt-4 font-bold text-slate-900">
                  {formatTime(selectedTime)} reserved for you
                </h4>

                <p className="mt-2 max-w-sm text-sm leading-6 text-slate-600">
                  This appointment time is temporarily reserved.
                  Continue to complete the booking.
                </p>
              </div>
          )}

          {selectedDate &&
            !isLoadingSlots &&
            !slotsError &&
            availableTimes.length > 0 && (
              <div className="mt-6 space-y-7">
                {morningTimes.length > 0 && (
                  <TimeSlotGroup
                    title="Morning"
                    times={morningTimes}
                    selectedDate={selectedDate}
                    selectedTime={selectedTime}
                    onTimeSelect={(time) => {
                      onTimeSelect(time);

                      if (isPastTime(selectedDate, time)) {
                        setTimeWarning(
                          "This appointment time has already passed. Only future appointment times can be booked.",
                        );
                      } else {
                        setTimeWarning("");
                      }
                    }}
                  />
                )}

                {afternoonTimes.length > 0 && (
                  <TimeSlotGroup
                    title="Afternoon"
                    times={afternoonTimes}
                    selectedDate={selectedDate}
                    selectedTime={selectedTime}
                    onTimeSelect={(time) => {
                      onTimeSelect(time);

                      if (isPastTime(selectedDate, time)) {
                        setTimeWarning(
                          "This appointment time has already passed. Only future appointment times can be booked.",
                        );
                      } else {
                        setTimeWarning("");
                      }
                    }}
                  />
                )}
              </div>
            )}

            {timeWarning && (
  <div className="mt-5 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
    <Info
      size={18}
      className="mt-0.5 shrink-0 text-amber-700"
    />

    <p className="text-sm font-medium leading-6 text-amber-800">
      {timeWarning}
    </p>
  </div>
)}
        </div>
      </div>

      <div className="flex flex-col-reverse justify-between gap-3 border-t border-slate-200 bg-slate-50 px-6 py-5 sm:flex-row lg:px-8">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-bold text-slate-700 transition hover:bg-slate-100"
        >
          <ArrowLeft size={18} />
          Back
        </button>

        <button
          type="button"
          disabled={!canContinue}
          onClick={onContinue}
          className="inline-flex min-w-[225px] items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-teal-500 to-[#0877C9] px-6 py-3 text-sm font-bold text-white shadow-sm transition hover:-translate-y-0.5 hover:from-teal-600 hover:to-blue-700 hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
        >
          Continue to Patient Details
          <ArrowRight size={18} />
        </button>
      </div>
    </section>
  );
}

function isPastTime(slotDate: string, startTime: string) {
  const now = new Date();

  const slotDateTime = new Date(`${slotDate}T${startTime}`);

  return slotDateTime < now;
}

type TimeSlotGroupProps = {
  title: string;
  times: string[];
  selectedDate: string;
  selectedTime: string;
  onTimeSelect: (time: string) => void;
};

function TimeSlotGroup({
  title,
  times,
  selectedDate,
  selectedTime,
  onTimeSelect,
}: TimeSlotGroupProps) {
  return (
    <div>
      <div className="mb-3 flex items-center gap-3">
        <p className="text-sm font-bold text-slate-800">
          {title}
        </p>

        <div className="h-px flex-1 bg-slate-200" />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
        {times.map((time) => {
          const isSelected =
            selectedTime === time;

          const isPast =
            isPastTime(selectedDate, time);

          return (
            <button
              key={time}
              type="button"
              disabled={isPast}
              onClick={() => {
                if (!isPast) {
                  onTimeSelect(time);
                }
              }}
              title={
                isPast
                  ? "This appointment time has already passed."
                  : `Select ${formatTime(time)}`
              }
              className={[
                "relative min-h-[62px] rounded-xl border px-3 py-2.5 text-sm font-bold transition-all duration-200",

                isSelected
                  ? "border-[#13B2B3] bg-[#13B2B3] text-white shadow-md"
                  : "border-slate-200 bg-white text-slate-700 hover:-translate-y-0.5 hover:border-[#13B2B3] hover:bg-teal-50",

                isPast
                  ? "cursor-not-allowed opacity-40 hover:translate-y-0"
                  : "",
              ].join(" ")}
            >
              <div className="flex items-center justify-center gap-2">
                {isSelected && (
                  <Check
                    size={15}
                    strokeWidth={3}
                  />
                )}

                <span>{formatTime(time)}</span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function EmptyDateState() {
  return (
    <div className="mt-6 flex min-h-[320px] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 text-center">
      <CalendarDays
        size={38}
        className="text-slate-400"
      />

      <h4 className="mt-4 font-bold text-slate-800">
        Select a date first
      </h4>

      <p className="mt-2 max-w-sm text-sm leading-6 text-slate-500">
        Available appointment times will appear after you
        select an appointment date.
      </p>
    </div>
  );
}

function LoadingSlotsState() {
  return (
    <div className="mt-6 flex min-h-[320px] flex-col items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 px-6 text-center">
      <LoaderCircle
        size={38}
        className="animate-spin text-[#13B2B3]"
      />

      <h4 className="mt-4 font-bold text-slate-800">
        Loading appointment times
      </h4>

      <p className="mt-2 max-w-sm text-sm leading-6 text-slate-500">
        Checking the physician&apos;s schedule for the
        selected date.
      </p>
    </div>
  );
}

type SlotsErrorStateProps = {
  message: string;
};

function SlotsErrorState({
  message,
}: SlotsErrorStateProps) {
  return (
    <div className="mt-6 flex min-h-[320px] flex-col items-center justify-center rounded-2xl border border-rose-200 bg-rose-50 px-6 text-center">
      <Clock3 size={38} className="text-rose-400" />

      <h4 className="mt-4 font-bold text-rose-800">
        Times could not be loaded
      </h4>

      <p className="mt-2 max-w-sm text-sm leading-6 text-rose-600">
        {message}
      </p>
    </div>
  );
}

function NoSlotsState() {
  return (
    <div className="mt-6 flex min-h-[320px] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 text-center">
      <Clock3 size={38} className="text-slate-400" />

      <h4 className="mt-4 font-bold text-slate-800">
        No appointment times available
      </h4>

      <p className="mt-2 max-w-sm text-sm leading-6 text-slate-500">
        This physician has no generated appointment slots
        for the selected date. Try another date or
        physician.
      </p>
    </div>
  );
}

export default DateTimeStep;