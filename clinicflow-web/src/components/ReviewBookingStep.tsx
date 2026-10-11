import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  Clock3,
  FileText,
  Stethoscope,
  UserRound,
} from "lucide-react";

import type { Patient } from "./PatientDetailsStep";
import type { Physician } from "./ReasonForVisitStep";

export type ReviewAppointmentReason = {
  appointment_reason_id: number;
  appointment_type_id: number;
  name: string;
  duration_minutes: number;
  description: string | null;
  category_name: string;
};

type ReviewBookingStepProps = {
  patient: Patient | undefined;
  physician: Physician | undefined;
  appointmentReason: ReviewAppointmentReason | undefined;

  appointmentDate: string;
  startTime: string;
  durationMinutes: number;
  reasonDetails: string;
  notes: string;

  isSubmitting: boolean;
  // Patient-portal booking: hide staff-only details.
  isPatientBooking?: boolean;

  onBack: () => void;
  onBookAppointment: () => void;
};

function formatAppointmentDate(dateValue: string) {
  if (!dateValue) {
    return "Not selected";
  }

  const date = new Date(`${dateValue}T12:00:00`);

  return new Intl.DateTimeFormat("en-CA", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function formatAppointmentTime(timeValue: string) {
  if (!timeValue) {
    return "Not selected";
  }

  const [hoursValue, minutesValue] = timeValue.split(":");

  const date = new Date();

  date.setHours(
    Number(hoursValue),
    Number(minutesValue),
    0,
    0,
  );

  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function formatDateOfBirth(dateValue: string) {
  if (!dateValue) {
    return "Not available";
  }

  const normalizedDate = dateValue.split("T")[0];
  const date = new Date(`${normalizedDate}T12:00:00`);

  return new Intl.DateTimeFormat("en-CA", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function ReviewBookingStep({
  patient,
  physician,
  appointmentReason,
  appointmentDate,
  startTime,
  durationMinutes,
  reasonDetails,
  notes,
  isSubmitting,
  isPatientBooking = false,
  onBack,
  onBookAppointment,
}: ReviewBookingStepProps) {
  return (
    <section className="overflow-hidden rounded-[26px] border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-6 py-5 lg:px-8">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-teal-50 text-[#13B2B3]">
            <CheckCircle2 size={24} />
          </div>

          <div>
            <h2 className="text-xl font-bold text-slate-950">
              Review & Book
            </h2>

            <p className="mt-1 text-sm text-slate-500">
              Confirm the appointment details before booking.
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-6 p-6 lg:grid-cols-[1fr_360px] lg:p-8">
        <div className="space-y-5">
          {/* Patient */}
          <ReviewSection
            icon={<UserRound size={20} />}
            title="Patient"
          >
            {patient ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <ReviewItem
                  label="Patient name"
                  value={`${patient.first_name} ${patient.last_name}`}
                />

                {isPatientBooking ? (
                  <ReviewItem
                    label="Email"
                    value={patient.email || "Not provided"}
                  />
                ) : (
                <>
                <ReviewItem
                  label="Patient ID"
                  value={`#${patient.patient_id}`}
                />

                <ReviewItem
                  label="Date of birth"
                  value={formatDateOfBirth(
                    patient.date_of_birth,
                  )}
                />

                <ReviewItem
                  label="Phone"
                  value={patient.phone || "Not provided"}
                />
                </>
                )}
              </div>
            ) : (
              <p className="text-sm text-rose-600">
                No patient selected.
              </p>
            )}
          </ReviewSection>

          {/* Physician */}
          <ReviewSection
            icon={<Stethoscope size={20} />}
            title="Physician"
          >
            {physician ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <ReviewItem
                  label="Physician"
                  value={`Dr. ${physician.firstName} ${physician.lastName}`}
                />

                <ReviewItem
                  label="Specialty"
                  value={physician.specialty}
                />
              </div>
            ) : (
              <p className="text-sm text-rose-600">
                No physician selected.
              </p>
            )}
          </ReviewSection>

          {/* Appointment */}
          <ReviewSection
            icon={<CalendarDays size={20} />}
            title="Appointment"
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <ReviewItem
                label="Reason for visit"
                value={
                  appointmentReason?.name ||
                  "Not selected"
                }
              />

              <ReviewItem
                label="Duration"
                value={`${durationMinutes} minutes`}
              />

              <ReviewItem
                label="Appointment date"
                value={formatAppointmentDate(
                  appointmentDate,
                )}
              />

              <ReviewItem
                label="Start time"
                value={formatAppointmentTime(startTime)}
              />
            </div>

            {reasonDetails.trim() && (
              <div className="mt-5 border-t border-slate-100 pt-5">
                <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-400">
                  Visit details
                </p>

                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                  {reasonDetails}
                </p>
              </div>
            )}
          </ReviewSection>

          {/* Internal notes */}
          <ReviewSection
            icon={<FileText size={20} />}
            title={
              isPatientBooking
                ? "Notes for the Clinic"
                : "Internal Notes"
            }
          >
            <p className="whitespace-pre-wrap text-sm leading-6 text-slate-700">
              {notes.trim()
                ? notes
                : isPatientBooking
                  ? "No notes were added."
                  : "No internal notes were added."}
            </p>
          </ReviewSection>
        </div>

        {/* Booking summary */}
        <aside className="h-fit rounded-3xl border border-[#13B2B3]/30 bg-gradient-to-b from-[#13B2B3]/10 to-white p-6 lg:sticky lg:top-6">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#13B2B3] text-white shadow-lg shadow-[#13B2B3]/20">
            <CalendarDays size={24} />
          </div>

          <h3 className="mt-5 text-lg font-bold text-slate-950">
            Appointment Summary
          </h3>

          <div className="mt-5 space-y-4">
            <SummaryRow
              icon={<CalendarDays size={17} />}
              label="Date"
              value={formatAppointmentDate(
                appointmentDate,
              )}
            />

            <SummaryRow
              icon={<Clock3 size={17} />}
              label="Time"
              value={formatAppointmentTime(startTime)}
            />

            <SummaryRow
              icon={<Stethoscope size={17} />}
              label="Physician"
              value={
                physician
                  ? `Dr. ${physician.firstName} ${physician.lastName}`
                  : "Not selected"
              }
            />

            <SummaryRow
              icon={<UserRound size={17} />}
              label="Patient"
              value={
                patient
                  ? `${patient.first_name} ${patient.last_name}`
                  : "Not selected"
              }
            />
          </div>

          <div className="mt-6 rounded-2xl border border-[#13B2B3]/20 bg-white p-4">
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#13B2B3]">
              Duration
            </p>

            <p className="mt-1 text-xl font-bold text-slate-950">
              {durationMinutes} minutes
            </p>
          </div>

          <button
            type="button"
            disabled={isSubmitting}
            onClick={onBookAppointment}
            className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-teal-500 to-[#0877C9] px-6 py-3.5 text-sm font-bold text-white shadow-sm transition hover:-translate-y-0.5 hover:from-teal-600 hover:to-blue-700 hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
          >
            {isSubmitting ? (
              "Booking Appointment..."
            ) : (
              <>
                <CheckCircle2 size={19} />
                Confirm & Book
              </>
            )}
          </button>

          <p className="mt-3 text-center text-xs leading-5 text-slate-500">
            Review all information carefully before confirming.
          </p>
        </aside>
      </div>

      <div className="border-t border-slate-200 bg-slate-50 px-6 py-5 lg:px-8">
        <button
          type="button"
          disabled={isSubmitting}
          onClick={onBack}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-bold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <ArrowLeft size={18} />
          Back to Patient Details
        </button>
      </div>
    </section>
  );
}

type ReviewSectionProps = {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
};

function ReviewSection({
  icon,
  title,
  children,
}: ReviewSectionProps) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5">
      <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#13B2B3]/10 text-[#13B2B3]">
          {icon}
        </div>

        <h3 className="font-bold text-slate-950">
          {title}
        </h3>
      </div>

      <div className="pt-5">{children}</div>
    </section>
  );
}

type ReviewItemProps = {
  label: string;
  value: string;
};

function ReviewItem({
  label,
  value,
}: ReviewItemProps) {
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-[0.1em] text-slate-400">
        {label}
      </p>

      <p className="mt-1.5 text-sm font-semibold text-slate-800">
        {value}
      </p>
    </div>
  );
}

type SummaryRowProps = {
  icon: React.ReactNode;
  label: string;
  value: string;
};

function SummaryRow({
  icon,
  label,
  value,
}: SummaryRowProps) {
  return (
    <div className="flex gap-3">
      <div className="mt-0.5 text-[#13B2B3]">
        {icon}
      </div>

      <div className="min-w-0">
        <p className="text-xs font-medium text-slate-500">
          {label}
        </p>

        <p className="mt-0.5 text-sm font-bold text-slate-900">
          {value}
        </p>
      </div>
    </div>
  );
}

export default ReviewBookingStep;