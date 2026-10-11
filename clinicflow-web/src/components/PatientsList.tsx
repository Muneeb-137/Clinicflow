import { apiFetch } from "../lib/api";
import {useEffect, useMemo, useState} from "react";
import {
  useNavigate,
} from "react-router-dom";
import {
  Eye,
  Mail,
  Phone,
  Search,
  UserRound,
  UserCheck,
  Filter,
  ChevronLeft,
  ChevronRight,
  UserX,
  MoreHorizontal,
  UserMinus,
  UserPlus,
  Pencil,
  X,
} from "lucide-react";


//creates a type
//every patient object must look like this  
type Patient = {

    patient_id: number;
    first_name: string;
    last_name: string;
    date_of_birth: string;
    phone: string | null;
    email: string | null; 
    status: "active" | "inactive";
};

type PatientProfile = {
  patient_id: number;
  first_name: string;
  last_name: string;
  date_of_birth: string;
  phone: string | null;
  email: string | null;
  address_line: string | null;
  city: string | null;
  province: string | null;
  postal_code: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  primary_doctor_id: number | null;
  primary_doctor_first_name: string | null;
  primary_doctor_last_name: string | null;
  primary_doctor_specialty: string | null;
  notes: string | null;
  status: "active" | "inactive";
};

type StatusFilter = "all" | "active" | "inactive";

// Date-only values must not be parsed as UTC midnight
// (new Date("YYYY-MM-DD")), or they can display one day
// early in North American time zones. Build a local date
// from the Y-M-D parts instead.
function formatDateOfBirth(date: string | null | undefined) {
  if (!date) {
    return "Not provided";
  }

  const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec(date);

  if (!dateOnlyMatch) {
    return date;
  }

  const localDate = new Date(
    Number(dateOnlyMatch[1]),
    Number(dateOnlyMatch[2]) - 1,
    Number(dateOnlyMatch[3]),
  );

  return localDate.toLocaleDateString("en-CA", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function getInitials(firstName: string, lastName: string) {
  return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
}



//this function creates a react componenent
//returns HTML (jsx) - syntax for HTML basically
function PatientsList(){
    //react state 
    // webpage remember those changing values
    //from empty patient to patients filled
    //array destructuring current value,update function
    //patients is value, setPatients changes value

    const navigate = useNavigate();


    const [selectedPatient, setSelectedPatient] =
  useState<PatientProfile | null>(null);

    const [profileLoading, setProfileLoading] =
  useState(false);

    const [profileError, setProfileError] =
  useState("");
    
    const [patients, setPatients] = useState<Patient[]> ([]);
    
    //loading=true initially becaus we're downloading
    const [loading, setLoading] = useState(true);

    //error state 
    //initially error is "" empty string 
    const [error, setError] = useState("");

    const [searchTerm, setSearchTerm] = useState("");
    
    const [statusFilter, setStatusFilter] =
    useState<StatusFilter>("all");

    const [openMenu, setOpenMenu] = useState<number | null>(null);

    const [currentPage, setCurrentPage] = useState(1);

    const patientsPerPage = 10;   


    useEffect (() => {
        async function loadPatients(){
            try {
                const response = await apiFetch(
                    "/api/patients"
                );

                if(!response.ok) {
                    throw new Error ("Failed to load patients")
                }

                const data: Patient[] = await response.json();
                //converts JSON into javascript objects
                //converts to [Patient, Patient]

                setPatients(data);
                //store in state
                //before patients = []
                //after patients = [Sarah, John, Mike]
                //react automatically re-renders
            }catch(error){
                console.error(error);
                setError("Could not load patients.");
            }finally {
                setLoading(false);
            }
        }
            
            loadPatients();
        }, []);

          // Sends a PATCH request to update one patient's status.
  const updatePatientStatus = async (
    patientId: number,
    newStatus: "active" | "inactive",
  ) => {
    try {
      const response = await apiFetch(
        `/api/patients/${patientId}/status`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            status: newStatus,
          }),
        },
      );

      if (!response.ok) {
        throw new Error("Unable to update patient status");
      }

     const result = await response.json();
     const updatedPatient: Patient = result.patient;

      // Replace only the patient that was updated.
      setPatients((currentPatients) =>
        currentPatients.map((patient) =>
          patient.patient_id === updatedPatient.patient_id
            ? updatedPatient
            : patient,
        ),
      );

      // Close the action menu after the update succeeds.
      setOpenMenu(null);
    } catch (error) {
      console.error(error);
      alert("The patient status could not be updated.");
    }
  };

  async function viewPatientProfile(patientId: number) {
  try {
    setProfileLoading(true);
    setProfileError("");

    const response = await apiFetch(
      `/api/patients/${patientId}`,
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        data.message ?? "Unable to load patient profile.",
      );
    }

    setSelectedPatient(data);
  } catch (error) {
    console.error(error);

    setProfileError(
      error instanceof Error
        ? error.message
        : "Unable to load patient profile.",
    );
  } finally {
    setProfileLoading(false);
  }
}

        //runs efffect only once

         const activePatientCount = patients.filter(
    (patient) => patient.status === "active",
  ).length;

  const inactivePatientCount = patients.filter(
    (patient) => patient.status === "inactive",
  ).length;

  const filteredPatients = useMemo(() => {
    
    const normalizedSearch = searchTerm.toLowerCase().trim();

    

    return patients.filter((patient) => {
      const fullName =
        `${patient.first_name} ${patient.last_name}`.toLowerCase();

      const matchesSearch =
        fullName.includes(normalizedSearch) ||
        patient.phone?.includes(normalizedSearch) ||
        patient.email?.toLowerCase().includes(normalizedSearch);

      const matchesStatus =
        statusFilter === "all" ||
        patient.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [patients, searchTerm, statusFilter]);

  const totalPages = Math.ceil(
  filteredPatients.length / patientsPerPage,
);

// Keep the current page within range when the filtered
// list shrinks (e.g. a patient is marked inactive while
// filtering by "active").
const safeCurrentPage = Math.min(
  currentPage,
  Math.max(totalPages, 1),
);

useEffect(() => {
  if (currentPage !== safeCurrentPage) {
    setCurrentPage(safeCurrentPage);
  }
}, [currentPage, safeCurrentPage]);

const startIndex =
  (safeCurrentPage - 1) * patientsPerPage;

const endIndex =
  startIndex + patientsPerPage;

const paginatedPatients =
  filteredPatients.slice(
    startIndex,
    endIndex,
  );

  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white px-6 py-16 text-center shadow-sm">
        <div className="mx-auto h-9 w-9 animate-spin rounded-full border-4 border-slate-200 border-t-teal-500" />

        <p className="mt-4 font-medium text-slate-700">
          Loading patients...
        </p>

        <p className="mt-1 text-sm text-slate-500">
          Retrieving patient records from the database.
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 px-6 py-14 text-center">
        <p className="font-semibold text-red-700">{error}</p>

        <p className="mt-2 text-sm text-red-600">
          Make sure your Express server is running on port 5000.
        </p>
      </div>
    );
  }

  return (
    <section>
      {/* Summary cards */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {/* Total patients */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-500">
                Total patients
              </p>

              <p className="mt-2 text-2xl font-bold text-slate-950">
                {patients.length}
              </p>
            </div>

            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#F5FCFD] text-[#13B2B3] ring-1 ring-[#149BC0]/20">
              <UserRound size={21} />
            </div>
          </div>
        </div>

        {/* Active patients */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-500">
                Active patients
              </p>

              <p className="mt-2 text-2xl font-bold text-slate-950">
                {activePatientCount}
              </p>
            </div>

            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
              <UserCheck size={21} />
            </div>
          </div>
        </div>

        {/* Inactive patients */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:col-span-2 xl:col-span-1">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-500">
                Inactive patients
              </p>

              <p className="mt-2 text-2xl font-bold text-slate-950">
                {inactivePatientCount}
              </p>
            </div>

            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-100 text-slate-500">
              <UserX size={21} />
            </div>
          </div>
        </div>
      </div>

      {/* Main table card */}
      <div className="overflow-visible rounded-2xl border border-slate-200 bg-white shadow-sm">
        {/* Search and filter bar */}
        <div className="flex flex-col justify-between gap-4 border-b border-slate-200 p-5 lg:flex-row lg:items-center">
          <div className="relative w-full lg:max-w-md">
            <Search
              size={18}
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
            />

            <input
              type="text"
              value={searchTerm}
              onChange={(event) => {
                setSearchTerm(event.target.value);
                setCurrentPage(1);
              }}
              placeholder="Search by name, email, or phone..."
              className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-4 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-[#149BC0] focus:bg-white focus:ring-4 focus:ring-[#149BC0]/10"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <Filter size={17} />
              <span>Filter:</span>
            </div>

            <select
              value={statusFilter}
              onChange={(event) => {
                setStatusFilter(
                  event.target.value as StatusFilter,
                );
                setCurrentPage(1);
              }}
              className="h-11 rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 outline-none transition focus:border-[#149BC0] focus:ring-4 focus:ring-[#149BC0]/10"
            >
              <option value="all">All patients</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
        </div>

        {/* Empty database state */}
        {patients.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
              <UserRound size={22} />
            </div>

            <p className="mt-4 font-semibold text-slate-900">
              No patients found
            </p>

            <p className="mt-1 text-sm text-slate-500">
              No patients have been added to the database yet.
            </p>
          </div>
        ) : (
          <div className="overflow-visible">
            <table className="w-full min-w-[1000px] border-collapse text-left">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80">
                  <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Patient
                  </th>

                  <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Contact
                  </th>

                  <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Date of birth
                  </th>

                  <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Status
                  </th>

                  <th className="px-6 py-4 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Actions
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {paginatedPatients.map((patient) => (
                  <tr
                    key={patient.patient_id}
                    className="group transition hover:bg-slate-50/80"
                  >
                    {/* Patient name and ID */}
                    <td className="px-6 py-5">
                      <div className="flex items-center gap-3.5">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#F5FCFD] text-[#13B2B3] text-sm font-bold ring-1 ring-[#149BC0]/20">
                          {getInitials(
                            patient.first_name,
                            patient.last_name,
                          )}
                        </div>

                        <div>
                          <p className="font-semibold text-slate-900">
                            {patient.first_name}{" "}
                            {patient.last_name}
                          </p>

                          <p className="mt-1 text-xs text-slate-400">
                            Patient #
                            {String(
                              patient.patient_id,
                            ).padStart(4, "0")}
                          </p>
                        </div>
                      </div>
                    </td>

                    {/* Contact details */}
                    <td className="px-6 py-5">
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-2 text-sm text-slate-700">
                          <Phone
                            size={14}
                            className="shrink-0 text-slate-400"
                          />

                          <span>
                            {patient.phone ?? "Not provided"}
                          </span>
                        </div>

                        <div className="flex items-center gap-2 text-sm text-slate-500">
                          <Mail
                            size={14}
                            className="shrink-0 text-slate-400"
                          />

                          <span>
                            {patient.email ?? "Not provided"}
                          </span>
                        </div>
                      </div>
                    </td>

                    {/* Date of birth */}
                    <td className="px-6 py-5 text-sm text-slate-600">
                      {formatDateOfBirth(
                        patient.date_of_birth,
                      )}
                    </td>

                    {/* Status badge */}
                    <td className="px-6 py-5">
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
                          patient.status === "active"
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${
                            patient.status === "active"
                              ? "bg-emerald-500"
                              : "bg-slate-400"
                          }`}
                        />

                        {patient.status === "active"
                          ? "Active"
                          : "Inactive"}
                      </span>
                    </td>

                    {/* Actions */}
                    <td className="px-6 py-5">
                      <div className="flex items-center justify-end gap-2">
                       <button
                            type="button"
                            onClick={() =>
                                viewPatientProfile(patient.patient_id)
                            }
                            aria-label={`View ${patient.first_name} ${patient.last_name}`}
                            className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:border-[#13B2B3]/40 hover:bg-[#F5FCFD] hover:text-[#13B2B3]"
                            >
                            <Eye size={15} />
                            View Profile
                            </button>

                        <div className="relative">
                        <button
                            type="button"
                            onClick={() =>
                            setOpenMenu(
                                openMenu === patient.patient_id
                                ? null
                                : patient.patient_id,
                            )
                            }
                            className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                        >
                            <MoreHorizontal size={18} />
                        </button>

                        {openMenu === patient.patient_id && (
                            <div className="absolute right-0 top-11 z-50 w-52 overflow-hidden rounded-xl border border-slate-200 bg-white py-2 shadow-xl">
                            {/* Edit */}
                            <button
                                type="button"
                                onClick={() => {
                                    setOpenMenu(null);

                                    navigate(
                                    `/patients/${patient.patient_id}/edit`,
                                    );
                                }}
                                className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-slate-700 transition hover:bg-slate-50"
                                >
                                <Pencil size={16} />
                                Edit Profile
                                </button>

                            {/* Active / inactive */}
                            {patient.status === "active" ? (
                                <button
                                  type="button"
                                  onClick={() =>
                                    updatePatientStatus(
                                      patient.patient_id,
                                      "inactive",
                                    )
                                  }
                                className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-slate-700 transition hover:bg-slate-50"
                                >
                                <UserMinus size={16} />

                                Mark Inactive
                                </button>
                            ) : (
                                <button
                                  type="button"
                                  onClick={() =>
                                    updatePatientStatus(
                                      patient.patient_id,
                                      "active",
                                    )
                                  }
                                className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-slate-700 transition hover:bg-slate-50"
                                >
                                <UserPlus size={16} />

                                Mark Active
                                </button>
                            )}
                            </div>
                        )}
                        </div>
                      </div>
                    </td>
                  </tr>
                ))}

                {/* No search or filter results */}
                {filteredPatients.length === 0 && (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-6 py-16 text-center"
                    >
                      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                        <Search size={21} />
                      </div>

                      <p className="mt-4 font-semibold text-slate-900">
                        No matching patients
                      </p>

                      <p className="mt-1 text-sm text-slate-500">
                        Try another search term or status
                        filter.
                      </p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Table footer */}
          {patients.length > 0 && (
            <div className="flex flex-col justify-between gap-4 border-t border-slate-200 px-6 py-4 sm:flex-row sm:items-center">
              <p className="text-sm text-slate-500">
                Showing{" "}
                <span className="font-semibold text-slate-700">
                  {filteredPatients.length === 0
                    ? 0
                    : startIndex + 1}
                </span>
                {"–"}
                <span className="font-semibold text-slate-700">
                  {Math.min(
                    endIndex,
                    filteredPatients.length,
                  )}
                </span>{" "}
                of{" "}
                <span className="font-semibold text-slate-700">
                  {filteredPatients.length}
                </span>{" "}
                patients
              </p>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={safeCurrentPage === 1}
                  onClick={() =>
                    setCurrentPage(
                      Math.max(safeCurrentPage - 1, 1),
                    )
                  }
                  aria-label="Previous page"
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition enabled:hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <ChevronLeft size={17} />
                </button>

                {Array.from(
                  { length: totalPages },
                  (_, index) => {
                    const pageNumber = index + 1;

                    return (
                      <button
                        key={pageNumber}
                        type="button"
                        onClick={() =>
                          setCurrentPage(pageNumber)
                        }
                        className={`flex h-9 w-9 items-center justify-center rounded-lg text-sm font-semibold transition ${
                          safeCurrentPage === pageNumber
                            ? "bg-slate-950 text-white"
                            : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                        }`}
                      >
                        {pageNumber}
                      </button>
                    );
                  },
                )}

                <button
                  type="button"
                  disabled={
                    safeCurrentPage === totalPages ||
                    totalPages === 0
                  }
                  onClick={() =>
                    setCurrentPage(
                      Math.min(safeCurrentPage + 1, totalPages),
                    )
                  }
                  aria-label="Next page"
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition enabled:hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <ChevronRight size={17} />
                </button>
              </div>
            </div>
          )}
          </div>

      {/* Patient profile modal */}
{(selectedPatient || profileLoading || profileError) && (
  <div
    data-dialog className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/40 p-4 backdrop-blur-[2px]"
    onClick={() => {
      if (!profileLoading) {
        setSelectedPatient(null);
        setProfileError("");
      }
    }}
  >
    <div
      className="w-full max-w-3xl rounded-2xl border border-slate-200 bg-white shadow-2xl max-h-[calc(100dvh-2rem)] overflow-y-auto"
      onClick={(event) => event.stopPropagation()}
    >
      {profileLoading ? (
        <div className="flex min-h-[350px] flex-col items-center justify-center">
          <div className="h-9 w-9 animate-spin rounded-full border-4 border-slate-200 border-t-[#13B2B3]" />

          <p className="mt-4 text-sm font-medium text-slate-600">
            Loading patient profile...
          </p>
        </div>
      ) : profileError ? (
        <div className="p-8">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-xl font-semibold text-slate-900">
                Unable to load profile
              </h2>

              <p className="mt-2 text-sm text-red-600">
                {profileError}
              </p>
            </div>

            <button
              type="button"
              onClick={() => {
                setProfileError("");
                setSelectedPatient(null);
              }}
              className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
            >
              <X size={20} />
            </button>
          </div>
        </div>
      ) : selectedPatient ? (
        <>
          {/* Header */}
          <div className="border-b border-slate-200 px-7 py-6">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#F5FCFD] text-lg font-bold text-[#13B2B3] ring-1 ring-[#13B2B3]/20">
                  {getInitials(
                    selectedPatient.first_name,
                    selectedPatient.last_name,
                  )}
                </div>

                <div>
                  <div className="flex flex-wrap items-center gap-3">
                    <h2 className="text-xl font-semibold text-slate-950">
                      {selectedPatient.first_name}{" "}
                      {selectedPatient.last_name}
                    </h2>

                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
                        selectedPatient.status === "active"
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${
                          selectedPatient.status === "active"
                            ? "bg-emerald-500"
                            : "bg-slate-400"
                        }`}
                      />

                      {selectedPatient.status === "active"
                        ? "Active"
                        : "Inactive"}
                    </span>
                  </div>

                  <p className="mt-1 text-sm text-slate-500">
                    Patient #
                    {String(
                      selectedPatient.patient_id,
                    ).padStart(4, "0")}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() =>
                  setSelectedPatient(null)
                }
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                aria-label="Close patient profile"
                data-dialog-close
              >
                <X size={20} />
              </button>
            </div>
          </div>

          {/* Details */}
          <div className="max-h-[70vh] overflow-y-auto px-7 py-6">
            <div className="grid gap-x-8 gap-y-6 sm:grid-cols-2">
              <ProfileField
                label="Date of birth"
                value={formatDateOfBirth(
                  selectedPatient.date_of_birth,
                )}
              />

              <ProfileField
                label="Phone number"
                value={selectedPatient.phone}
              />

              <ProfileField
                label="Email"
                value={selectedPatient.email}
              />

              <ProfileField
                label="Address"
                value={selectedPatient.address_line}
              />

              <ProfileField
                label="City"
                value={selectedPatient.city}
              />

              <ProfileField
                label="Province"
                value={selectedPatient.province}
              />

              <ProfileField
                label="Postal code"
                value={selectedPatient.postal_code}
              />

              <ProfileField
                label="Primary care provider"
                value={
                  selectedPatient.primary_doctor_first_name &&
                  selectedPatient.primary_doctor_last_name
                    ? `Dr. ${selectedPatient.primary_doctor_first_name} ${selectedPatient.primary_doctor_last_name}${
                        selectedPatient.primary_doctor_specialty
                          ? ` — ${selectedPatient.primary_doctor_specialty}`
                          : ""
                      }`
                    : null
                }
              />

              <ProfileField
                label="Emergency contact"
                value={
                  selectedPatient.emergency_contact_name
                }
              />

              <ProfileField
                label="Emergency contact phone"
                value={
                  selectedPatient.emergency_contact_phone
                }
              />
            </div>

            <div className="mt-7 border-t border-slate-200 pt-6">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Notes
              </p>

              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                {selectedPatient.notes?.trim() ||
                  "No notes have been added."}
              </p>
            </div>
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-3 border-t border-slate-200 bg-slate-50/70 px-7 py-4">
            <button
              type="button"
              onClick={() =>
                setSelectedPatient(null)
              }
              className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Close
            </button>

            <button
              type="button"
              onClick={() =>
                navigate(
                  `/patients/${selectedPatient.patient_id}/edit`,
                )
              }
              className="inline-flex items-center gap-2 rounded-lg bg-[#13B2B3] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#0f9fa0]"
            >
              <Pencil size={16} />
              Edit Profile
            </button>
          </div>
        </>
      ) : null}
    </div>
  </div>
)}
    </section>
  );
}

type ProfileFieldProps = {
  label: string;
  value: string | null | undefined;
};

function ProfileField({
  label,
  value,
}: ProfileFieldProps) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
        {label}
      </p>

      <p className="mt-1.5 text-sm font-medium text-slate-800">
        {value?.trim() || "Not provided"}
      </p>
    </div>
  );
}

export default PatientsList;
