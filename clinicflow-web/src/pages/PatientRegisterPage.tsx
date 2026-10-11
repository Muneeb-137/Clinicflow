import { apiFetch } from "../lib/api";
import { ArrowLeft, ArrowRight, UserPlus } from "lucide-react";
import { useNavigate } from "react-router-dom";
import logo from "../assets/logo-new.svg";
import {
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";

function PatientRegisterPage() {
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    first_name: "",
    last_name: "",
    date_of_birth: "",
    phone: "",
    email: "",
    password: "",
    confirmPassword: "",
  });

  const [errorMessage, setErrorMessage] = useState("");
  const [loading, setLoading] = useState(false);

  function handleChange(
    event: ChangeEvent<HTMLInputElement>,
  ) {
    const { name, value } = event.target;

    setFormData((current) => ({
      ...current,
      [name]: value,
    }));
  }

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    try {
      setLoading(true);
      setErrorMessage("");

      if (
        formData.password !==
        formData.confirmPassword
      ) {
        setErrorMessage("Passwords do not match.");
        return;
      }

      if (formData.password.length < 8) {
        setErrorMessage(
          "Password must be at least 8 characters.",
        );
        return;
      }

      const response = await apiFetch(
        "/api/patient-auth/register",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            first_name: formData.first_name,
            last_name: formData.last_name,
            date_of_birth: formData.date_of_birth,
            phone: formData.phone,
            email: formData.email,
            password: formData.password,
          }),
        },
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.message ??
            "Unable to create account.",
        );
      }

      if (data.emailSent) {
  navigate(
    `/patient/check-email?email=${encodeURIComponent(
      formData.email,
    )}`,
  );
} else {
  setErrorMessage(
    "Your account was created, but we couldn't send the verification email. Please try again later.",
  );
}
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to create account.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#F7F9FC]">
      <div className="mx-auto max-w-6xl px-6 py-10 lg:px-8">
        {/* HEADER */}
        <div className="flex items-center justify-between">
          <img
            src={logo}
            alt="ClinicFlow"
            className="h-9 w-auto"
          />

          <button
            type="button"
            onClick={() => navigate("/patient/login")}
            className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 transition hover:text-[#13B2B3]"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to sign in
          </button>
        </div>

        <div className="mx-auto mt-14 max-w-3xl">
          <div className="mb-10 text-center">
            <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-teal-50 text-[#13B2B3]">
              <UserPlus className="h-7 w-7" />
            </div>

            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[#13B2B3]">
              Patient Registration
            </p>

            <h1 className="mt-3 text-3xl font-bold tracking-tight text-slate-900 md:text-4xl">
              Create your ClinicFlow account
            </h1>

            <p className="mx-auto mt-4 max-w-xl text-slate-500">
              Enter your information below to create your patient profile and
              access appointments, booking, and queue updates.
            </p>
          </div>

          <form
            onSubmit={handleSubmit}
            className="rounded-3xl border border-slate-200 bg-white p-7 shadow-sm md:p-9"
          >
            <div className="mb-8">
              <h2 className="text-lg font-semibold text-slate-900">
                Personal information
              </h2>

              <p className="mt-1 text-sm text-slate-500">
                Tell us a little about yourself.
              </p>
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  First name
                </label>

                <input
                  name="first_name"
                  value={formData.first_name}
                  onChange={handleChange}
                  type="text"
                  required
                  className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none transition focus:border-[#13B2B3] focus:ring-4 focus:ring-[#13B2B3]/10"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  Last name
                </label>

                <input
                  name="last_name"
                  value={formData.last_name}
                  onChange={handleChange}
                  type="text"
                  required
                  className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none transition focus:border-[#13B2B3] focus:ring-4 focus:ring-[#13B2B3]/10"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  Date of birth
                </label>

                <input
                  name="date_of_birth"
                  value={formData.date_of_birth}
                  onChange={handleChange}
                  type="date"
                  required
                  className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none transition focus:border-[#13B2B3] focus:ring-4 focus:ring-[#13B2B3]/10"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  Phone
                </label>

                <input
                  name="phone"
                  value={formData.phone}
                  onChange={handleChange}
                  type="tel"
                  required
                  className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none transition focus:border-[#13B2B3] focus:ring-4 focus:ring-[#13B2B3]/10"
                />
              </div>

              <div className="md:col-span-2">
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  Email address
                </label>

                <input
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  type="email"
                  required
                  className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none transition focus:border-[#13B2B3] focus:ring-4 focus:ring-[#13B2B3]/10"
                />
              </div>
            </div>

            <div className="my-8 h-px bg-slate-100" />

            <div className="mb-6">
              <h2 className="text-lg font-semibold text-slate-900">
                Secure your account
              </h2>

              <p className="mt-1 text-sm text-slate-500">
                Create a password for future sign-ins.
              </p>
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  Password
                </label>

                <input
                  name="password"
                  value={formData.password}
                  onChange={handleChange}
                  type="password"
                  required
                  minLength={8}
                  className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none transition focus:border-[#13B2B3] focus:ring-4 focus:ring-[#13B2B3]/10"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  Confirm password
                </label>

                <input
                  name="confirmPassword"
                  value={formData.confirmPassword}
                  onChange={handleChange}
                  type="password"
                  required
                  minLength={8}
                  className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none transition focus:border-[#13B2B3] focus:ring-4 focus:ring-[#13B2B3]/10"
                />
              </div>
            </div>

            {errorMessage && (
              <div className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {errorMessage}
              </div>
            )}

            <div className="mt-8 flex justify-end">
              <button
                type="submit"
                disabled={loading}
                className="group inline-flex items-center gap-2 rounded-xl bg-[#13B2B3] px-6 py-3.5 text-sm font-semibold text-white transition hover:bg-[#109c9d] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading
                  ? "Creating account..."
                  : "Create account"}

                {!loading && (
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

export default PatientRegisterPage;