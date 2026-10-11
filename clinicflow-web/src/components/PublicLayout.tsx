import type { ReactNode } from "react";
import { Link, NavLink } from "react-router-dom";

import logo from "../assets/logo-new.svg";
import Footer from "./Footer";
import { useAuth } from "../context/AuthContext";
import { usePatientAuth } from "../context/PatientAuthContext";

/*
 * Frame for pages anyone can read without signing in
 * (About, FAQ, Contact, and "page not found"). Signed-in
 * users get a link back to their own portal.
 */
function PublicLayout({ children }: { children: ReactNode }) {
  const { staff, loading: staffLoading } = useAuth();
  const { patient, loading: patientLoading } = usePatientAuth();

  // Until both sessions are known, show no sign-in button
  // rather than a wrong one.
  const sessionKnown = !staffLoading && !patientLoading;

  const portalLink = staff
    ? {
        to:
          staff.role === "doctor"
            ? "/doctor/dashboard"
            : "/dashboard",
        label: "Back to ClinicFlow",
      }
    : patient
      ? { to: "/patient/dashboard", label: "My portal" }
      : { to: "/login", label: "Sign in" };

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `rounded-lg px-3 py-2 text-sm font-medium transition ${
      isActive
        ? "text-[#13B2B3]"
        : "text-slate-600 hover:text-slate-950"
    }`;

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
          <Link to="/" aria-label="ClinicFlow home">
            <img
              src={logo}
              alt="ClinicFlow"
              className="h-8 w-auto sm:h-9"
            />
          </Link>

          <nav className="flex flex-wrap items-center gap-1">
            <NavLink to="/how-it-works" className={linkClass}>
              How it works
            </NavLink>
            <NavLink to="/about" className={linkClass}>
              About
            </NavLink>
            <NavLink to="/faq" className={linkClass}>
              FAQ
            </NavLink>
            <NavLink to="/contact" className={linkClass}>
              Contact
            </NavLink>

            {sessionKnown && (
            <Link
              to={portalLink.to}
              className="ml-1 rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              {portalLink.label}
            </Link>
            )}
          </nav>
        </div>
      </header>

      <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        {children}
      </main>

      <Footer />
    </div>
  );
}

export default PublicLayout;
