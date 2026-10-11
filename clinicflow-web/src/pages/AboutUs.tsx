import {
  ArrowRight,
  CalendarCheck2,
  CheckCircle2,
  Clock3,
  HeartPulse,
  LayoutDashboard,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  UsersRound,
  Workflow,
} from "lucide-react";
import { NavLink } from "react-router-dom";

const clinicBenefits = [
  {
    icon: CalendarCheck2,
    title: "Simpler appointment scheduling",
    description:
      "Patients and clinic staff can book appointments through one organized scheduling experience with clear provider availability.",
  },
  {
    icon: Clock3,
    title: "More accurate wait visibility",
    description:
      "Real-time patient statuses help teams understand who is scheduled, checked in, waiting, roomed, or finished.",
  },
  {
    icon: UsersRound,
    title: "Connected clinic teams",
    description:
      "Receptionists, providers, and clinic administrators can work from the same live operational picture.",
  },
  {
    icon: LayoutDashboard,
    title: "Clear daily operations",
    description:
      "Important information such as room availability, provider status, patient flow, and wait times stays visible.",
  },
];

const workflowSteps = [
  {
    number: "01",
    title: "An appointment is booked",
    description:
      "Appointments can be created by clinic staff or booked through the clinic’s online booking experience.",
  },
  {
    number: "02",
    title: "The patient checks in",
    description:
      "The appointment enters the live queue so staff can immediately see that the patient has arrived.",
  },
  {
    number: "03",
    title: "The care team prepares",
    description:
      "Provider availability and room assignments help staff understand when and where the patient can be seen.",
  },
  {
    number: "04",
    title: "The visit is completed",
    description:
      "The appointment is updated throughout the visit, keeping patient flow and operational information accurate.",
  },
];

const platformValues = [
  {
    icon: HeartPulse,
    title: "Designed around patient experience",
    description:
      "A better clinic experience begins with clearer communication, shorter uncertainty, and a more organized arrival process.",
  },
  {
    icon: Workflow,
    title: "Built for real clinic workflows",
    description:
      "ClinicFlow connects scheduling, check-in, waiting, room assignment, provider availability, and visit completion.",
  },
  {
    icon: ShieldCheck,
    title: "Focused on responsible information use",
    description:
      "The platform is designed to support thoughtful access, dependable workflows, and privacy-conscious clinic operations.",
  },
];

function AboutUsPage() {
  return (
    <main className="min-h-screen bg-[#f7fafc] text-slate-950">
      {/* Hero */}
      <section className="px-4 pt-2 sm:px-6 lg:px-8">
        <div className="relative mx-auto max-w-[1500px] overflow-hidden rounded-[36px] bg-[#071126] shadow-[0_28px_70px_rgba(15,23,42,0.18)]">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_85%_20%,rgba(19,178,179,0.28),transparent_34%),radial-gradient(circle_at_45%_100%,rgba(14,116,144,0.2),transparent_38%)]" />

          <div className="relative grid h-[calc(100vh-135px)] max-h-[760px] gap-6 px-7 py-6 sm:px-10 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:px-14 xl:px-16">
            <div className="flex flex-col justify-center">
              <div className="mb-4 inline-flex w-fit items-center gap-2 rounded-full border border-cyan-300/20 bg-white/10 px-4 py-2 text-sm font-bold text-cyan-300 backdrop-blur-sm">
                <Sparkles size={16} />
                About ClinicFlow
              </div>

              <h1 className="max-w-4xl text-4xl font-black leading-[1.02] tracking-[-0.04em] text-white sm:text-5xl lg:text-[50px] xl:text-[56px]">
                Better clinic flow creates a better care experience.
              </h1>

              <p className="mt-4 max-w-3xl text-base leading-7 text-slate-300 xl:text-lg">
                ClinicFlow brings appointments, patient queues, providers,
                rooms, and daily clinic operations together in one clear,
                connected platform.
              </p>

              <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                <NavLink
                  to="/appointments/book"
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#13B2B3] px-6 py-3.5 text-sm font-extrabold text-white shadow-lg shadow-cyan-950/20 transition hover:-translate-y-0.5 hover:bg-[#0fa3a4]"
                >
                  Book an appointment
                  <ArrowRight size={18} />
                </NavLink>

                <NavLink
                  to="/contact"
                  className="inline-flex items-center justify-center rounded-xl border border-white/20 bg-white/10 px-6 py-3.5 text-sm font-extrabold text-white backdrop-blur-sm transition hover:bg-white/15"
                >
                  Contact ClinicFlow
                </NavLink>
              </div>

              <div className="mt-5 flex flex-wrap gap-2">
                {[
                  "Patient-centred",
                  "Real-time visibility",
                  "Connected operations",
                ].map((item) => (
                  <div
                    key={item}
                    className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-slate-200"
                  >
                    <CheckCircle2 size={16} className="text-cyan-300" />
                    {item}
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center">
              <div className="mx-auto w-full max-w-[510px] rounded-[30px] border border-white/10 bg-white/[0.08] p-4 shadow-2xl backdrop-blur-xl sm:p-5">
                <div className="rounded-[24px] bg-white p-5 shadow-xl sm:p-6">
                  <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-5">
                    <div>
                      <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-[#13B2B3]">
                        Live clinic overview
                      </p>
                      <h2 className="mt-2 text-2xl font-black text-slate-950">
                        A clearer day for the whole team
                      </h2>
                    </div>

                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-cyan-50 text-[#13B2B3]">
                      <HeartPulse size={24} />
                    </div>
                  </div>

                  <div className="mt-5 grid grid-cols-2 gap-3">
                    <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                      <p className="text-sm font-semibold text-slate-500">
                        Patients waiting
                      </p>
                      <p className="mt-2 text-3xl font-black text-slate-950">
                        4
                      </p>
                      <p className="mt-1 text-xs font-bold text-emerald-600">
                        Queue moving normally
                      </p>
                    </div>

                    <div className="rounded-2xl border border-slate-100 bg-slate-50 p-3.5">
                      <p className="text-sm font-semibold text-slate-500">
                        Average wait
                      </p>
                      <p className="mt-2 text-3xl font-black text-slate-950">
                        12 min
                      </p>
                      <p className="mt-1 text-xs font-bold text-[#13B2B3]">
                        Updated in real time
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 rounded-2xl border border-cyan-100 bg-cyan-50/60 p-3.5">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full bg-[#13B2B3] p-1">
                          <div className="flex h-full w-full items-center justify-center rounded-full bg-white text-sm font-black text-[#13B2B3]">
                            SL
                          </div>
                        </div>

                        <div>
                          <p className="font-extrabold text-slate-950">
                            Dr. Sarah Lee
                          </p>
                          <p className="text-sm text-slate-500">
                            Examination Room 2
                          </p>
                        </div>
                      </div>

                      <span className="rounded-full bg-emerald-100 px-3 py-1.5 text-xs font-extrabold text-emerald-700">
                        Available
                      </span>
                    </div>
                  </div>

                  <div className="mt-3 rounded-2xl border border-slate-100 p-3.5">
                    <div className="mb-3 flex items-center justify-between">
                      <p className="font-extrabold text-slate-900">
                        Patient journey
                      </p>
                      <p className="text-xs font-bold text-slate-400">
                        Current visit
                      </p>
                    </div>

                    <div className="grid grid-cols-4 gap-2">
                      {["Booked", "Checked in", "Roomed", "Complete"].map(
                        (status, index) => (
                          <div key={status}>
                            <div
                              className={`h-2 rounded-full ${
                                index < 3
                                  ? "bg-[#13B2B3]"
                                  : "bg-slate-200"
                              }`}
                            />
                            <p
                              className={`mt-2 text-[11px] font-bold ${
                                index < 3
                                  ? "text-slate-700"
                                  : "text-slate-400"
                              }`}
                            >
                              {status}
                            </p>
                          </div>
                        ),
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Intro */}
      <section className="px-4 py-24 sm:px-6 lg:px-10">
        <div className="mx-auto grid max-w-[1380px] gap-12 lg:grid-cols-[0.8fr_1.2fr] lg:items-start">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.22em] text-[#13B2B3]">
              Why we exist
            </p>

            <h2 className="mt-4 text-4xl font-black leading-tight tracking-[-0.035em] text-slate-950 sm:text-5xl">
              Clinics should spend less time managing confusion.
            </h2>
          </div>

          <div className="space-y-6 text-lg leading-8 text-slate-600">
            <p>
              A clinic visit includes more than the appointment itself.
              Patients need to know when to arrive, staff need to understand
              who is waiting, providers need visibility into their next
              patient, and rooms need to be used efficiently.
            </p>

            <p>
              When this information is separated across different tools,
              spreadsheets, verbal updates, or manual processes, small delays
              can quickly affect the entire clinic.
            </p>

            <p className="font-semibold text-slate-800">
              ClinicFlow was created to make that information easier to see,
              update, and act on—without adding unnecessary complexity to the
              care experience.
            </p>
          </div>
        </div>
      </section>

      {/* Benefits */}
      <section className="border-y border-slate-200 bg-white px-4 py-24 sm:px-6 lg:px-10">
        <div className="mx-auto max-w-[1380px]">
          <div className="max-w-3xl">
            <p className="text-sm font-black uppercase tracking-[0.22em] text-[#13B2B3]">
              One connected platform
            </p>

            <h2 className="mt-4 text-4xl font-black tracking-[-0.035em] text-slate-950 sm:text-5xl">
              Every part of the clinic day should work together.
            </h2>

            <p className="mt-5 text-lg leading-8 text-slate-600">
              ClinicFlow creates a shared operational view so patients and
              clinic teams can move through each stage with greater clarity.
            </p>
          </div>

          <div className="mt-14 grid gap-5 md:grid-cols-2">
            {clinicBenefits.map((benefit) => {
              const Icon = benefit.icon;

              return (
                <article
                  key={benefit.title}
                  className="group rounded-[26px] border border-slate-200 bg-white p-7 shadow-sm transition duration-300 hover:-translate-y-1 hover:border-cyan-200 hover:shadow-xl"
                >
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-cyan-50 text-[#13B2B3] transition group-hover:bg-[#13B2B3] group-hover:text-white">
                    <Icon size={26} />
                  </div>

                  <h3 className="mt-6 text-xl font-black text-slate-950">
                    {benefit.title}
                  </h3>

                  <p className="mt-3 leading-7 text-slate-600">
                    {benefit.description}
                  </p>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      {/* Patient flow */}
      <section className="px-4 py-24 sm:px-6 lg:px-10">
        <div className="mx-auto max-w-[1380px]">
          <div className="grid gap-10 lg:grid-cols-[0.7fr_1.3fr]">
            <div>
              <div className="sticky top-24">
                <p className="text-sm font-black uppercase tracking-[0.22em] text-[#13B2B3]">
                  The ClinicFlow journey
                </p>

                <h2 className="mt-4 text-4xl font-black tracking-[-0.035em] text-slate-950 sm:text-5xl">
                  From booking to completed care.
                </h2>

                <p className="mt-5 text-lg leading-8 text-slate-600">
                  Every status update helps the next person understand what is
                  happening and what needs to happen next.
                </p>
              </div>
            </div>

            <div className="space-y-4">
              {workflowSteps.map((step, index) => (
                <article
                  key={step.number}
                  className="relative overflow-hidden rounded-[26px] border border-slate-200 bg-white p-6 shadow-sm sm:p-8"
                >
                  <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#13B2B3] text-sm font-black text-white">
                      {step.number}
                    </div>

                    <div>
                      <h3 className="text-2xl font-black text-slate-950">
                        {step.title}
                      </h3>

                      <p className="mt-3 max-w-2xl leading-7 text-slate-600">
                        {step.description}
                      </p>
                    </div>
                  </div>

                  {index < workflowSteps.length - 1 && (
                    <div className="absolute bottom-[-18px] left-[51px] hidden h-9 w-px bg-cyan-200 sm:block" />
                  )}
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Values */}
      <section className="bg-[#edf9fa] px-4 py-24 sm:px-6 lg:px-10">
        <div className="mx-auto max-w-[1380px]">
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-sm font-black uppercase tracking-[0.22em] text-[#13B2B3]">
              What guides us
            </p>

            <h2 className="mt-4 text-4xl font-black tracking-[-0.035em] text-slate-950 sm:text-5xl">
              Technology should support care—not distract from it.
            </h2>
          </div>

          <div className="mt-14 grid gap-5 lg:grid-cols-3">
            {platformValues.map((value) => {
              const Icon = value.icon;

              return (
                <article
                  key={value.title}
                  className="rounded-[28px] border border-cyan-100 bg-white p-8 shadow-[0_16px_40px_rgba(15,23,42,0.07)]"
                >
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#13B2B3] text-white">
                    <Icon size={26} />
                  </div>

                  <h3 className="mt-6 text-xl font-black text-slate-950">
                    {value.title}
                  </h3>

                  <p className="mt-3 leading-7 text-slate-600">
                    {value.description}
                  </p>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      {/* Mission statement */}
      <section className="px-4 py-24 sm:px-6 lg:px-10">
        <div className="mx-auto max-w-[1380px] overflow-hidden rounded-[32px] border border-slate-200 bg-white shadow-sm">
          <div className="grid lg:grid-cols-2">
            <div className="flex flex-col justify-center p-8 sm:p-12 lg:p-16">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-cyan-50 text-[#13B2B3]">
                <Stethoscope size={27} />
              </div>

              <p className="mt-7 text-sm font-black uppercase tracking-[0.22em] text-[#13B2B3]">
                Our mission
              </p>

              <h2 className="mt-4 text-4xl font-black leading-tight tracking-[-0.035em] text-slate-950">
                Help clinics deliver a more organized, informed, and
                reassuring experience.
              </h2>

              <p className="mt-6 text-lg leading-8 text-slate-600">
                We believe patients should feel informed, clinic staff should
                feel prepared, and providers should have the operational
                clarity they need to focus on care.
              </p>
            </div>

            <div className="bg-[#071126] p-8 text-white sm:p-12 lg:p-16">
              <p className="text-sm font-black uppercase tracking-[0.22em] text-cyan-300">
                What that looks like
              </p>

              <div className="mt-8 space-y-6">
                {[
                  "Patients can understand where they are in the visit process.",
                  "Staff can identify delays before they become larger problems.",
                  "Providers can see their current patient, room, and availability status.",
                  "Clinic leaders can understand performance using real operational information.",
                ].map((statement) => (
                  <div key={statement} className="flex gap-4">
                    <CheckCircle2
                      size={21}
                      className="mt-1 shrink-0 text-cyan-300"
                    />
                    <p className="text-lg leading-8 text-slate-200">
                      {statement}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Book appointment CTA */}
      <section className="px-4 pb-24 sm:px-6 lg:px-10">
        <div className="relative mx-auto max-w-[1380px] overflow-hidden rounded-[34px] bg-gradient-to-br from-[#0d9fa1] to-[#0877a5] px-7 py-14 text-white shadow-[0_28px_70px_rgba(8,119,165,0.22)] sm:px-12 lg:px-16 lg:py-16">
          <div className="absolute right-[-90px] top-[-100px] h-80 w-80 rounded-full bg-white/10 blur-2xl" />
          <div className="absolute bottom-[-150px] left-[30%] h-80 w-80 rounded-full bg-cyan-200/10 blur-3xl" />

          <div className="relative flex flex-col gap-10 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-3xl">
              <p className="text-sm font-black uppercase tracking-[0.22em] text-cyan-100">
                Ready for your next visit?
              </p>

              <h2 className="mt-4 text-4xl font-black leading-tight tracking-[-0.035em] sm:text-5xl">
                Book your appointment with confidence.
              </h2>

              <p className="mt-5 max-w-2xl text-lg leading-8 text-cyan-50">
                Select a reason for your visit, choose a provider and available
                time, then review your appointment details before confirming.
              </p>
            </div>

            <div className="flex shrink-0 flex-col gap-3 sm:flex-row lg:flex-col xl:flex-row">
              <NavLink
                to="/appointments/book"
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-6 py-4 text-sm font-black text-[#087f91] shadow-lg transition hover:-translate-y-0.5 hover:bg-cyan-50"
              >
                Book an appointment
                <ArrowRight size={18} />
              </NavLink>

              <NavLink
                to="/faq"
                className="inline-flex items-center justify-center rounded-xl border border-white/30 bg-white/10 px-6 py-4 text-sm font-black text-white backdrop-blur-sm transition hover:bg-white/20"
              >
                View common questions
              </NavLink>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

export default AboutUsPage;