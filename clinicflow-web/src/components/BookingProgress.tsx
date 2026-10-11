import {
  CalendarDays,
  Check,
  ClipboardCheck,
  UserRound,
  UsersRound,
} from "lucide-react";

type BookingProgressProps = {
  currentStep: number;
};

const bookingSteps = [
  {
    number: 1,
    label: "Reason & Physician",
    icon: UsersRound,
  },
  {
    number: 2,
    label: "Date & Time",
    icon: CalendarDays,
  },
  {
    number: 3,
    label: "Patient Details",
    icon: UserRound,
  },
  {
    number: 4,
    label: "Review & Book",
    icon: ClipboardCheck,
  },
];

function BookingProgress({
  currentStep,
}: BookingProgressProps) {
  const progressPercentage =
    ((currentStep - 1) / (bookingSteps.length - 1)) *
    100;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white px-5 py-3 shadow-sm">
      <div className="relative">
        {/* Full grey progress line */}
        <div className="absolute left-[12.5%] right-[12.5%] top-4 h-0.5 rounded-full bg-slate-200" />

        {/* Active teal progress line */}
        <div
           className="absolute left-[12.5%] top-4 h-0.5 rounded-full bg-[#13b2b3] transition-all duration-500"
          style={{
            width: `${progressPercentage * 0.75}%`,
          }}
        />

        <div className="relative z-10 grid grid-cols-4">
          {bookingSteps.map((step) => {
            const Icon = step.icon;

            const isActive =
              currentStep === step.number;

            const isCompleted =
              currentStep > step.number;

            const isReached =
              currentStep >= step.number;

            return (
              <div
                key={step.number}
                className="flex flex-col items-center text-center"
              >
                <div
                  className={[
                    "flex h-8 w-8 items-center justify-center rounded-full border text-xs font-bold transition-all duration-300",
                    isReached
                      ? "border-[#13B2B3] bg-[#13B2B3] text-white shadow-[0_5px_14px_rgba(20,184,166,0.24)]"
                      : "border-slate-300 bg-slate-100 text-slate-500",
                  ].join(" ")}
                >
                  {isCompleted ? (
                    <Check
                      size={15}
                      strokeWidth={3}
                    />
                  ) : (
                    step.number
                  )}
                </div>

                <div className="mt-2 flex items-center justify-center gap-1.5">
                  <Icon
                    size={14}
                    className={
                      isReached
                        ? "text-[#13B2B3]"
                        : "text-[#13B2B3]"
                    }
                  />

                  <p
                    className={[
                      "text-xs font-semibold leading-4 sm:text-sm",
                      isActive
                        ? "text-[#13B2B3]"
                        : isCompleted
                          ? "text-[#13B2B3]"
                          : "text-[#13B2B3]",
                    ].join(" ")}
                  >
                    {step.label}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export default BookingProgress;