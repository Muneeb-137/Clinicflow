import {
  CalendarDays,
  LayoutDashboard,
  LogOut,
  UserCog,
  Stethoscope,
  UsersRound,
} from "lucide-react";

import {
  NavLink,
  useNavigate,
} from "react-router-dom";

import logo from "../assets/logo-new.svg";
import { useAuth } from "../context/AuthContext";

function DoctorSidebar() {
  const navigate = useNavigate();

  const {
    staff,
    logout,
  } = useAuth();

  function handleLogout() {
    logout();

    navigate("/doctor/login", {
      replace: true,
    });
  }

  const navItems = [
    {
      label: "Dashboard",
      path: "/doctor/dashboard",
      icon: LayoutDashboard,
    },
    {
      label: "My Appointments",
      path: "/doctor/appointments",
      icon: CalendarDays,
    },
    {
      label: "My Queue",
      path: "/doctor/queue",
      icon: UsersRound,
    },
    {
      label: "My Status",
      path: "/doctor/status",
      icon: Stethoscope,
    },
  ];

  return (
    <aside className="sticky top-0 flex h-screen w-64 shrink-0 flex-col bg-slate-950 text-white">
      <div className="flex-1 px-6 py-6">
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
            Physician Portal
          </p>
        </div>

        <nav className="mt-10 space-y-2">
          {navItems.map((item) => {
            const Icon = item.icon;

            return (
              <NavLink
                key={item.path}
                to={item.path}
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

      <div className="border-t border-slate-800 px-6 py-6">
        <div className="mb-4 px-3">
          <p className="text-base font-semibold text-white">
            Dr. {staff?.first_name}{" "}
            {staff?.last_name}
          </p>

          <p className="mt-1 text-sm text-slate-400">
            Physician
          </p>
        </div>

        <NavLink
          to="/doctor/account"
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

export default DoctorSidebar;