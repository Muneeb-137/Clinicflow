import { CLINIC_TIME_ZONE } from "../utils/clinicTime";
import {
  matchPath,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { Plus } from "lucide-react";

import logo from "../assets/logo-new.svg";
import { CLINIC_NAME } from "../config/clinic";
import { MobileMenuButton } from "./AppShell";

// Title shown for each staff page.
const PAGE_TITLES: [pattern: string, title: string][] = [
  ["/", "Dashboard"],
  ["/dashboard", "Dashboard"],
  ["/patients", "Patients"],
  ["/patients/add", "Add Patient"],
  ["/patients/:patientId/edit", "Edit Patient"],
  ["/appointments/today", "Today's Appointments"],
  ["/appointments/history", "Missed & Cancellations"],
  ["/appointments/book", "Book Appointment"],
  ["/appointments/calendar", "Calendar"],
  ["/queue/check-in", "Check-In"],
  ["/queue/current", "Live Queue"],
  ["/provider-status", "Provider Status"],
  ["/staff", "Staff Directory"],
  ["/schedule", "Schedules"],
  ["/account", "My account"],
  ["/analytics/wait-times", "Wait Time Analytics"],
];

function DashboardHeader() {
  const navigate = useNavigate();
  const location = useLocation();

  const title =
    PAGE_TITLES.find(([pattern]) =>
      matchPath(pattern, location.pathname),
    )?.[1] ?? "ClinicFlow";

  const formattedDate = new Date().toLocaleDateString("en-CA", {
    timeZone: CLINIC_TIME_ZONE,
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <header className="relative flex min-h-16 items-center gap-3 border-b border-slate-200 bg-white px-4 py-3 sm:px-6 lg:h-20 lg:px-8">
      <MobileMenuButton />

      <div className="min-w-0 flex-1">
        <h2 className="truncate text-lg font-bold text-slate-900 sm:text-2xl">
          {title}
        </h2>

        <p className="truncate text-xs text-slate-500 sm:text-sm">
          {formattedDate}
          {CLINIC_NAME && ` · ${CLINIC_NAME}`}
        </p>
      </div>

      <button
        type="button"
        onClick={() => navigate("/dashboard")}
        className="absolute left-1/2 hidden -translate-x-1/2 items-center justify-center transition-all duration-300 hover:scale-105 hover:opacity-90 xl:flex"
        aria-label="Go to dashboard"
      >
        <img
          src={logo}
          alt="ClinicFlow logo"
          className="w-40 cursor-pointer object-contain"
        />
      </button>

      <button
        type="button"
        onClick={() => navigate("/appointments/book")}
        className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-slate-950 px-3 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-slate-800 sm:px-5 sm:py-3"
        aria-label="New appointment"
      >
        <Plus size={16} />
        <span className="hidden sm:inline">New appointment</span>
      </button>
    </header>
  );
}

export default DashboardHeader;
