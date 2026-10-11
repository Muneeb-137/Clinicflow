import { apiFetch } from "../lib/api";
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  Clock3,
  Mail,
  MapPin,
  MessageSquareText,
  Phone,
  Send,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import {
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";

type ContactFormData = {
  first_name: string;
  last_name: string;
  email: string;
  clinic_name: string;
  inquiry_type: string;
  message: string;
};

const initialFormData: ContactFormData = {
  first_name: "",
  last_name: "",
  email: "",
  clinic_name: "",
  inquiry_type: "general",
  message: "",
};

const inquiryTypes = [
  {
    value: "general",
    label: "General Question",
  },
  {
    value: "technical_support",
    label: "Technical Support",
  },
  {
    value: "report_issue",
    label: "Report an Issue",
  },
  {
    value: "feature_request",
    label: "Feature Request",
  },
  {
    value: "clinic_demo",
    label: "Clinic Demo",
  },
];

function ContactPage() {
  const [formData, setFormData] =
    useState<ContactFormData>(initialFormData);

  const [isSubmitting, setIsSubmitting] =
    useState(false);

  const [successMessage, setSuccessMessage] =
    useState("");

  const [errorMessage, setErrorMessage] =
    useState("");

  function handleChange(
    event: ChangeEvent<
      | HTMLInputElement
      | HTMLTextAreaElement
      | HTMLSelectElement
    >,
  ) {
    const { name, value } = event.target;

    setFormData((currentFormData) => ({
      ...currentFormData,
      [name]: value,
    }));
  }

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    try {
      setIsSubmitting(true);
      setSuccessMessage("");
      setErrorMessage("");

      const response = await apiFetch("/api/contact", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.message ??
            "Unable to send your message. Please try again.",
        );
      }

      setSuccessMessage(
        "Thank you. Your message has been sent and the ClinicFlow team will respond as soon as possible.",
      );

      setFormData(initialFormData);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to send your message. Please try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="mx-auto w-full max-w-7xl space-y-8">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-[30px] border border-[#13B2B3]/15 bg-gradient-to-br from-slate-950 via-slate-900 to-[#0b525b] px-6 py-10 text-white shadow-xl sm:px-10 lg:px-12 lg:py-12">
        <div className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-[#13B2B3]/20 blur-3xl" />

        <div className="pointer-events-none absolute -bottom-28 left-1/3 h-72 w-72 rounded-full bg-blue-500/10 blur-3xl" />

        <div className="relative grid gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          <div>
            <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 text-[#65E7E0] ring-1 ring-white/10">
              <MessageSquareText size={25} />
            </div>

            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#65E7E0]">
              Contact ClinicFlow
            </p>

            <h1 className="mt-3 max-w-2xl text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl">
              Let&apos;s improve the way your clinic flows.
            </h1>

            <p className="mt-5 max-w-2xl text-base leading-7 text-slate-300">
              Contact us with questions, feedback, technical
              concerns, feature ideas, or to learn more about
              ClinicFlow.
            </p>

            <div className="mt-7 flex flex-wrap gap-3">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-4 py-2 text-sm text-slate-200 backdrop-blur">
                <ShieldCheck
                  size={16}
                  className="text-[#65E7E0]"
                />
                Privacy-conscious communication
              </div>

              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-4 py-2 text-sm text-slate-200 backdrop-blur">
                <Clock3
                  size={16}
                  className="text-[#65E7E0]"
                />
                Usually responds within 1–2 business days
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/10 p-5 backdrop-blur-md sm:p-6">
            <div className="flex items-start gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#13B2B3] text-white">
                <Sparkles size={21} />
              </div>

              <div>
                <p className="font-bold text-white">
                  Not sure which option to choose?
                </p>

                <p className="mt-2 text-sm leading-6 text-slate-300">
                  Select General Question and describe what
                  you need. Your message can be directed to
                  the appropriate ClinicFlow contact.
                </p>
              </div>
            </div>

            <div className="mt-5 border-t border-white/10 pt-5">
              <p className="text-sm font-semibold text-white">
                Please do not include patient health
                information.
              </p>

              <p className="mt-1 text-sm leading-6 text-slate-300">
                This general contact form should not be used
                to send clinical records or sensitive patient
                details.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-[0.76fr_1.24fr]">
        {/* Contact details */}
        <aside className="space-y-5">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#13B2B3]">
              Contact information
            </p>

            <h2 className="mt-3 text-2xl font-bold text-slate-950">
              We&apos;re here to help.
            </h2>

            <p className="mt-3 text-sm leading-6 text-slate-500">
              Reach out for product questions, support,
              feedback, demonstrations, or clinic workflow
              discussions.
            </p>

            <div className="mt-7 space-y-4">
              <ContactDetail
                icon={<Mail size={19} />}
                label="Email"
                value="support@clinicflow.ca"
                helper="General and technical inquiries"
              />

              <ContactDetail
                icon={<MapPin size={19} />}
                label="Location"
                value="Toronto, Ontario"
                helper="Canada"
              />

              <ContactDetail
                icon={<Clock3 size={19} />}
                label="Response time"
                value="1–2 business days"
                helper="Monday through Friday"
              />
            </div>
          </div>

          <div className="rounded-3xl border border-[#13B2B3]/20 bg-[#F4FCFC] p-6">
            <div className="flex items-start gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#13B2B3]/10 text-[#13B2B3]">
                <Building2 size={20} />
              </div>

              <div>
                <h3 className="font-bold text-slate-950">
                  Interested in ClinicFlow for your clinic?
                </h3>

                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Select Clinic Demo in the form and tell us
                  about your clinic, physicians, and current
                  workflow.
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-slate-950 p-6 text-white shadow-sm">
            <p className="text-sm font-semibold text-[#65E7E0]">
              ClinicFlow support
            </p>

            <h3 className="mt-2 text-xl font-bold">
              Already using the platform?
            </h3>

            <p className="mt-3 text-sm leading-6 text-slate-300">
              Include a clear description of the issue, the
              page where it occurred, and what you expected
              to happen.
            </p>

            <div className="mt-5 flex items-center gap-2 text-sm font-semibold text-white">
              Clear details help us respond faster
              <ArrowRight
                size={16}
                className="text-[#65E7E0]"
              />
            </div>
          </div>
        </aside>

        {/* Form */}
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <div className="flex items-start gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#13B2B3]/10 text-[#13B2B3]">
              <Send size={21} />
            </div>

            <div>
              <h2 className="text-2xl font-bold text-slate-950">
                Send us a message
              </h2>

              <p className="mt-1 text-sm text-slate-500">
                Complete the form and tell us how we can
                assist.
              </p>
            </div>
          </div>

          <form
            onSubmit={handleSubmit}
            className="mt-8 space-y-6"
          >
            <div className="grid gap-6 sm:grid-cols-2">
              <ContactInput
                label="First name"
                name="first_name"
                value={formData.first_name}
                onChange={handleChange}
                required
              />

              <ContactInput
                label="Last name"
                name="last_name"
                value={formData.last_name}
                onChange={handleChange}
                required
              />

              <ContactInput
                label="Email address"
                name="email"
                type="email"
                value={formData.email}
                onChange={handleChange}
                required
              />

              <ContactInput
                label="Clinic or organization"
                name="clinic_name"
                value={formData.clinic_name}
                onChange={handleChange}
                placeholder="Optional"
              />
            </div>

            <div>
              <label
                htmlFor="inquiry_type"
                className="mb-2 block text-sm font-semibold text-slate-700"
              >
                How can we help?
              </label>

              <select
                id="inquiry_type"
                name="inquiry_type"
                value={formData.inquiry_type}
                onChange={handleChange}
                className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-[#13B2B3] focus:ring-4 focus:ring-[#13B2B3]/10"
              >
                {inquiryTypes.map((inquiryType) => (
                  <option
                    key={inquiryType.value}
                    value={inquiryType.value}
                  >
                    {inquiryType.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="message"
                className="mb-2 block text-sm font-semibold text-slate-700"
              >
                Message
                <span className="ml-1 text-red-500">
                  *
                </span>
              </label>

              <textarea
                id="message"
                name="message"
                value={formData.message}
                onChange={handleChange}
                required
                rows={7}
                placeholder="Tell us how we can help. Please do not include private patient health information."
                className="w-full resize-none rounded-xl border border-slate-300 px-4 py-3 leading-6 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-[#13B2B3] focus:ring-4 focus:ring-[#13B2B3]/10"
              />

              <div className="mt-2 flex items-start gap-2 text-xs leading-5 text-slate-500">
                <ShieldCheck
                  size={14}
                  className="mt-0.5 shrink-0 text-[#13B2B3]"
                />

                Do not submit health card numbers, medical
                records, diagnoses, or other sensitive patient
                information through this form.
              </div>
            </div>

            {successMessage && (
              <div className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm text-emerald-800">
                <CheckCircle2
                  size={19}
                  className="mt-0.5 shrink-0"
                />

                {successMessage}
              </div>
            )}

            {errorMessage && (
              <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-700">
                {errorMessage}
              </div>
            )}

            <div className="flex flex-col gap-4 border-t border-slate-200 pt-6 sm:flex-row sm:items-center sm:justify-between">
              <p className="max-w-md text-xs leading-5 text-slate-500">
                By submitting this form, you acknowledge that
                this is a general inquiry and not a channel
                for urgent medical assistance.
              </p>

              <button
                type="submit"
                disabled={isSubmitting}
                className="inline-flex min-w-[165px] items-center justify-center gap-2 rounded-xl bg-[#13B2B3] px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-[#109a9b] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSubmitting ? (
                  <>
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Send size={17} />
                    Send Message
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Emergency notice */}
      <div className="flex flex-col gap-4 rounded-3xl border border-amber-200 bg-amber-50 px-6 py-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
            <Phone size={19} />
          </div>

          <div>
            <h2 className="font-bold text-amber-950">
              Need urgent medical assistance?
            </h2>

            <p className="mt-1 text-sm leading-6 text-amber-800">
              ClinicFlow is a clinic operations platform and
              this form is not monitored for medical
              emergencies. Contact local emergency services
              or an appropriate healthcare provider.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

type ContactDetailProps = {
  icon: React.ReactNode;
  label: string;
  value: string;
  helper: string;
};

function ContactDetail({
  icon,
  label,
  value,
  helper,
}: ContactDetailProps) {
  return (
    <div className="flex items-start gap-4 rounded-2xl border border-slate-100 bg-slate-50/70 px-4 py-4">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-[#13B2B3] shadow-sm ring-1 ring-slate-200">
        {icon}
      </div>

      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
          {label}
        </p>

        <p className="mt-1 font-semibold text-slate-900">
          {value}
        </p>

        <p className="mt-0.5 text-xs text-slate-500">
          {helper}
        </p>
      </div>
    </div>
  );
}

type ContactInputProps = {
  label: string;
  name: keyof ContactFormData;
  value: string;
  onChange: (
    event: ChangeEvent<HTMLInputElement>,
  ) => void;
  type?: string;
  placeholder?: string;
  required?: boolean;
};

function ContactInput({
  label,
  name,
  value,
  onChange,
  type = "text",
  placeholder,
  required = false,
}: ContactInputProps) {
  return (
    <div>
      <label
        htmlFor={name}
        className="mb-2 block text-sm font-semibold text-slate-700"
      >
        {label}

        {required && (
          <span className="ml-1 text-red-500">
            *
          </span>
        )}
      </label>

      <input
        id={name}
        name={name}
        type={type}
        value={value}
        onChange={onChange}
        required={required}
        placeholder={placeholder}
        className="w-full rounded-xl border border-slate-300 px-4 py-3 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-[#13B2B3] focus:ring-4 focus:ring-[#13B2B3]/10"
      />
    </div>
  );
}

export default ContactPage;