import { useEffect } from "react";
import {
  CalendarDays,
  CalendarPlus,
  LayoutDashboard,
  LogOut,
  UserCog,
  UsersRound,
} from "lucide-react";

import {
  NavLink,
  useLocation,
  useNavigate,
} from "react-router-dom";

import logo from "../assets/logo-new.svg";
import { usePatientAuth } from "../context/PatientAuthContext";

function PatientSidebar() {
  const navigate = useNavigate();
  const location = useLocation();
 

  const {
    patient,
    logout,
  } = usePatientAuth();

  useEffect(() => {
  function handleConfirmedLogout() {
    logout();

    navigate("/patient/login", {
      replace: true,
    });
  }

  window.addEventListener(
    "clinicflow:confirmed-logout",
    handleConfirmedLogout,
  );

  return () => {
    window.removeEventListener(
      "clinicflow:confirmed-logout",
      handleConfirmedLogout,
    );
  };
}, [logout, navigate]);
  
 function handleNavigation(
  event: React.MouseEvent<HTMLAnchorElement>,
  path: string,
) {
  if (
    location.pathname !== "/patient/book" ||
    path === "/patient/book"
  ) {
    return;
  }

  event.preventDefault();

  sessionStorage.setItem(
    "clinicflow_pending_booking_navigation",
    path,
  );

  window.dispatchEvent(
    new Event(
      "clinicflow:show-leave-booking-modal",
    ),
  );
}

  function handleLogout() {
  if (location.pathname === "/patient/book") {
    sessionStorage.setItem(
      "clinicflow_pending_booking_navigation",
      "__logout__",
    );

    window.dispatchEvent(
      new Event(
        "clinicflow:show-leave-booking-modal",
      ),
    );

    return;
  }

  logout();

  navigate("/patient/login", {
    replace: true,
  });
}

  const navItems = [
    {
      label: "Dashboard",
      path: "/patient/dashboard",
      icon: LayoutDashboard,
    },
    {
      label: "My Appointments",
      path: "/patient/appointments",
      icon: CalendarDays,
    },
    {
      label: "Book Appointment",
      path: "/patient/book",
      icon: CalendarPlus,
    },
    {
      label: "Live Queue",
      path: "/patient/queue",
      icon: UsersRound,
    },
  ];

  const patientName = patient
    ? `${patient.first_name
        .charAt(0)
        .toUpperCase()}${patient.first_name
        .slice(1)
        .toLowerCase()} ${patient.last_name
        .charAt(0)
        .toUpperCase()}${patient.last_name
        .slice(1)
        .toLowerCase()}`
    : "Patient";

  return (
    <aside className="sticky top-0 flex h-screen w-64 shrink-0 flex-col border-r border-slate-800 bg-[#020817] text-white">
      <div className="flex-1 px-6 py-6">
        {/* Logo */}
        <div className="border-b border-slate-800 pb-6">
          <div className="flex justify-center">
            <div className="rounded-2xl bg-white px-4 py-2 ring-1 ring-teal-500/20">
              <img
                src={logo}
                alt="ClinicFlow logo"
                className="h-8 w-auto object-contain"
              />
            </div>
          </div>

          <p className="mt-4 text-center text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-400">
            Patient Portal
          </p>
        </div>

        {/* Navigation */}
        <nav className="mt-10 space-y-2">
          {navItems.map((item) => {
            const Icon = item.icon;

            return (
              <NavLink
                key={item.path}
                to={item.path}
                onClick={(event) =>
                  handleNavigation(event, item.path)
                }
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-lg px-4 py-3 transition ${
                    isActive
                      ? "bg-slate-800 font-medium text-white"
                      : "text-slate-300 hover:bg-slate-800 hover:text-white"
                  }`
                }
              >
                <Icon
                  size={20}
                  className="text-[#13B2B3]"
                />

                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>
      </div>

      {/* Patient identity + logout */}
      <div className="border-t border-slate-800 px-6 py-6">
        <div className="mb-4 px-3">
          <p className="text-base font-semibold text-white">
            {patientName}
          </p>

          <p className="mt-1 text-sm text-slate-400">
            Patient
          </p>
        </div>

        <NavLink
          to="/patient/account"
          className={({ isActive }) =>
            `mb-1 flex w-full items-center gap-4 rounded-lg px-3 py-3 text-left text-base font-medium transition ${
              isActive ? "bg-slate-800 text-white" : "text-slate-200 hover:bg-slate-800 hover:text-white"
            }`
          }
        >
          <UserCog size={22} strokeWidth={1.8} />
          <span>My account</span>
        </NavLink>

        <button
          type="button"
          onClick={handleLogout}
          className="flex w-full items-center gap-4 rounded-lg px-3 py-3 text-left text-base font-medium text-slate-200 transition hover:bg-slate-800 hover:text-white"
        >
          <LogOut
            size={22}
            strokeWidth={1.8}
          />

          <span>Sign out</span>
        </button>
      </div>
    </aside>
  );
}

export default PatientSidebar;