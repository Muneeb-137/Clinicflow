import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

type AdminRouteProps = {
  children: ReactNode;
};

function AdminRoute({
  children,
}: AdminRouteProps) {
  const { staff, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-9 w-9 animate-spin rounded-full border-4 border-slate-200 border-t-[#13B2B3]" />
      </div>
    );
  }

  if (!staff) {
    return (
      <Navigate
        to="/login"
        replace
      />
    );
  }

  if (staff.role !== "admin") {
    return (
      <Navigate
        to="/"
        replace
      />
    );
  }

  return children;
}

export default AdminRoute;