import { useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Search,
  UserRound,
  UsersRound,
} from "lucide-react";

export type Patient = {
  patient_id: number;
  first_name: string;
  last_name: string;
  date_of_birth: string;
  phone: string | null;
  email?: string | null;
  status: string;
};

type PatientDetailsStepProps = {
  patients: Patient[];
  selectedPatientId: number | null;
  notes: string;
  isLoadingPatients: boolean;

  lockedPatient?: boolean;

  onPatientSelect: (patientId: number) => void;
  onNotesChange: (notes: string) => void;
  onBack: () => void;
  onContinue: () => void;
};

const avatarClassNames = [
  "bg-[#13B2B3]/10 text-[#13B2B3]",
  "bg-blue-100 text-blue-700",
  "bg-violet-100 text-violet-700",
  "bg-amber-100 text-amber-700",
];

function formatDateOfBirth(dateValue: string) {
  if (!dateValue) {
    return "Date of birth unavailable";
  }

  const date = new Date(`${dateValue.split("T")[0]}T12:00:00`);

  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date);
}

function getInitials(firstName: string, lastName: string) {
  return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
}

function PatientDetailsStep({
  patients,
  selectedPatientId,
  notes,
  isLoadingPatients,
  lockedPatient = false,
  onPatientSelect,
  onNotesChange,
  onBack,
  onContinue,
}: PatientDetailsStepProps) {
  const [searchTerm, setSearchTerm] = useState("");

  const filteredPatients = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    if (!normalizedSearch) {
      return patients;
    }

    return patients.filter((patient) => {
      const fullName =
        `${patient.first_name} ${patient.last_name}`.toLowerCase();

      const phone = patient.phone?.toLowerCase() ?? "";
      const email = patient.email?.toLowerCase() ?? "";

      return (
        fullName.includes(normalizedSearch) ||
        phone.includes(normalizedSearch) ||
        email.includes(normalizedSearch)
      );
    });
  }, [patients, searchTerm]);

  const selectedPatient = patients.find(
    (patient) => patient.patient_id === selectedPatientId,
  );

  const selectedPatientIndex = patients.findIndex(
    (patient) => patient.patient_id === selectedPatientId,
  );

  const selectedPatientAvatarClass =
    selectedPatientIndex >= 0
      ? avatarClassNames[
          selectedPatientIndex % avatarClassNames.length
        ]
      : avatarClassNames[0];

  return (
    <section className="overflow-hidden rounded-[26px] border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-6 py-5 lg:px-8">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-teal-50 text-[#13B2B3]">
            <UserRound size={24} />
          </div>

          <div>
            <h2 className="text-xl font-bold text-slate-950">
              Patient Details
            </h2>

            <p className="mt-1 text-sm text-slate-500">
              {lockedPatient
                ? "Confirm your details and add anything the clinic should know."
                : "Search for and select the patient receiving the appointment."}
            </p>
          </div>
        </div>
      </div>

      <div
        className={[
          "grid gap-6 p-6 lg:p-8",
          lockedPatient
            ? "lg:grid-cols-2"
            : "lg:grid-cols-[1.2fr_0.8fr]",
        ].join(" ")}
      >
        {/* Patients book for themselves, so there is no search. */}
        {!lockedPatient && (
        <div>
          <label
            htmlFor="patient-search"
            className="text-sm font-bold text-slate-900"
          >
            Find Patient
          </label>

          <p className="mt-1 text-sm text-slate-500">
            Search by name, phone number or email.
          </p>

          <div className="relative mt-4">
            <Search
              size={19}
              className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
            />

            <input
              id="patient-search"
              type="text"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search patients..."
              className="w-full rounded-2xl border border-slate-300 bg-white py-3.5 pl-12 pr-4 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-teal-500 focus:ring-4 focus:ring-teal-500/10"
            />
          </div>

          <div className="mt-4 max-h-[480px] space-y-3 overflow-y-auto pr-2 [scrollbar-color:#94a3b8_transparent] [scrollbar-width:thin]">
            {isLoadingPatients ? (
              <div className="flex min-h-[240px] items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50">
                <p className="text-sm font-medium text-slate-500">
                  Loading patients...
                </p>
              </div>
            ) : filteredPatients.length === 0 ? (
              <div className="flex min-h-[240px] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 text-center">
                <UsersRound
                  size={36}
                  className="text-slate-400"
                />

                <h3 className="mt-4 font-bold text-slate-800">
                  No patients found
                </h3>

                <p className="mt-2 text-sm text-slate-500">
                  Try searching using another name, phone number or email.
                </p>
              </div>
            ) : (
              filteredPatients.map((patient) => {
                const isSelected =
                  selectedPatientId === patient.patient_id;

                const patientIndex = patients.findIndex(
                  (currentPatient) =>
                    currentPatient.patient_id === patient.patient_id,
                );

                const patientAvatarClass =
                  avatarClassNames[
                    patientIndex % avatarClassNames.length
                  ];

                return (
                  <button
                    key={patient.patient_id}
                    type="button"
                    onClick={() =>
                      onPatientSelect(patient.patient_id)
                    }
                    className={[
                      "flex w-full items-center gap-4 rounded-2xl border p-4 text-left transition-all",
                      isSelected
                        ? "border-[#13B2B3] bg-teal-50/70 shadow-sm"
                        : "border-slate-200 bg-white hover:border-[#13B2B3] hover:shadow-sm",
                    ].join(" ")}
                  >
                    <div
                      className={[
                        "flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-bold",
                        patientAvatarClass,
                      ].join(" ")}
                    >
                      {getInitials(
                        patient.first_name,
                        patient.last_name,
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-bold text-[#13B2B3]">
                          {patient.first_name} {patient.last_name}
                        </h3>

                        {isSelected && (
                          <span className="rounded-full bg-teal-100 px-2.5 py-1 text-[11px] font-bold text-[#13B2B3]">
                            Selected
                          </span>
                        )}
                      </div>

                      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                        <span>
                          DOB:{" "}
                          {formatDateOfBirth(
                            patient.date_of_birth,
                          )}
                        </span>

                        <span>
                          {patient.phone || "No phone number"}
                        </span>
                      </div>
                    </div>

                    <span
                      className={[
                        "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2",
                        isSelected
                          ? "border-[#13B2B3] bg-[#13B2B3] text-white"
                          : "border-slate-300",
                      ].join(" ")}
                    >
                      {isSelected && (
                        <Check
                          size={13}
                          strokeWidth={3}
                        />
                      )}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>
        )}

        <div
          className={
            lockedPatient
              ? "contents"
              : "space-y-5"
          }
        >
          <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
            <h3 className="text-base font-bold text-slate-900">
              {lockedPatient
                ? "Booking For"
                : "Selected Patient"}
            </h3>

            {selectedPatient ? (
              <div className="mt-4 rounded-2xl border border-teal-200 bg-white p-4">
                <div className="flex items-center gap-3">
                  <div
                    className={[
                      "flex h-11 w-11 items-center justify-center rounded-full text-sm font-bold",
                      selectedPatientAvatarClass,
                    ].join(" ")}
                  >
                    {getInitials(
                      selectedPatient.first_name,
                      selectedPatient.last_name,
                    )}
                  </div>

                  <div>
                    <p className="font-bold text-slate-900">
                      {selectedPatient.first_name}{" "}
                      {selectedPatient.last_name}
                    </p>

                    <p className="mt-1 text-xs text-slate-500">
                      {lockedPatient
                        ? selectedPatient.email
                        : `Patient ID #${selectedPatient.patient_id}`}
                    </p>
                  </div>
                </div>

                {/* The patient portal only knows the name and
                    email, so skip the empty DOB/phone rows. */}
                {!lockedPatient && (
                <div className="mt-4 space-y-2 border-t border-slate-100 pt-4 text-sm">
                  <div className="flex justify-between gap-4">
                    <span className="text-slate-500">
                      Date of birth
                    </span>

                    <span className="text-right font-semibold text-slate-800">
                      {formatDateOfBirth(
                        selectedPatient.date_of_birth,
                      )}
                    </span>
                  </div>

                  <div className="flex justify-between gap-4">
                    <span className="text-slate-500">
                      Phone
                    </span>

                    <span className="text-right font-semibold text-slate-800">
                      {selectedPatient.phone || "Not provided"}
                    </span>
                  </div>
                </div>
                )}
              </div>
            ) : (
              <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-8 text-center">
                <UserRound
                  size={32}
                  className="mx-auto text-slate-400"
                />

                <p className="mt-3 text-sm font-semibold text-slate-600">
                  No patient selected
                </p>
              </div>
            )}
          </div>

          <div>
            <label
              htmlFor="appointment-notes"
              className="text-sm font-bold text-slate-900"
            >
              {lockedPatient
                ? "Notes for the Clinic"
                : "Internal Notes"}
            </label>

            <p className="mt-1 text-xs leading-5 text-slate-500">
              {lockedPatient
                ? "Optional. Anything the clinic should know before your visit."
                : "Optional notes for clinic staff. These are not shown to the patient."}
            </p>

            <div className="relative mt-3">
              <textarea
                id="appointment-notes"
                rows={6}
                maxLength={500}
                value={notes}
                onChange={(event) =>
                  onNotesChange(event.target.value)
                }
                placeholder={
                  lockedPatient
                    ? "e.g. symptoms, accessibility needs..."
                    : "Add any notes for the clinic team..."
                }
                className="w-full resize-none rounded-2xl border border-slate-300 bg-white px-4 py-4 pb-9 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-teal-500 focus:ring-4 focus:ring-teal-500/10"
              />

              <span className="absolute bottom-3 right-4 text-xs font-medium text-slate-400">
                {notes.length}/500
              </span>
            </div>
          </div>
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
          disabled={selectedPatientId === null}
          onClick={onContinue}
          className="inline-flex min-w-[225px] items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-teal-500 to-[#0877C9] px-6 py-3 text-sm font-bold text-white shadow-sm transition hover:-translate-y-0.5 hover:from-teal-600 hover:to-blue-700 hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
        >
          Continue to Review
          <ArrowRight size={18} />
        </button>
      </div>
    </section>
  );
}

export default PatientDetailsStep;