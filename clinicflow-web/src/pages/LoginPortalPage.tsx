import {
  ArrowRight,
  CalendarDays,
  Clock3,
  LayoutDashboard,
  ListChecks,
  Stethoscope,
  UserRound,
  UsersRound,
} from "lucide-react";

import { useNavigate } from "react-router-dom";
import logo from "../assets/logo-new.svg";

function LoginPortalPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-[#F7F9FC] lg:grid lg:grid-cols-[0.9fr_1.1fr]">
      {/* LEFT BRAND PANEL */}
      <section className="relative hidden min-h-screen overflow-hidden bg-[#020817] px-12 py-14 text-white lg:flex lg:flex-col">
        {/* Decorative glow */}
        <div className="absolute -left-20 top-28 h-72 w-72 rounded-full bg-[#13B2B3]/10 blur-3xl" />
        <div className="absolute bottom-0 right-0 h-96 w-96 rounded-full bg-blue-500/10 blur-3xl" />

        {/* Logo */}
        <div className="relative z-10">
          <div className="inline-flex items-center rounded-2xl bg-white px-5 py-3 shadow-sm">
            <img
              src={logo}
              alt="ClinicFlow"
              className="h-12 w-auto object-contain"
            />
          </div>
        </div>

        {/* Main branding */}
        <div className="relative z-10 flex flex-1 items-center">
          <div className="max-w-lg">
            <p className="mb-5 text-sm font-semibold uppercase tracking-[0.28em] text-[#40D2D3]">
              Next-generation clinic intelligence
            </p>

            <h1 className="text-5xl font-bold leading-[1.12] tracking-tight">
              One clinic. One flow.
              <br />
              A better experience for everyone.
            </h1>

            <p className="mt-6 max-w-[520px] text-lg leading-8 text-slate-300">
              One connected platform for clinic operations,
              patient flow, appointments, and real-time care
              coordination.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="relative z-10 border-t border-slate-800 pt-6">
          <p className="text-sm text-slate-400">
            ClinicFlow Healthcare Operations Platform
          </p>
        </div>
      </section>

      {/* RIGHT PORTAL SELECTION */}
      <section className="flex min-h-screen items-center justify-center px-6 py-12 sm:px-10 lg:px-16">
        <div className="w-full max-w-2xl">
          {/* Mobile logo */}
          <div className="mb-10 lg:hidden">
            <img
              src={logo}
              alt="ClinicFlow"
              className="h-12 w-auto object-contain"
            />
          </div>

          {/* Heading */}
          <div className="mb-8">
            <span className="inline-flex rounded-full bg-[#13B2B3]/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-[#0B999A]">
              Secure access
            </span>

            <h2 className="mt-5 text-4xl font-bold tracking-tight text-slate-950">
              Access ClinicFlow
            </h2>

            <p className="mt-3 text-lg text-slate-500">
              Choose how you want to continue.
            </p>
          </div>

           {/* PORTAL CARDS */}
          <div className="grid gap-5 md:grid-cols-3">
            {/* STAFF PORTAL */}
            <button
              type="button"
              onClick={() => navigate("/login/staff")}
              className="group relative flex flex-col overflow-hidden rounded-[1.5rem] border border-slate-200 bg-white p-5 text-left shadow-[0_12px_32px_rgba(15,23,42,0.06)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_20px_45px_rgba(15,23,42,0.10)]"
            >
              <div className="absolute inset-x-0 top-0 h-1 bg-[#13B2B3]" />

              <div className="flex items-start justify-between gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#13B2B3]/10 text-[#13B2B3]">
                  <UsersRound size={23} />
                </div>

                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#13B2B3]/30 text-[#13B2B3] transition group-hover:bg-[#13B2B3]/10">
                  <ArrowRight
                    size={17}
                    className="transition-transform duration-300 group-hover:translate-x-0.5"
                  />
                </div>
              </div>

              <div className="mt-5">
                <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#13B2B3]">
                  Clinic operations
                </p>

                <h3 className="mt-2 text-xl font-bold tracking-tight text-slate-950">
                  Staff Portal
                </h3>

                <p className="mt-2 text-sm leading-5 text-slate-500">
                  Manage patients, appointments, live queue activity,
                  rooms, providers, and staff.
                </p>
              </div>

              <div className="my-3 border-t border-slate-100" />

              <div className="space-y-2 text-[13px] text-slate-600">
                <div className="flex items-center gap-3">
                  <CalendarDays
                    size={16}
                    className="shrink-0 text-[#13B2B3]"
                  />

                  <span>
                    Appointment Management
                  </span>
                </div>

                <div className="flex items-center gap-3">
                  <UsersRound
                    size={16}
                    className="shrink-0 text-[#13B2B3]"
                  />

                  <span>
                    Live Queue & Rooms
                  </span>
                </div>

                <div className="flex items-center gap-3">
                  <LayoutDashboard
                    size={16}
                    className="shrink-0 text-[#13B2B3]"
                  />

                  <span>
                    Provider & Staff Management
                  </span>
                </div>

                <div className="flex items-center gap-3">
                  <ListChecks
                    size={16}
                    className="shrink-0 text-[#13B2B3]"
                  />

                  <span>
                    Clinic Operations
                  </span>
                </div>
              </div>

              <div className="mt-auto pt-4">
                <div className="flex w-full items-center justify-between rounded-xl bg-[#13B2B3] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition group-hover:bg-[#109c9d]">
                  <span>
                    Access Staff Portal
                  </span>

                  <ArrowRight size={18} />
                </div>
              </div>
            </button>

            {/* DOCTOR PORTAL */}
            <button
              type="button"
              onClick={() => navigate("/doctor/login")}
              className="group relative flex flex-col overflow-hidden rounded-[1.5rem] border border-slate-200 bg-white p-5 text-left shadow-[0_12px_32px_rgba(15,23,42,0.06)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_20px_45px_rgba(15,23,42,0.10)]"
            >
              <div className="absolute inset-x-0 top-0 h-1 bg-blue-500" />

              <div className="flex items-start justify-between gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-500/10 text-blue-500">
                  <Stethoscope size={23} />
                </div>

                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-blue-200 text-blue-500 transition group-hover:bg-blue-50">
                  <ArrowRight
                    size={17}
                    className="transition-transform duration-300 group-hover:translate-x-0.5"
                  />
                </div>
              </div>

              <div className="mt-5">
                <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-blue-500">
                  Physician access
                </p>

                <h3 className="mt-2 text-xl font-bold tracking-tight text-slate-950">
                  Doctor Portal
                </h3>

                <p className="mt-2 text-sm leading-5 text-slate-500">
                  Review your appointments, live queue, patients,
                  room, and provider status.
                </p>
              </div>

              <div className="my-3 border-t border-slate-100" />

              <div className="space-y-2 text-[13px] text-slate-600">
                <div className="flex items-center gap-3">
                  <CalendarDays
                    size={16}
                    className="shrink-0 text-blue-500"
                  />

                  <span>
                    Today's Appointments
                  </span>
                </div>

                <div className="flex items-center gap-3">
                  <UsersRound
                    size={16}
                    className="shrink-0 text-blue-500"
                  />

                  <span>
                    Live Queue
                  </span>
                </div>

                <div className="flex items-center gap-3">
                  <UserRound
                    size={16}
                    className="shrink-0 text-blue-500"
                  />

                  <span>
                    Patient Details
                  </span>
                </div>

                <div className="flex items-center gap-3">
                  <Stethoscope
                    size={16}
                    className="shrink-0 text-blue-500"
                  />

                  <span>
                    Provider Status
                  </span>
                </div>
              </div>

              <div className="mt-auto pt-4">
                <div className="flex w-full items-center justify-between rounded-xl bg-blue-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition group-hover:bg-blue-600">
                  <span>
                    Access Doctor Portal
                  </span>

                  <ArrowRight size={18} />
                </div>
              </div>
            </button>

            {/* PATIENT PORTAL */}
            <button
              type="button"
              onClick={() => navigate("/patient/login")}
              className="group relative flex flex-col overflow-hidden rounded-[1.5rem] border border-slate-200 bg-white p-5 text-left shadow-[0_12px_32px_rgba(15,23,42,0.06)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_20px_45px_rgba(15,23,42,0.10)]"
            >
              <div className="absolute inset-x-0 top-0 h-1 bg-violet-500" />

              <div className="flex items-start justify-between gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-500/10 text-violet-500">
                  <UserRound size={23} />
                </div>

                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-violet-200 text-violet-500 transition group-hover:bg-violet-50">
                  <ArrowRight
                    size={17}
                    className="transition-transform duration-300 group-hover:translate-x-0.5"
                  />
                </div>
              </div>

              <div className="mt-5">
                <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-violet-500">
                  Personal care
                </p>

                <h3 className="mt-2 text-xl font-bold tracking-tight text-slate-950">
                  Patient Portal
                </h3>

                <p className="mt-2 text-sm leading-5 text-slate-500">
                  Book appointments, review upcoming visits,
                  and manage your clinic experience.
                </p>
              </div>

              <div className="my-3 border-t border-slate-100" />

              <div className="space-y-2 text-[13px] text-slate-600">
                <div className="flex items-center gap-3">
                  <CalendarDays
                    size={16}
                    className="shrink-0 text-violet-500"
                  />

                  <span>
                    Book Appointments
                  </span>
                </div>

                <div className="flex items-center gap-3">
                  <ListChecks
                    size={16}
                    className="shrink-0 text-violet-500"
                  />

                  <span>
                    My Appointments
                  </span>
                </div>

                <div className="flex items-center gap-3">
                  <Clock3
                    size={16}
                    className="shrink-0 text-violet-500"
                  />

                  <span>
                    Live Queue Updates
                  </span>
                </div>

                <div className="flex items-center gap-3">
                  <UserRound
                    size={16}
                    className="shrink-0 text-violet-500"
                  />

                  <span>
                    Profile & Visit History
                  </span>
                </div>
              </div>

              <div className="mt-auto pt-4">
                <div className="flex w-full items-center justify-between rounded-xl bg-violet-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition group-hover:bg-violet-600">
                  <span>
                    Access Patient Portal
                  </span>

                  <ArrowRight size={18} />
                </div>
              </div>
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

export default LoginPortalPage;