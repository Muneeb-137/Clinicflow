import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";

import { usePatientAuth } from "../context/PatientAuthContext";

type PatientProtectedRouteProps = {
  children: ReactNode;
};

function PatientProtectedRoute({
  children,
}: PatientProtectedRouteProps) {
  const {
    patient,
    loading,
  } = usePatientAuth();

  // Wait until PatientAuthContext has restored
  // the session from localStorage.
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F7F9FC]">
        <p className="text-sm text-slate-500">
          Loading...
        </p>
      </div>
    );
  }

  // The server confirmed a patient session.
  if (!patient) {
    return (
      <Navigate
        to="/patient/login"
        replace
      />
    );
  }

  return children;
}

export default PatientProtectedRoute;