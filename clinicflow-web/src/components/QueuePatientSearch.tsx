import { useEffect, useMemo, useRef, useState } from "react";
import { Search, UserPlus, X } from "lucide-react";
import { Link } from "react-router-dom";

import { apiFetch } from "../lib/api";
import type { QueueAppointment } from "../types/appointment";

type Patient = {
  patient_id: number;
  first_name: string;
  last_name: string;
  phone: string | null;
  email: string | null;
  status: string;
};

const MAX_RESULTS = 5;

function queueStatusLabel(appointment: QueueAppointment) {
  if (appointment.status === "roomed") return "In room";
  if (appointment.status === "checked_in") return "Waiting";
  if (appointment.arrived_at) return "Arrived";
  return appointment.visit_type === "walk_in" ? "Walk-in" : "Booked";
}

/*
 * Live Queue search. Typing filters the queue (as before)
 * and opens a dropdown with:
 *   - matching patients already in today's queue
 *   - other registered patients, with "Add walk-in"
 *   - "Add new patient" when nobody matches
 */
function QueuePatientSearch({
  value,
  onChange,
  queue,
  onAddWalkIn,
}: {
  value: string;
  onChange: (value: string) => void;
  queue: QueueAppointment[];
  onAddWalkIn: (patientId: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [patients, setPatients] = useState<Patient[] | null>(null);
  const [loadingPatients, setLoadingPatients] = useState(false);
  const [patientsError, setPatientsError] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  // Load the patient list the first time the box is used.
  async function ensurePatients() {
    if (patients || loadingPatients) return;

    try {
      setLoadingPatients(true);
      setPatientsError("");

      const response = await apiFetch("/api/patients");
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message ?? "Unable to load patients.");
      }

      setPatients(data as Patient[]);
    } catch (error) {
      setPatientsError(
        error instanceof Error ? error.message : "Unable to load patients.",
      );
    } finally {
      setLoadingPatients(false);
    }
  }

  // Close when clicking outside.
  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  const search = value.trim().toLowerCase();

  const inQueue = useMemo(() => {
    if (!search) return [];

    return queue
      .filter((appointment) =>
        `${appointment.patient_first_name} ${appointment.patient_last_name}`
          .toLowerCase()
          .includes(search),
      )
      .slice(0, MAX_RESULTS);
  }, [queue, search]);

  const otherPatients = useMemo(() => {
    if (!search || !patients) return [];

    const queuedIds = new Set(queue.map((appointment) => appointment.patient_id));

    return patients
      .filter((patient) => {
        if (patient.status !== "active" || queuedIds.has(patient.patient_id)) {
          return false;
        }

        const name = `${patient.first_name} ${patient.last_name}`.toLowerCase();
        const phone = patient.phone?.toLowerCase() ?? "";
        const email = patient.email?.toLowerCase() ?? "";

        return name.includes(search) || phone.includes(search) || email.includes(search);
      })
      .slice(0, MAX_RESULTS);
  }, [patients, queue, search]);

  const showDropdown = open && search !== "";
  const nothingFound =
    !loadingPatients && patients !== null && inQueue.length === 0 && otherPatients.length === 0;

  return (
    <div ref={containerRef} className="relative min-w-0 sm:w-[340px]">
      <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-500/10">
        <Search size={19} className="shrink-0 text-slate-400" />

        <input
          type="text"
          value={value}
          onChange={(event) => {
            onChange(event.target.value);
            setOpen(true);
            void ensurePatients();
          }}
          onFocus={() => {
            setOpen(true);
            void ensurePatients();
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") setOpen(false);
          }}
          placeholder="Search patient or doctor"
          aria-label="Search patients"
          aria-expanded={showDropdown}
          className="min-w-0 flex-1 bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
        />

        {value && (
          <button
            type="button"
            onClick={() => {
              onChange("");
              setOpen(false);
            }}
            aria-label="Clear search"
            className="shrink-0 rounded-md p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <X size={16} />
          </button>
        )}
      </div>

      {showDropdown && (
        <div className="absolute left-0 right-0 top-full z-30 mt-2 max-h-[420px] overflow-y-auto rounded-xl border border-slate-200 bg-white py-2 shadow-raised">
          {inQueue.length > 0 && (
            <div>
              <p className="px-4 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                In today's queue
              </p>
              {inQueue.map((appointment) => (
                <button
                  key={appointment.appointment_id}
                  type="button"
                  onClick={() => {
                    onChange(`${appointment.patient_first_name} ${appointment.patient_last_name}`);
                    setOpen(false);
                  }}
                  className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left hover:bg-slate-50"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900">
                      {appointment.patient_first_name} {appointment.patient_last_name}
                    </p>
                    <p className="truncate text-xs text-slate-500">
                      {appointment.doctor_last_name
                        ? `Dr. ${appointment.doctor_last_name}`
                        : "Next available doctor"}
                      {appointment.appointment_type && ` · ${appointment.appointment_type}`}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                    {queueStatusLabel(appointment)}
                  </span>
                </button>
              ))}
            </div>
          )}

          {(otherPatients.length > 0 || loadingPatients) && (
            <div className={inQueue.length > 0 ? "mt-1 border-t border-slate-100 pt-1" : ""}>
              <p className="px-4 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                Other patients
              </p>

              {loadingPatients ? (
                <p className="px-4 py-3 text-sm text-slate-500">Loading patients…</p>
              ) : (
                otherPatients.map((patient) => (
                  <div
                    key={patient.patient_id}
                    className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-slate-50"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-900">
                        {patient.first_name} {patient.last_name}
                      </p>
                      <p className="truncate text-xs text-slate-500">
                        {patient.phone || patient.email || "No contact information"}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setOpen(false);
                        onChange("");
                        onAddWalkIn(patient.patient_id);
                      }}
                      className="shrink-0 rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-bold text-white hover:bg-brand-600"
                    >
                      Add walk-in
                    </button>
                  </div>
                ))
              )}
            </div>
          )}

          {patientsError && (
            <p className="px-4 py-3 text-sm text-rose-600">{patientsError}</p>
          )}

          {nothingFound && (
            <p className="px-4 py-3 text-sm text-slate-500">
              No patient matches “{value.trim()}”.
            </p>
          )}

          <div className="mt-1 border-t border-slate-100 px-2 pt-2">
            <Link
              to="/patients/add"
              className="flex items-center gap-2 rounded-lg px-2 py-2 text-sm font-semibold text-brand-700 hover:bg-brand-50"
            >
              <UserPlus size={16} />
              Add new patient
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

export default QueuePatientSearch;
