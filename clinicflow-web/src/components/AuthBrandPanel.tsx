import logo from "../assets/logo-new.svg";

function AuthBrandPanel() {
  return (
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
            One connected platform for clinic operations, patient flow,
            appointments, and real-time care coordination.
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
  );
}

export default AuthBrandPanel;