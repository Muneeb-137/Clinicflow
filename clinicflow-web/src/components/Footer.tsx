import {
  ArrowUpRight,
  CalendarHeart,
  Mail,
  ShieldCheck,
} from "lucide-react";
import { Link } from "react-router-dom";

const currentYear = new Date().getFullYear();

function Footer() {
  return (
    <footer className="mt-12 border-t border-slate-200 bg-white">
      <div className="h-1 w-full bg-gradient-to-r from-[#13B2B3] via-cyan-500 to-[#0877C9]" />

      <div className="mx-auto w-full max-w-[1600px] px-6 py-10 lg:px-8">
        <div className="grid gap-10 md:grid-cols-2 xl:grid-cols-[1.6fr_1fr_1fr]">
          {/* Brand */}
          <div className="max-w-md">
            <Link
              to="/"
              className="inline-flex items-center gap-3"
            >
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-[#13B2B3] to-[#0877C9] text-white shadow-sm">
                <CalendarHeart size={22} />
              </div>

              <div>
                <p className="text-xl font-bold tracking-tight text-slate-950">
                  Clinic
                  <span className="text-[#13B2B3]">
                    Flow
                  </span>
                </p>

                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                  Clinic intelligence
                </p>
              </div>
            </Link>

            <p className="mt-5 max-w-sm text-sm leading-6 text-slate-500">
              Helping clinics reduce wait times, improve
              patient flow, and deliver smoother healthcare
              experiences.
            </p>

            <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-[#13B2B3]/20 bg-[#13B2B3]/5 px-3 py-1.5 text-xs font-semibold text-[#0d8587]">
              <ShieldCheck size={15} />
              Built with privacy in mind
            </div>
          </div>

          {/* Company */}
          <FooterColumn title="Company">
            <FooterLink to="/how-it-works">
              How it works
            </FooterLink>

            <FooterLink to="/about">
              About ClinicFlow
            </FooterLink>

            <FooterLink to="/faq">
              FAQ
            </FooterLink>

</FooterColumn>

          {/* Contact */}
          <FooterColumn title="Contact">
            <FooterLink
              to="/contact"
              icon={<Mail size={15} />}
            >
              Contact Us
            </FooterLink>

            <a
              href="mailto:support@clinicflow.ca"
              className="group flex items-center gap-2 text-sm text-slate-500 transition hover:text-[#13B2B3]"
            >
              support@clinicflow.ca
              <ArrowUpRight
                size={14}
                className="opacity-0 transition group-hover:opacity-100"
              />
            </a>

            <p className="text-sm text-slate-500">
              Toronto, Ontario
            </p>
            <p className="text-sm text-slate-500">
              Canada
            </p>
          </FooterColumn>

        </div>

       
     

        {/* Bottom bar */}
        <div className="mt-8 flex flex-col gap-3 border-t border-slate-200 pt-6 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {currentYear} ClinicFlow Technologies Inc.
            All rights reserved.
          </p>

          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs font-medium text-slate-400">
            <span>Designed for modern clinics</span>
            <span>Made in Canada</span>
          </div>
        </div>
      </div>
    </footer>
  );
}

type FooterColumnProps = {
  title: string;
  children: React.ReactNode;
};

function FooterColumn({
  title,
  children,
}: FooterColumnProps) {
  return (
    <div>
      <h3 className="mb-4 text-sm font-bold text-slate-900">
        {title}
      </h3>

      <div className="space-y-3">
        {children}
      </div>
    </div>
  );
}

type FooterLinkProps = {
  to: string;
  children: React.ReactNode;
  icon?: React.ReactNode;
};

function FooterLink({
  to,
  children,
  icon,
}: FooterLinkProps) {
  return (
    <Link
      to={to}
      className="group flex items-center gap-2 text-sm text-slate-500 transition hover:text-[#13B2B3]"
    >
      {icon}

      <span>{children}</span>

      <ArrowUpRight
        size={14}
        className="opacity-0 transition group-hover:opacity-100"
      />
    </Link>
  );
}

export default Footer;