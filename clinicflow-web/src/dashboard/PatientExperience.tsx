import { motion } from "motion/react";
import { ArrowRight, Check } from "lucide-react";
import { Link } from "react-router-dom";

import patientHappy from "../assets/pexels-gustavo-fring-5622001.jpg";

function PatientExperience() {
  return (
    <section className="overflow-hidden bg-white px-6 py-24 lg:px-12 lg:py-32">
      <div className="mx-auto grid max-w-7xl items-center gap-14 lg:grid-cols-[1.1fr_0.9fr] lg:gap-20">
        {/* Patient image */}
        <motion.div
          initial={{ opacity: 0, x: -90 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true, amount: 0.25 }}
          transition={{
            duration: 1.4,
            ease: [0.22, 1, 0.36, 1],
          }}
          className="relative"
        >
          <div className="relative h-[420px] overflow-hidden rounded-[2rem] shadow-[0_25px_70px_rgba(15,23,42,0.14)] sm:h-[500px] lg:h-[570px]">
            <img
              src={patientHappy}
              alt="Patient having a positive clinic experience"
              className="h-full w-full object-cover transition-transform duration-[1800ms] hover:scale-105"
            />

            <div className="absolute inset-0 bg-gradient-to-t from-slate-950/20 via-transparent to-transparent" />
          </div>

          <div className="absolute -bottom-7 -left-7 -z-10 h-40 w-40 rounded-[2rem] bg-teal-100" />

          <div className="absolute -bottom-6 right-5 hidden rounded-2xl border border-slate-100 bg-white px-5 py-4 shadow-xl sm:block">
            <p className="text-sm font-semibold text-slate-900">
              A calmer clinic journey
            </p>

            <p className="mt-1 text-xs text-slate-500">
              Connected from arrival to departure
            </p>
          </div>
        </motion.div>

        {/* Patient experience content */}
        <motion.div
          initial={{ opacity: 0, y: 90 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{
            duration: 1.4,
            delay: 0.2,
            ease: [0.22, 1, 0.36, 1],
          }}
          className="lg:pl-4"
        >
          <p className="mb-4 text-sm font-semibold uppercase tracking-[0.22em] text-[#13B2B3]">
            Patient Experience
          </p>

          <h2 className="font-display max-w-xl text-4xl font-bold leading-[1.12] tracking-tight text-slate-950 sm:text-5xl">
            Great care extends beyond the consultation room.
          </h2>

          <p className="mt-7 max-w-xl text-base leading-8 text-slate-600 sm:text-lg">
            ClinicFlow helps create a welcoming experience by keeping every
            stage of the visit connected—from arrival to departure.
          </p>

          <div className="my-9 h-px w-full max-w-xl bg-slate-200" />

          <div className="space-y-5">
            {[
              "Patients stay informed",
              "Staff stay coordinated",
              "Every visit feels smoother",
            ].map((item, index) => (
              <motion.div
                key={item}
                initial={{ opacity: 0, x: 35 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{
                  duration: 0.7,
                  delay: 0.45 + index * 0.16,
                  ease: [0.22, 1, 0.36, 1],
                }}
                className="flex items-center gap-4"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-teal-50 text-[#13B2B3]">
                  <Check size={18} strokeWidth={2.5} />
                </div>

                <p className="text-base font-medium text-slate-800 sm:text-lg">
                  {item}
                </p>
              </motion.div>
            ))}
          </div>

          <motion.button
            type="button"
            initial={{ opacity: 0, y: 25 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{
              duration: 0.7,
              delay: 0.95,
            }}
            >
            <Link
              to="/about"
              className="group mt-10 inline-flex items-center gap-3 rounded-full bg-slate-950 px-7 py-3.5 text-sm font-semibold text-white shadow-lg transition-all duration-300 hover:-translate-y-1 hover:bg-[#13B2B3] hover:shadow-xl"
            >
              Discover ClinicFlow

            <ArrowRight
              size={18}
              className="transition-transform duration-300 group-hover:translate-x-1"
            />
            </Link>
          </motion.button>
        </motion.div>
      </div>
    </section>
  );
}

export default PatientExperience;