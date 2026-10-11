import { CLINIC_TIME_ZONE } from "../utils/clinicTime";
import {
  CalendarDays,
  Plus,
} from "lucide-react";

import {
  useLocation,
  useNavigate,
} from "react-router-dom";

import logo from "../assets/logo-new.svg";
import { MobileMenuButton } from "./AppShell";

function PatientDashboardHeader() {
  const navigate = useNavigate();
  const location = useLocation();

  const getPageTitle = () => {
    switch (location.pathname) {
      case "/patient/dashboard":
        return "Dashboard";

      case "/patient/appointments":
        return "My Appointments";

      case "/patient/book":
        return "Book Appointment";

      case "/patient/queue":
        return "Live Queue";

      case "/patient/account":
        return "My account";

      default:
        return "Patient Portal";
    }
  };

  const formattedDate =
    new Intl.DateTimeFormat(
      "en-CA",
      {
        timeZone: CLINIC_TIME_ZONE,
        weekday: "long",
        month: "long",
        day: "numeric",
      },
    ).format(new Date());

  return (
    <header className="relative flex min-h-16 items-center gap-3 border-b border-slate-200 bg-white px-4 py-3 sm:px-6 lg:min-h-[100px] lg:px-8">
      <MobileMenuButton />

      {/* LEFT */}
      <div className="min-w-0">
        <h1 className="truncate text-lg font-bold tracking-tight text-slate-950 sm:text-2xl">
          {getPageTitle()}
        </h1>

        <p className="mt-0.5 truncate text-xs text-slate-500 sm:mt-1 sm:text-sm">
          {formattedDate}
        </p>
      </div>

      {/* CENTER LOGO */}
      <div className="pointer-events-none absolute left-1/2 top-1/2 hidden -translate-x-1/2 -translate-y-1/2 xl:block">
        <img
          src={logo}
          alt="ClinicFlow"
          className="h-11 w-auto"
        />
      </div>

      {/* RIGHT ACTIONS */}
      <div className="ml-auto flex shrink-0 items-center gap-2 sm:gap-4">
        <button
          type="button"
          onClick={() =>
            navigate(
              "/patient/appointments",
            )
          }
          className="hidden items-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50 md:inline-flex"
        >
          <CalendarDays className="h-4 w-4" />
          My Appointments
        </button>

        <button
          type="button"
          onClick={() =>
            navigate("/patient/book")
          }
          aria-label="Book appointment"
          className="inline-flex items-center gap-2 rounded-xl bg-[#020817] px-3 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 sm:px-5 sm:py-3"
        >
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">Book Appointment</span>
        </button>
      </div>
    </header>
  );
}

export default PatientDashboardHeader;