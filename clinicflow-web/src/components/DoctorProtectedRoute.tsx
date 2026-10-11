import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";

import { useAuth } from "../context/AuthContext";

type DoctorProtectedRouteProps = {
  children: ReactNode;
};

function DoctorProtectedRoute({
  children,
}: DoctorProtectedRouteProps) {
  const {
    staff,
    loading,
  } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <p className="text-sm text-slate-500">
          Loading...
        </p>
      </div>
    );
  }

  if (!staff) {
    return (
      <Navigate
        to="/doctor/login"
        replace
      />
    );
  }

  if (
    staff.role !== "doctor" ||
    !staff.doctor_id
  ) {
    return (
      <Navigate
        to="/dashboard"
        replace
      />
    );
  }

  return children;
}

export default DoctorProtectedRoute;