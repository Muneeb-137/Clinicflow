import { motion } from "motion/react";

import {
  CheckCircle2,
  ChevronRight,
  Clock3,
  MapPin,
  Stethoscope,
  Users,
} from "lucide-react";

import {
  clinicProblems,
  patientProblems,
} from "../data/dashboardData";

import {
  whyClinicFlowAnimation,
  whyClinicFlowCardAnimation,
} from "../animations/animationsAll";

function WhyClinicFlow() {
  return (
    <motion.section
      variants={whyClinicFlowAnimation}
      initial="hidden"
      whileInView="visible"
      viewport={{
        once: true,
        amount: 0.15,
      }}
      className="relative overflow-hidden bg-white px-6 py-28 lg:px-10"
    >
      {/* Decorative background */}
      <div className="pointer-events-none absolute left-0 top-20 h-72 w-72 rounded-full bg-teal-100/70 blur-[110px]" />

      <div className="pointer-events-none absolute bottom-0 right-0 h-80 w-80 rounded-full bg-cyan-100/60 blur-[120px]" />

      <div className="relative mx-auto max-w-[1480px]">
        {/* Heading */}
        <motion.div
          variants={whyClinicFlowCardAnimation}
          className="mx-auto max-w-5xl text-center"
        >
          <h2 className="font-display text-5xl font-bold tracking-[-0.035em] text-slate-950 sm:text-6xl lg:text-7xl">
            Why{" "}
            <span className="relative inline-block text-[#13B2B3]">
              ClinicFlow?
              <span className="absolute -bottom-2 left-[6%] h-1.5 w-[88%] rounded-full bg-teal-200" />
            </span>
          </h2>

          <h3 className="mt-6 text-3xl font-semibold leading-tight tracking-[-0.03em] text-slate-800 sm:text-4xl lg:text-5xl">
            Appointments tell you when to arrive.

            <span className="mt-2 block text-[#13B2B3]">
              ClinicFlow shows what happens next.
            </span>
          </h3>

          <p className="mx-auto mt-7 max-w-3xl text-lg leading-8 text-slate-600">
            ClinicFlow gives patients, staff, and doctors one connected view
            of the clinic, so everyone knows what happens next.
          </p>
        </motion.div>

        {/* Before and after comparison */}
        <motion.div
          variants={whyClinicFlowCardAnimation}
          className="mt-16 grid gap-6 lg:grid-cols-2"
        >
          {/* Before ClinicFlow */}
          <div className="rounded-[32px] border border-rose-200 bg-rose-50/60 p-7 lg:p-9">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-rose-500">
                  Before ClinicFlow
                </p>

                <h3 className="mt-2 text-2xl font-bold text-slate-950">
                  Patients are left waiting without context.
                </h3>
              </div>

              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white text-rose-500 shadow-sm">
                <Clock3 size={23} />
              </div>
            </div>

            <div className="mt-8 space-y-3">
              <div className="flex items-center gap-4 rounded-2xl border border-rose-100 bg-white p-4">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-rose-100 text-sm font-bold text-rose-600">
                  1
                </span>

                <div>
                  <p className="font-semibold text-slate-950">
                    Appointment scheduled for 2:00 PM
                  </p>

                  <p className="mt-1 text-sm text-slate-500">
                    The patient knows when to arrive, but not when they will be
                    seen.
                  </p>
                </div>
              </div>

              <div className="ml-4 h-5 w-px bg-rose-200" />

              <div className="flex items-center gap-4 rounded-2xl border border-rose-100 bg-white p-4">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-rose-100 text-sm font-bold text-rose-600">
                  2
                </span>

                <div>
                  <p className="font-semibold text-slate-950">
                    Patient checks in
                  </p>

                  <p className="mt-1 text-sm text-slate-500">
                    They enter the waiting room with no live queue position.
                  </p>
                </div>
              </div>

              <div className="ml-4 h-5 w-px bg-rose-200" />

              <div className="flex items-center gap-4 rounded-2xl border border-rose-100 bg-white p-4">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-rose-100 text-sm font-bold text-rose-600">
                  3
                </span>

                <div>
                  <p className="font-semibold text-slate-950">
                    “How much longer?”
                  </p>

                  <p className="mt-1 text-sm text-slate-500">
                    Reception can only provide a rough estimate.
                  </p>
                </div>
              </div>
            </div>
          </div>

         {/* With ClinicFlow */}
<div className="relative overflow-hidden rounded-[32px] border border-[#BFECE8] bg-gradient-to-br from-[#F2FCFC] via-white to-[#EAF9F8] p-7 shadow-sm lg:p-9">
  {/* Decorative glow */}
  <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-[#13B2B3]/10 blur-[90px]" />

  <div className="relative">
    <div className="flex items-center justify-between gap-4">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#13B2B3]">
          With ClinicFlow
        </p>

        <h3 className="mt-2 text-2xl font-bold text-slate-950">
          Patients can see their visit progressing.
        </h3>
      </div>

      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#13B2B3] text-white shadow-sm">
        <CheckCircle2 size={23} />
      </div>
    </div>

    <div className="mt-8 space-y-3">
      <div className="flex items-center gap-4 rounded-2xl border border-[#D8F3F1] bg-white/90 p-4 shadow-sm">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#13B2B3] font-bold text-white">
          ✓
        </span>

        <div>
          <p className="font-semibold text-slate-950">
            Checked in
          </p>

          <p className="mt-1 text-sm text-slate-600">
            The patient immediately enters the live clinic flow.
          </p>
        </div>
      </div>

      <div className="ml-4 h-5 w-px bg-[#13B2B3]/35" />

      <div className="flex items-center gap-4 rounded-2xl border border-[#D8F3F1] bg-white/90 p-4 shadow-sm">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#13B2B3] font-bold text-white">
          2
        </span>

        <div>
          <p className="font-semibold text-slate-950">
            Two patients ahead
          </p>

          <p className="mt-1 text-sm text-slate-600">
            Queue movement is visible instead of hidden.
          </p>
        </div>
      </div>

      <div className="ml-4 h-5 w-px bg-[#13B2B3]/35" />

      <div className="flex items-center gap-4 rounded-2xl border border-[#D8F3F1] bg-white/90 p-4 shadow-sm">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#13B2B3] font-bold text-white">
          ✓
        </span>

        <div>
          <p className="font-semibold text-slate-950">
            Room is being prepared
          </p>

          <p className="mt-1 text-sm text-slate-600">
            The patient can see which stage comes next.
          </p>
        </div>
      </div>

      <div className="mt-5 rounded-2xl border border-[#BFECE8] bg-[#EAF9F8] p-5">
        <p className="text-sm font-medium text-[#0F8F91]">
          Expected call-in window
        </p>

        <p className="mt-1 text-2xl font-bold text-slate-950">
          2:17 PM–2:20 PM
        </p>
      </div>
    </div>
  </div>
</div>
        </motion.div>

        {/* Problems */}
        <div className="mt-6 grid gap-6 xl:grid-cols-2">
          {/* Patient problem */}
          <motion.article
            variants={whyClinicFlowCardAnimation}
            whileHover={{ y: -6 }}
            className="group rounded-[32px] border border-slate-200 bg-slate-50 p-7 shadow-sm transition-shadow duration-500 hover:shadow-xl lg:p-10"
          >
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#13B2B3] text-white shadow-sm">
                <Users size={27} />
              </div>

              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#13B2B3]">
                  The Patient Problem
                </p>

                <h3 className="mt-1 text-2xl font-bold text-slate-950">
                  Waiting feels uncertain.
                </h3>
              </div>
            </div>

            <div className="mt-8 space-y-4">
              {patientProblems.map((problem) => {
                const Icon = problem.icon;

                return (
                  <div
                    key={problem.title}
                    className="flex gap-4 rounded-2xl border border-slate-200 bg-white p-5 transition-all duration-300 hover:-translate-y-1 hover:border-teal-200 hover:shadow-md"
                  >
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-rose-50 text-rose-500">
                      <Icon size={21} />
                    </div>

                    <div>
                      <h4 className="font-semibold text-slate-950">
                        {problem.title}
                      </h4>

                      <p className="mt-2 text-sm leading-6 text-slate-600">
                        {problem.description}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.article>

          {/* Clinic problem */}
          <motion.article
            variants={whyClinicFlowCardAnimation}
            whileHover={{ y: -6 }}
            className="group relative overflow-hidden rounded-[32px] border border-[#BFECE8] bg-gradient-to-br from-[#F2FCFC] via-white to-[#EAF9F8] p-7 shadow-sm transition-all duration-500 hover:-translate-y-1 hover:shadow-xl lg:p-10"
          >
            {/* Decorative glow */}
            <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-[#13B2B3]/10 blur-[90px]" />

            <div className="relative">
              <div className="flex items-center gap-4">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#13B2B3] text-white shadow-sm">
                  <Stethoscope size={27} />
                </div>

                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#13B2B3]">
                    The Clinic Problem
                  </p>

                  <h3 className="mt-1 text-2xl font-bold text-slate-950">
                    Keeping everyone synchronized is difficult.
                  </h3>
                </div>
              </div>

              <div className="mt-8 space-y-4">
                {clinicProblems.map((problem) => {
                  const Icon = problem.icon;

                  return (
                    <div
                      key={problem.title}
                      className="flex gap-4 rounded-2xl border border-[#D8F3F1] bg-white/90 p-5 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-[#13B2B3]/40 hover:shadow-md"
                    >
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#F2FCFC] text-[#13B2B3]">
                        <Icon size={21} />
                      </div>

                      <div>
                        <h4 className="font-semibold text-slate-950">
                          {problem.title}
                        </h4>

                        <p className="mt-2 text-sm leading-6 text-slate-600">
                          {problem.description}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </motion.article>
        </div>

        {/* ClinicFlow solution: one hub connecting each role */}
        <motion.div
          variants={whyClinicFlowCardAnimation}
          className="relative mt-6 overflow-hidden rounded-[32px] border border-teal-200 bg-gradient-to-br from-teal-50 via-white to-cyan-50 p-8 lg:p-12"
        >
          <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full border border-teal-200" />

          <div className="pointer-events-none absolute -right-4 -top-4 h-36 w-36 rounded-full border border-teal-200" />

          <div className="relative">
            <div className="mx-auto max-w-2xl text-center">
              <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[#13B2B3]">
                One connected flow
              </p>

              <h3 className="mt-3 text-3xl font-bold tracking-tight text-slate-950 lg:text-4xl">
                Everyone sees what happens next.
              </h3>

              <p className="mx-auto mt-4 max-w-xl leading-7 text-slate-600">
                ClinicFlow connects each patient stage with the staff, room,
                and doctor information required to keep the visit moving.
              </p>
            </div>

            {/* Sequence: Patients -> Staff -> Doctors on one line */}
            <div className="relative mt-10">
              <div className="pointer-events-none absolute left-[calc((100%-3rem)/6)] right-[calc((100%-3rem)/6)] top-6 hidden h-0.5 bg-gradient-to-r from-teal-200 via-[#13B2B3] to-teal-200 md:block" />

              <div className="grid gap-4 md:grid-cols-3 md:gap-6">
                {[
                  {
                    who: "Patients",
                    icon: MapPin,
                    title: "Patients see progress",
                    text: "Live queue position, completed stages, and a realistic call-in window.",
                  },
                  {
                    who: "Staff",
                    icon: CheckCircle2,
                    title: "Staff see priorities",
                    text: "Clear blockers, available rooms, and patients requiring attention.",
                  },
                  {
                    who: "Doctors",
                    icon: Stethoscope,
                    title: "Doctors stay prepared",
                    text: "The next patient, room, forms, and visit readiness appear in one place.",
                  },
                ].map(({ who, icon: Icon, title, text }, index) => (
                  <div
                    key={who}
                    className="relative flex flex-col items-center text-center"
                  >
                    {index > 0 && (
                      <span className="absolute -left-3 top-6 z-10 hidden h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white text-[#13B2B3] shadow-sm ring-1 ring-teal-200 md:flex">
                        <ChevronRight size={14} strokeWidth={2.5} />
                      </span>
                    )}

                    <span className="relative z-10 flex h-12 w-12 items-center justify-center rounded-full border-4 border-white bg-[#13B2B3] text-white shadow-md">
                      <Icon size={20} />
                    </span>

                    <div className="mt-3 w-full flex-1 rounded-2xl border border-teal-200 bg-white p-5 shadow-sm">
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                        {who}
                      </p>

                      <h4 className="mt-1 font-semibold text-slate-950">
                        {title}
                      </h4>

                      <p className="mt-2 text-sm leading-6 text-slate-600">
                        {text}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </motion.section>
  );
}

export default WhyClinicFlow;