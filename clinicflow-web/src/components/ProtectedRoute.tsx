import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { getSessionExpired } from "../lib/api";

type ProtectedRouteProps = {
  children: ReactNode;
};

function ProtectedRoute({
  children,
}: ProtectedRouteProps) {
  const { staff, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white">
        <div className="h-9 w-9 animate-spin rounded-full border-4 border-slate-200 border-t-[#13B2B3]" />
      </div>
    );
  }

  if (!staff) {
    return (
      <Navigate
        // Expired session: straight to staff sign-in.
        to={getSessionExpired("staff") ? "/login/staff" : "/login"}
        replace
      />
    );
  }

  // The staff portal is for admins and receptionists.
  // Doctors have their own portal.
  if (staff.role === "doctor") {
    return (
      <Navigate
        to="/doctor/dashboard"
        replace
      />
    );
  }

  return children;
}

export default ProtectedRoute;