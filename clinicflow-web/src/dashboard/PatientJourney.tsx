import { motion } from "motion/react";

import { patientJourneySteps } from "../data/dashboardData";

import {
  journeyCardAnimation,
  journeyHeadingAnimation,
  journeyLineAnimation,
  journeyNodeAnimation,
} from "../animations/animationsAll";

function PatientJourney() {
  return (
    <motion.section
      className="relative overflow-hidden bg-slate-50 px-6 py-24"
      initial="hidden"
      whileInView="visible"
      viewport={{
        once: true,
        amount: 0.01,
        margin: "0px 0px 280px 0px",
      }}
    >
      <div className="mx-auto max-w-7xl">
        <motion.div
          className="mx-auto max-w-2xl text-center"
          variants={journeyHeadingAnimation}
        >
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-[#13B2B3]">
            Seamless Care
          </p>

          <h2 className="mt-4 text-4xl font-bold tracking-tight text-slate-900 md:text-5xl">
            The Patient Journey
          </h2>

          <p className="mt-5 text-lg leading-8 text-slate-600">
            From booking to consultation, ClinicFlow keeps patients informed
            while helping clinic staff coordinate every stage of the visit.
          </p>
        </motion.div>

        <div className="relative mt-16">
          <motion.div
            className="absolute bottom-8 left-7 top-8 w-px origin-top bg-gradient-to-b from-teal-400 via-teal-500 to-slate-300 md:left-1/2"
            variants={journeyLineAnimation}
          />

          <div className="space-y-8">
            {patientJourneySteps.map((step, index) => {
              const Icon = step.icon;

              return (
                <motion.div
                  key={step.title}
                  className="relative grid items-center gap-8 md:grid-cols-2"
                  variants={journeyCardAnimation}
                  custom={index}
                >
                  <div
                    className={`pl-20 md:pl-0 ${
                      index % 2 === 0
                        ? "md:pr-16 md:text-right"
                        : "md:col-start-2 md:pl-16"
                    }`}
                  >
                    <div className="group rounded-3xl border border-slate-200 bg-white p-6 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-teal-200 hover:shadow-xl">
                      <div
                        className={`flex items-center gap-4 ${
                          index % 2 === 0 ? "md:flex-row-reverse" : ""
                        }`}
                      >
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-teal-50 text-[#13B2B3] transition-transform duration-300 group-hover:scale-110">
                          <Icon className="h-6 w-6" />
                        </div>

                        <div>
                          <p className="text-sm font-semibold text-[#13B2B3]">
                            Step {index + 1}
                          </p>

                          <h3 className="mt-1 text-xl font-semibold text-slate-900">
                            {step.title}
                          </h3>
                        </div>
                      </div>

                      <p className="mt-4 leading-7 text-slate-600">
                        {step.description}
                      </p>
                    </div>
                  </div>

                  <motion.div
                    className="absolute left-7 top-1/2 z-10 flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-4 border-slate-50 bg-slate-900 text-sm font-bold text-white shadow-md md:left-1/2"
                    variants={journeyNodeAnimation}
                    custom={index}
                  >
                    {index + 1}
                  </motion.div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </div>
    </motion.section>
  );
}

export default PatientJourney;