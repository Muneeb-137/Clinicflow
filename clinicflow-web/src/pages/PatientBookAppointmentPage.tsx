import { Navigate } from "react-router-dom";

import BookAppointmentPage from "./BookAppointmentPage";
import { usePatientAuth } from "../context/PatientAuthContext";

function PatientBookAppointmentPage() {
  const {
    patient,
    loading,
  } = usePatientAuth();

  if (loading) {
    return (
      <div className="p-6 text-sm text-slate-500">
        Loading...
      </div>
    );
  }

  if (!patient) {
    return (
      <Navigate
        to="/patient/login"
        replace
      />
    );
  }

  return (
    <BookAppointmentPage
      mode="patient"
      loggedInPatient={patient}
    />
  );
}

export default PatientBookAppointmentPage;