import PatientsList from "../components/PatientsList";


function PatientsPage() {
  return (
    <div className="mx-auto max-w-7xl">
      <div className="mb-8">
        <h1 className="text-3xl font-semibold text-slate-900">
          All Patients
        </h1>

        <p className="mt-2 text-slate-500">
          View and manage all registered clinic patients.
        </p>
      </div>

      <PatientsList />
    </div>
  );
}

export default PatientsPage;