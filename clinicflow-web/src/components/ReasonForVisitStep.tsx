import {
  Check,
  Clock3,
  HeartPulse,
  ShieldCheck,
  UserRound,
  UsersRound,
} from "lucide-react";

export type AppointmentReason = {
  appointment_reason_id: number;
  appointment_type_id: number;
  name: string;
  duration_minutes: number;
  description: string | null;
  category_name: string;
};

export type Physician = {
  doctorId: number;
  firstName: string;
  lastName: string;
  specialty: string;

  walkInSchedule: {
  start_time: string;
  end_time: string;
}[];

scheduledSlotsRemaining: number;

  bookedSlots: number;
  blockedSlots: number;

  nextAvailable: string | null;
};

type ReasonForVisitStepProps = {
  appointmentReasons: AppointmentReason[];

  selectedReasonId: number | null;
  reasonDetails: string;
  selectedDoctorId: number | null;
  physicians: Physician[];

  onReasonSelect: (reasonId: number) => void;
  onReasonDetailsChange: (value: string) => void;
  onPhysicianSelect: (doctorId: number) => void;
  onContinue: () => void;
};



function getInitials(firstName: string, lastName: string) {
  return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
}

function formatTime(time: string) {
  const [hourString, minuteString] = time.split(":");

  const hour = Number(hourString);
  const minute = minuteString ?? "00";

  const period = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 || 12;

  return `${displayHour}:${minute} ${period}`;
}

function formatWalkInSchedule(
  schedule: {
    start_time: string;
    end_time: string;
  }[],
) {
  if (schedule.length === 0) {
    return "Not scheduled";
  }

  return schedule
    .map(
      (block) =>
        `${formatTime(block.start_time)} – ${formatTime(
          block.end_time,
        )}`,
    )
    .join(", ");
}

function formatNextAvailable(time: string | null) {
  if (!time) {
    return "Fully Booked";
  }

  const [hourString, minuteString] = time.split(":");

  const hour = Number(hourString);
  const minute = minuteString ?? "00";

  const period = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 || 12;

  return `${displayHour}:${minute} ${period}`;
}

function ReasonForVisitStep({
  appointmentReasons,
  selectedReasonId,
  reasonDetails,
  selectedDoctorId,
  physicians,
  onReasonSelect,
  onReasonDetailsChange,
  onPhysicianSelect,
  onContinue,
}: ReasonForVisitStepProps) {
  const canContinue =
    selectedReasonId !== null &&
    selectedDoctorId !== null;

  return (
    <div className="grid items-start gap-5 xl:grid-cols-[0.9fr_1.1fr]">
      {/* Reason for Visit */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-4 flex items-center gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-teal-50 text-[#13B2B3]">
            <HeartPulse size={24} />
          </div>

          <div>
            <h2 className="text-xl font-bold text-slate-950">
              Reason for Visit
            </h2>

            <p className="mt-0.5 text-xs text-slate-500">
              Select the main reason for this visit.
            </p>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {appointmentReasons.map((reason) => {
            const isSelected =
              selectedReasonId ===
              reason.appointment_reason_id;

            return (
              <button
                key={reason.appointment_reason_id}
                type="button"
                onClick={() =>
                  onReasonSelect(
                    reason.appointment_reason_id,
                  )
                }
                className={[
                  "group relative min-h-[92px] rounded-2xl border p-3 text-left transition-all duration-200",
                  isSelected
                    ? "border-teal-500 bg-gradient-to-br from-teal-50 to-white shadow-[0_12px_28px_rgba(20,184,166,0.14)]"
                    : "border-slate-200 bg-white hover:-translate-y-0.5 hover:border-teal-300 hover:shadow-md",
                ].join(" ")}
              >
                {isSelected && (
                  <span className="absolute right-2.5 top-2.5 flex h-5 w-5 items-center justify-center rounded-full bg-teal-500 text-white">
                    <Check
                      size={13}
                      strokeWidth={3}
                    />
                  </span>
                )}

                <div className="flex gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-teal-50 text-teal-600">
                    <HeartPulse size={17} />
                  </div>

                  <div className="min-w-0 pt-0.5">
                    <p className="text-sm font-semibold leading-4">
                      {reason.name}
                    </p>

                    <p className="mt-0.5 text-[11px] leading-3.5 text-slate-500">
                      {reason.description ||
                        reason.category_name}
                    </p>

                    <p className="mt-1 text-[10px] font-semibold text-teal-700">
                      {reason.duration_minutes} min
                    </p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        <div className="mt-6">
          <label
            htmlFor="reasonDetails"
            className="text-sm font-bold text-slate-900"
          >
            Other details
          </label>

          <p className="mt-1 text-xs text-slate-500">
            Provide more information so the physician is better prepared.
          </p>

          <div className="relative mt-3">
            <textarea
              id="reasonDetails"
              value={reasonDetails}
              rows={4}
              maxLength={300}
              onChange={(event) =>
                onReasonDetailsChange(event.target.value)
              }
              placeholder="Describe the reason for visit..."
              className="w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-4 pb-9 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-teal-500 focus:ring-4 focus:ring-teal-100"
            />

            <span className="absolute bottom-3 right-4 text-xs font-medium text-slate-500">
              {reasonDetails.length}/300
            </span>
          </div>

          
        </div>

        <div className="mt-6 flex items-start gap-3 rounded-2xl border border-teal-100 bg-gradient-to-r from-teal-50 to-cyan-50 px-4 py-4">
          <ShieldCheck
            size={23}
            className="mt-0.5 shrink-0 text-[#13B2B3]"
          />

          <div>
            <p className="text-sm font-bold text-[#13B2B3]">
              Patient information is secure and private.
            </p>

            <p className="mt-1 text-xs leading-5 text-[#13B2B3]">
              Appointment information should only be accessed by authorized
              clinic staff.
            </p>
          </div>
        </div>
      </section>

      {/* Choose Physician */}
      <section className="min-h-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-4 flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-teal-50 text-[#13B2B3]">
            <UserRound size={20} />
            </div>

            <div>
            <h2 className="text-xl font-bold text-slate-950">
                Choose Physician
            </h2>

            <p className="mt-0.5 text-sm text-slate-500">
                Select a physician based on availability today.
            </p>
            </div>
        </div>

         <div className="h-[385px] space-y-3 overflow-y-auto overscroll-contain pr-2 scroll-smooth [scrollbar-color:#94a3b8_transparent] [scrollbar-width:thin]">
          {physicians.map((physician, index) => {
            const isSelected = selectedDoctorId === physician.doctorId;

            const avatarClassNames = [
              "bg-gradient-to-br from-teal-400 to-teal-700 text-white",
              "bg-violet-100 text-violet-700",
              "bg-amber-100 text-amber-700",
              "bg-blue-100 text-blue-700",
            ];

            return (
              <button
                key={physician.doctorId}
                type="button"
                onClick={() => onPhysicianSelect(physician.doctorId)}
                className={[
                  "w-full overflow-hidden rounded-2xl border bg-white text-left transition-all duration-200",
                  isSelected
                    ? "border-teal-500 shadow-[0_14px_34px_rgba(20,184,166,0.13)]"
                    : "border-slate-200 hover:border-teal-300 hover:shadow-md",
                ].join(" ")}
              >
                <div className="flex items-center gap-3 px-4 py-2.5">
                  <div
                    className={[
                      "flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold",
                      avatarClassNames[index % avatarClassNames.length],
                    ].join(" ")}
                  >
                    {getInitials(
                      physician.firstName,
                      physician.lastName,
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-bold text-slate-950">
                        Dr. {physician.firstName} {physician.lastName}
                      </h3>

                      {isSelected && (
                        <span className="rounded-full bg-teal-50 px-2.5 py-1 text-[10px] font-bold text-teal-700">
                          Selected
                        </span>
                      )}
                    </div>

                    <p className="mt-0.5 text-xs text-slate-500">
                      {physician.specialty}
                    </p>
                  </div>

                  <span
                    className={[
                      "mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2",
                      isSelected
                        ? "border-teal-500"
                        : "border-slate-300",
                    ].join(" ")}
                  >
                    {isSelected && (
                      <span className="h-3 w-3 rounded-full bg-teal-500" />
                    )}
                  </span>
                </div>

                <div className="grid border-t border-slate-100 sm:grid-cols-3">
                  <div className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <UsersRound
                        size={13}
                        className="text-slate-500"
                      />

                      <p className="text-[10px] font-semibold text-slate-500">
                        Walk-In Schedule
                      </p>
                    </div>

                    <p
                      className={[
                        "mt-0.5 text-xs font-bold",
                        physician.walkInSchedule.length > 0
                          ? "text-teal-700"
                          : "text-slate-400",
                      ].join(" ")}
                    >
                      {formatWalkInSchedule(
                        physician.walkInSchedule,
                      )}
                    </p>
                  </div>

                  <div className="border-t border-slate-100 px-3 py-2 sm:border-l sm:border-t-0">
                    <div className="flex items-center gap-2">
                      <CalendarDaysIcon />

                      <p className="text-[10px] font-semibold text-slate-500">
                        Patient Bookings Today
                      </p>
                    </div>

                    <p className="mt-0.5 text-xs font-bold text-teal-700">
                      {physician.scheduledSlotsRemaining} remaining
                    </p>
                  </div>

                  <div className="border-t border-slate-100 px-3 py-2 sm:border-l sm:border-t-0">
                    <div className="flex items-center gap-2">
                      <Clock3 size={13} className="text-slate-500" />

                      <p className="text-[10px] font-semibold text-slate-500">
                        Next Available
                      </p>
                    </div>

                    <p className="mt-0.5 text-sxs font-bold text-teal-700">
                      {formatNextAvailable(physician.nextAvailable)}
                    </p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

         <div className="mt-3 flex items-start gap-3 rounded-2xl border border-cyan-100 bg-gradient-to-r from-cyan-50 to-teal-50 px-4 py-3">
    {/* Walk-In Schedule content */}
          <UsersRound
            size={21}
            className="mt-0.5 shrink-0 text-[#13B2B3]"
          />

          <div>
            <p className="text-sm font-bold text-[#13B2B3]">
              Walk-In Schedule
            </p>

            <p className="mt-1 text-xs leading-5 text-slate-600">
              Shows when each physician is accepting walk-in patients today.
            </p>
          </div>
        </div>

        <div className="mt-3 flex justify-end">
          <button
            type="button"
            disabled={!canContinue}
            onClick={onContinue}
            className="inline-flex min-w-[225px] items-center justify-center rounded-xl bg-gradient-to-r from-teal-500 to-[#0877C9] px-6 py-3 text-sm font-bold text-white shadow-sm transition hover:-translate-y-0.5 hover:from-teal-600 hover:to-blue-700 hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
          >
            Continue to Next Step
            <span className="ml-2 text-lg">→</span>
          </button>
        </div>
      </section>
    </div>
  );
}

function CalendarDaysIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="13"
      height="13"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className="text-slate-500"
      aria-hidden="true"
    >
      <path d="M8 2v4M16 2v4M3 10h18" />
      <rect x="3" y="4" width="18" height="17" rx="2" />
    </svg>
  );
}

export default ReasonForVisitStep;