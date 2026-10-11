import { ArrowRight, PlayCircle } from "lucide-react";
import { Link } from "react-router-dom";

import clinicVideo from "../assets/clinic_corridor.mp4";

/*
 * The "Smarter clinics" video banner, shared by the staff
 * and patient dashboards. "How it works" (right side) opens
 * the page that explains ClinicFlow.
 */
function ClinicVideoHero() {
  return (
    <div className="relative mb-2 h-[265px] overflow-hidden rounded-3xl shadow-xl">
      <video
        autoPlay
        muted
        loop
        playsInline
        className="absolute inset-0 h-full w-full object-cover object-[center_51%]"
      >
        <source src={clinicVideo} type="video/mp4" />
      </video>

      <div className="absolute inset-0 bg-gradient-to-r from-slate-950/85 via-slate-900/25 to-transparent" />

      <div className="relative z-10 flex h-full max-w-xl flex-col justify-center px-10">
        <span className="mb-4 w-fit rounded-full border border-[#13B2B3]/35 bg-[#13B2B3]/10 px-4 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-[#13B2B3]">
          Intelligent clinic operations
        </span>

        <h1 className="text-4xl font-bold leading-tight text-white">
          Smarter clinics.
          <br />
          Better patient care.
        </h1>

        <p className="mt-5 max-w-xl text-lg leading-7 text-slate-200">
          Real-time queue visibility, intelligent wait-time predictions,
          and smoother patient flow.
        </p>
      </div>

      {/* How it works: right side (bottom-right on small screens). */}
      <Link
        to="/how-it-works"
        className="group absolute bottom-5 right-5 z-10 flex items-center gap-3 rounded-2xl border border-white/25 bg-white/15 px-4 py-3 text-white shadow-lg backdrop-blur-md transition hover:bg-white/25 md:bottom-auto md:right-8 md:top-1/2 md:-translate-y-1/2 md:px-5 md:py-4"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#13B2B3] shadow-md transition group-hover:scale-105">
          <PlayCircle size={22} />
        </span>

        <span className="text-left">
          <span className="block text-sm font-bold md:text-base">
            How it works
          </span>
          <span className="hidden text-xs text-slate-200 md:block">
            See how ClinicFlow runs your clinic
          </span>
        </span>

        <ArrowRight
          size={18}
          className="hidden transition group-hover:translate-x-0.5 md:block"
        />
      </Link>
    </div>
  );
}

export default ClinicVideoHero;
