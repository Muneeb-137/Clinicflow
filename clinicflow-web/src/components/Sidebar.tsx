import { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";

import logo from "../assets/logo-new.svg";
import doorIcon from "../assets/bxs-door-open.svg";
import userGroup from "../assets/user-multiple-group-solid (1).svg";
import homeIcon from "../assets/home.svg";
import appointmentsIcon from "../assets/calendar-month.svg";
import analyticsIcon from "../assets/analytics-bold.svg";
import queueIcon from "../assets/queue.svg";
import { LogOut, UserCog } from "lucide-react";
import {
  useLocation,
  useNavigate,
} from "react-router-dom";
import { useAuth } from "../context/AuthContext";

function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { logout, staff } = useAuth();

  // Staff Directory and Analytics are for admins.
  const isAdmin = staff?.role === "admin";

  useEffect(() => {
  function handleConfirmedLogout() {
    logout();

    navigate("/login", {
      replace: true,
    });
  }

  window.addEventListener(
    "clinicflow:confirmed-staff-logout",
    handleConfirmedLogout,
  );

  return () => {
    window.removeEventListener(
      "clinicflow:confirmed-staff-logout",
      handleConfirmedLogout,
    );
  };
}, [logout, navigate]);

function handleNavigation(
  event: React.MouseEvent<HTMLAnchorElement>,
  path: string,
) {
  if (
    location.pathname !== "/appointments/book" ||
    path === "/appointments/book"
  ) {
    return;
  }

  const hasBookingSession =
    sessionStorage.getItem(
      "clinicflow_staff_booking",
    ) !== null;

  if (!hasBookingSession) {
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
  const hasBookingSession =
    sessionStorage.getItem(
      "clinicflow_staff_booking",
    ) !== null;

  if (
    location.pathname === "/appointments/book" &&
    hasBookingSession
  ) {
    sessionStorage.setItem(
      "clinicflow_pending_booking_navigation",
      "__staff_logout__",
    );

    window.dispatchEvent(
      new Event(
        "clinicflow:show-leave-booking-modal",
      ),
    );

    return;
  }

  logout();

  navigate("/login", {
    replace: true,
  });
}
  const [patientsOpen, setPatientsOpen] = useState(false);
  const [appointmentsOpen, setAppointmentsOpen] = useState(false);
  const [queueOpen, setQueueOpen] = useState(false);
  const [roomsOpen, setRoomsOpen] = useState(false);
  const [staffOpen, setStaffOpen] = useState(false);
  const [analyticsOpen, setAnalyticsOpen] = useState(() =>
    location.pathname.startsWith("/analytics"),
  );

  return (
    <aside className="sticky top-0 flex h-screen w-64 shrink-0 flex-col bg-slate-950 text-white">
      <div className="min-h-0 flex-1 overflow-y-auto p-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className = "border-b border-slate-800 pb-6">
          <div className = "flex justify-center">
            <div className="rounded-2xl bg-white px-4 py-2 ring-1 ring-teal-500/20">
              <img 
                src={logo}
                alt="Clinicflow logo"
                className = "h-8 w-auto object-contain" 
              />
            </div>
          </div>
          
      
          
          <p className = "mt-3 text-center text-[11px] font-semibold uppercase tracking-[0.25em] text-slate-400">Next-Generation Clinic Intelligence</p>
          </div>
        

        <nav className = "mt-10 space-y-2">
          
          
    <NavLink
      to="/dashboard"
      onClick={(event) =>
        handleNavigation(event, "/dashboard")
      }
      className="flex items-center gap-3 rounded-lg px-4 py-3 text-slate-300 hover:bg-slate-800 hover:text-white"
    >
      <img
        src={homeIcon}
        alt=""
        className="h-5 w-5"
      />

      <span>Dashboard</span>
    </NavLink>
            
            <div>
  <button
    type="button"
    onClick={() => setPatientsOpen(!patientsOpen)}
    className="flex w-full items-center justify-between rounded-lg px-4 py-3 text-slate-300 hover:bg-slate-800 hover:text-white"
  >
    <div className="flex items-center gap-3">
      <img
        src={userGroup}
        alt=""
        className="h-5 w-5"
      />

      <span>Patients</span>
    </div>

    <span
      className={`text-xl transition-transform duration-200 ${
        patientsOpen ? "rotate-90 text-teal-400" : ""
      }`}
    >
      ›
    </span>
  </button>

  {patientsOpen && (
    <div className="ml-8 mt-1 space-y-1 border-l border-slate-700 pl-5">
      <NavLink
        to="/patients"
        onClick={(event) =>
          handleNavigation(event, "/patients")
        }
        className="block rounded-md px-3 py-2 text-sm text-slate-400 hover:bg-slate-800 hover:text-white"
      >
        All Patients
      </NavLink>

      <NavLink
        to="/patients/add"
        onClick={(event) =>
          handleNavigation(event, "/patients/add")
        }
        className="block rounded-md px-3 py-2 text-sm text-slate-400 hover:bg-slate-800 hover:text-white"
      >
      
        
        <span>Add Patient</span>
      </NavLink>
    </div>
  )}
</div>
              <div>
  <button
    type="button"
    onClick={() => setAppointmentsOpen(!appointmentsOpen)}
    className="flex w-full items-center justify-between rounded-lg px-4 py-3 text-slate-300 hover:bg-slate-800 hover:text-white"
  >
    <div className="flex items-center gap-3">
      <img
        src={appointmentsIcon}
        alt=""
        className="h-5 w-5"
      />

      <span>Appointments</span>
    </div>

    <span
      className={`text-xl transition-transform duration-200 ${
        appointmentsOpen ? "rotate-90 text-teal-400" : ""
      }`}
    >
      ›
    </span>
  </button>

  {appointmentsOpen && (
    <div className="ml-8 mt-1 space-y-1 border-l border-slate-700 pl-5">
      <NavLink
        to="/appointments/today"
        onClick={(event) =>
          handleNavigation(event, "/appointments/today")
        }
        className="block rounded-md px-3 py-2 text-sm text-slate-400 hover:bg-slate-800 hover:text-white"
      >
        Today's Appointments
      </NavLink>

      <NavLink
        to="/appointments/history"
        onClick={(event) =>
          handleNavigation(event, "/appointments/history")
        }
        className={({ isActive }) =>
          `block rounded-md px-3 py-2 text-sm transition ${
            isActive
              ? "bg-slate-800 font-medium text-white"
              : "text-slate-400 hover:bg-slate-800 hover:text-white"
          }`
        }
      >
        Missed & Cancellations
      </NavLink>

     <NavLink
      to="/appointments/book"
      onClick={(event) =>
        handleNavigation(event, "/appointments/book")
      }
      className="block rounded-md px-3 py-2 text-sm text-slate-400 hover:bg-slate-800 hover:text-white"
    >
      Book Appointment
    </NavLink>

       <NavLink
      to="/appointments/calendar"
      onClick={(event) =>
        handleNavigation(event, "/appointments/calendar")
      }
      className="block rounded-md px-3 py-2 text-sm text-slate-400 hover:bg-slate-800 hover:text-white"
    >
      Calendar
    </NavLink>
    </div>
  )}
</div>
              <div>
  <button
    type="button"
    onClick={() => setQueueOpen(!queueOpen)}
    className="flex w-full items-center justify-between rounded-lg px-4 py-3 text-slate-300 hover:bg-slate-800 hover:text-white"
  >
    <div className="flex items-center gap-3">
      <img
        src={queueIcon}
        alt=""
        className="h-5 w-5"
      />

      <span>Live Queue</span>
    </div>

    <span
      className={`text-xl transition-transform duration-200 ${
        queueOpen ? "rotate-90 text-teal-400" : ""
      }`}
    >
      ›
    </span>
  </button>

 {queueOpen && (
  <div className="ml-8 mt-1 space-y-1 border-l border-slate-700 pl-5">
    <NavLink
      to="/queue/current"
      onClick={(event) =>
        handleNavigation(event, "/queue/current")
      }
      className={({ isActive }) =>
        `block rounded-md px-3 py-2 text-sm transition ${
          isActive
            ? "bg-slate-800 font-medium text-white"
            : "text-slate-400 hover:bg-slate-800 hover:text-white"
        }`
      }
    >
      Current Queue
    </NavLink>

    
    </div>
  )}
</div>
              <div>
  <button
    type="button"
    onClick={() => setRoomsOpen(!roomsOpen)}
    className="flex w-full items-center justify-between rounded-lg px-4 py-3 text-slate-300 hover:bg-slate-800 hover:text-white"
  >
    <div className="flex items-center gap-3">
      <img
        src={doorIcon}
        alt=""
        className="h-5 w-5"
      />

      <span>Rooms</span>
    </div>

    <span
      className={`text-xl transition-transform duration-200 ${
        roomsOpen ? "rotate-90 text-teal-400" : ""
      }`}
    >
      ›
    </span>
  </button>

  {roomsOpen && (
    <div className="ml-8 mt-1 space-y-1 border-l border-slate-700 pl-5">
     <NavLink
  to="/provider-status"
   onClick={(event) =>
    handleNavigation(event, "/provider-status")
  }
  className="block rounded-md px-3 py-2 text-sm text-slate-400 transition hover:bg-slate-800 hover:text-white"
>
  Provider Status
</NavLink>
 
    </div>
  )}
</div>
              {isAdmin && (
              <>
              <div>
  <button
    type="button"
    onClick={() => setStaffOpen(!staffOpen)}
    className="flex w-full items-center justify-between rounded-lg px-4 py-3 text-slate-300 hover:bg-slate-800 hover:text-white"
  >
    <div className="flex items-center gap-3">
      <img
        src={userGroup}
        alt=""
        className="h-5 w-5"
      />

      <span>Staff</span>
    </div>

    <span
      className={`text-xl transition-transform duration-200 ${
        staffOpen ? "rotate-90 text-teal-400" : ""
      }`}
    >
      ›
    </span>
  </button>

  {staffOpen && (
    <div className="ml-8 mt-1 space-y-1 border-l border-slate-700 pl-5">
       <NavLink
      to="/staff"
       onClick={(event) =>
        handleNavigation(event, "/staff")
        }
      className={({ isActive }) =>
        `block rounded-md px-3 py-2 text-sm transition ${
          isActive
            ? "bg-slate-800 font-semibold text-white"
            : "text-slate-400 hover:bg-slate-800 hover:text-white"
        }`
      }
    >
      Staff Directory
    </NavLink>

    <NavLink
      to="/schedule"
      onClick={(event) =>
        handleNavigation(event, "/schedule")
      }
      className={({ isActive }) =>
        `block rounded-md px-3 py-2 text-sm transition ${
          isActive
            ? "bg-slate-800 font-semibold text-white"
            : "text-slate-400 hover:bg-slate-800 hover:text-white"
        }`
      }
    >
      Schedules
    </NavLink>

    </div>
  )}
</div>
              <div>
  <button
    type="button"
    onClick={() => setAnalyticsOpen(!analyticsOpen)}
    className="flex w-full items-center justify-between rounded-lg px-4 py-3 text-slate-300 hover:bg-slate-800 hover:text-white"
  >
    <div className="flex items-center gap-3">
      <img
        src={analyticsIcon}
        alt=""
        className="h-5 w-5"
      />

      <span>Analytics</span>
    </div>

    <span
      className={`text-xl transition-transform duration-200 ${
        analyticsOpen ? "rotate-90 text-teal-400" : ""
      }`}
    >
      ›
    </span>
  </button>

  {analyticsOpen && (
    <div className="ml-8 mt-1 space-y-1 border-l border-slate-700 pl-5">
      <NavLink
        to="/analytics/wait-times"
        onClick={(event) =>
          handleNavigation(event, "/analytics/wait-times")
        }
        className={({ isActive }) =>
          `block rounded-md px-3 py-2 text-sm transition ${
            isActive
              ? "bg-slate-800 font-semibold text-white"
              : "text-slate-400 hover:bg-slate-800 hover:text-white"
          }`
        }
      >
        Wait Time Analytics
      </NavLink>
    </div>
  )}
</div>
              </>
              )}
        </nav>
        </div>

<div className="mt-auto border-t border-slate-800 px-6 py-6">
  <NavLink
    to="/account"
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
      className="shrink-0 text-slate-300"
    />

    <span>Sign out</span>
  </button>
</div>
        </aside>

  );
}

export default Sidebar;