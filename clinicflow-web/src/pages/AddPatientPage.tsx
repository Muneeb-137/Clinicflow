import { apiFetch } from "../lib/api";
import {
  useEffect,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import {
  useNavigate,
  useParams,
} from "react-router-dom";
import { ArrowLeft, UserPlus } from "lucide-react";


type Doctor = {
  doctor_id: number;
  first_name: string;
  last_name: string;
  specialty: string | null;
};

type PatientFormData = {
  first_name: string;
  last_name: string;
  date_of_birth: string;
  phone: string;
  email: string;
  address_line: string;
  city: string;
  province: string;
  postal_code: string;
  emergency_contact_name: string;
  emergency_contact_phone: string;
  primary_doctor_id: string;
  notes: string;
};

const initialFormData: PatientFormData = {
  first_name: "",
  last_name: "",
  date_of_birth: "",
  phone: "",
  email: "",
  address_line: "",
  city: "",
  province: "Ontario",
  postal_code: "",
  emergency_contact_name: "",
  emergency_contact_phone: "",
  primary_doctor_id: "",
  notes: "",
};

function AddPatientPage() {
  const navigate = useNavigate();
  const { patientId } = useParams();

  const isEditMode = Boolean(patientId);

  const [loadingPatient, setLoadingPatient] =
    useState(isEditMode);

  const [formData, setFormData] =
    useState<PatientFormData>(initialFormData);
    const [doctors, setDoctors] = useState<Doctor[]>([]);
const [loadingDoctors, setLoadingDoctors] = useState(true);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
  async function loadDoctors() {
    try {
      setLoadingDoctors(true);

      const response = await apiFetch(
        "/api/doctors",
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.message ?? "Unable to load doctors.",
        );
      }

      setDoctors(data);
    } catch (error) {
      console.error("Unable to load doctors:", error);
    } finally {
      setLoadingDoctors(false);
    }
  }

  loadDoctors();
}, []);

useEffect(() => {
  if (!patientId) {
    return;
  }

  async function loadPatient() {
    try {
      setLoadingPatient(true);
      setErrorMessage("");

      const response = await apiFetch(
        `/api/patients/${patientId}`,
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.message ?? "Unable to load patient.",
        );
      }

      setFormData({
        first_name: data.first_name ?? "",
        last_name: data.last_name ?? "",

        date_of_birth: data.date_of_birth
          ? String(data.date_of_birth).slice(0, 10)
          : "",

        phone: data.phone ?? "",
        email: data.email ?? "",
        address_line: data.address_line ?? "",
        city: data.city ?? "",
        province: data.province ?? "Ontario",
        postal_code: data.postal_code ?? "",

        emergency_contact_name:
          data.emergency_contact_name ?? "",

        emergency_contact_phone:
          data.emergency_contact_phone ?? "",

        primary_doctor_id:
          data.primary_doctor_id
            ? String(data.primary_doctor_id)
            : "",

        notes: data.notes ?? "",
      });
    } catch (error) {
      console.error(error);

      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to load patient.",
      );
    } finally {
      setLoadingPatient(false);
    }
  }

  loadPatient();
}, [patientId]);
  function handleChange(
    event: ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >
  ) {
    const { name, value } = event.target;

    setFormData((previousFormData) => ({
      ...previousFormData,
      [name]: value,
    }));
  }

async function handleSubmit(
  event: FormEvent<HTMLFormElement>,
) {
  event.preventDefault();

  setIsSubmitting(true);
  setErrorMessage("");

  try {
    const url = isEditMode
      ? `/api/patients/${patientId}`
      : "/api/patients";

    const response = await apiFetch(url, {
      method: isEditMode ? "PUT" : "POST",

      headers: {
        "Content-Type": "application/json",
      },

      body: JSON.stringify({
        ...formData,

        primary_doctor_id:
          formData.primary_doctor_id === ""
            ? null
            : Number(
                formData.primary_doctor_id,
              ),
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(
        result.message ??
          (isEditMode
            ? "Unable to update patient."
            : "Unable to add patient."),
      );
    }

    navigate("/patients");
  } catch (error) {
    if (error instanceof Error) {
      setErrorMessage(error.message);
    } else {
      setErrorMessage(
        isEditMode
          ? "Unable to update patient."
          : "Something went wrong.",
      );
    }
  } finally {
    setIsSubmitting(false);
  }
}

if (loadingPatient) {
  return (
    <section className="mx-auto w-full max-w-5xl">
      <div className="rounded-2xl border border-slate-200 bg-white px-6 py-20 text-center shadow-sm">
        <div className="mx-auto h-9 w-9 animate-spin rounded-full border-4 border-slate-200 border-t-[#13B2B3]" />

        <p className="mt-4 font-medium text-slate-700">
          Loading patient information...
        </p>
      </div>
    </section>
  );
}

  return (
    <section className="mx-auto w-full max-w-5xl">
      <button
        type="button"
        onClick={() => navigate("/patients")}
        className="mb-6 flex items-center gap-2 text-sm font-medium text-slate-500 transition hover:text-[#13B2B3]"
      >
        <ArrowLeft size={18} />
        Back to patients
      </button>

      <div className="mb-8">
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-[#F5FCFD] text-[#13B2B3] ring-1 ring-[#13B2B3]/20">
          <UserPlus size={24} />
        </div>

        <h1 className="font-display text-3xl font-semibold text-slate-900">
  {isEditMode ? "Edit Patient" : "Add Patient"}
</h1>

<p className="mt-2 text-slate-500">
  {isEditMode
    ? "Update this patient's information and clinic record."
    : "Create a new patient record for the clinic."}
</p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm"
      >
        <div className="grid gap-6 md:grid-cols-2">
          <FormInput
            label="First name"
            name="first_name"
            value={formData.first_name}
            onChange={handleChange}
            required
          />

          <FormInput
            label="Last name"
            name="last_name"
            value={formData.last_name}
            onChange={handleChange}
            required
          />

          <FormInput
            label="Date of birth"
            name="date_of_birth"
            type="date"
            value={formData.date_of_birth}
            onChange={handleChange}
            required
          />

          <FormInput
            label="Phone number"
            name="phone"
            type="tel"
            value={formData.phone}
            onChange={handleChange}
          />

          <FormInput
            label="Email"
            name="email"
            type="email"
            value={formData.email}
            onChange={handleChange}
          />

          <FormInput
            label="Address"
            name="address_line"
            value={formData.address_line}
            onChange={handleChange}
          />

          <FormInput
            label="City"
            name="city"
            value={formData.city}
            onChange={handleChange}
          />

          <div>
            <label
              htmlFor="province"
              className="mb-2 block text-sm font-medium text-slate-700"
            >
              Province
            </label>

            <select
              id="province"
              name="province"
              value={formData.province}
              onChange={handleChange}
              className="w-full rounded-lg border border-slate-300 px-4 py-3 outline-none transition focus:border-[#149BC0] focus:ring-2 focus:ring-[#149BC0]/15"
            >
              <option value="Ontario">Ontario</option>
              <option value="Quebec">Quebec</option>
              <option value="British Columbia">
                British Columbia
              </option>
              <option value="Alberta">Alberta</option>
              <option value="Manitoba">Manitoba</option>
              <option value="Saskatchewan">Saskatchewan</option>
              <option value="Nova Scotia">Nova Scotia</option>
              <option value="New Brunswick">New Brunswick</option>
              <option value="Newfoundland and Labrador">
                Newfoundland and Labrador
              </option>
              <option value="Prince Edward Island">
                Prince Edward Island
              </option>
            </select>
          </div>

            <FormInput
            label="Postal code"
            name="postal_code"
            value={formData.postal_code}
            onChange={handleChange}
            />

            <div>
            <label
                htmlFor="primary_doctor_id"
                className="mb-2 block text-sm font-medium text-slate-700"
            >
                Primary Care Provider

                <span className="ml-2 text-xs font-normal text-slate-400">
                Optional
                </span>
            </label>

            <select
                id="primary_doctor_id"
                name="primary_doctor_id"
                value={formData.primary_doctor_id}
                onChange={handleChange}
                disabled={loadingDoctors}
                className="w-full rounded-lg border border-slate-300 bg-white px-4 py-3 outline-none transition focus:border-[#149BC0] focus:ring-2 focus:ring-[#149BC0]/15 disabled:cursor-not-allowed disabled:bg-slate-50"
            >
                <option value="">
                Not Assigned
                </option>

                {doctors.map((doctor) => (
                <option
                    key={doctor.doctor_id}
                    value={doctor.doctor_id}
                >
                    Dr. {doctor.first_name} {doctor.last_name}
                    {doctor.specialty
                    ? ` — ${doctor.specialty}`
                    : ""}
                </option>
                ))}
            </select>

            <p className="mt-2 text-xs text-slate-500">
                Leave empty for walk-in or non-rostered patients.
            </p>
            </div>

            <FormInput
            label="Emergency contact name"
            name="emergency_contact_name"
            value={formData.emergency_contact_name}
            onChange={handleChange}
            />

            <FormInput
            label="Emergency contact phone"
            name="emergency_contact_phone"
            type="tel"
            value={formData.emergency_contact_phone}
            onChange={handleChange}
            />
            </div>

        <div className="mt-6">
          <label
            htmlFor="notes"
            className="mb-2 block text-sm font-medium text-slate-700"
          >
            Notes
          </label>

          <textarea
            id="notes"
            name="notes"
            value={formData.notes}
            onChange={handleChange}
            rows={4}
            placeholder="Optional administrative notes"
            className="w-full resize-none rounded-lg border border-slate-300 px-4 py-3 outline-none transition focus:border-[#149BC0] focus:ring-2 focus:ring-[#149BC0]/20 focus:shadow-sm"
          />
        </div>

        {errorMessage && (
          <div className="mt-6 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
            {errorMessage}
          </div>
        )}

        <div className="mt-8 flex justify-end gap-3 border-t border-slate-200 pt-6">
          <button
            type="button"
            onClick={() => navigate("/patients")}
            className="rounded-lg border border-slate-300 px-5 py-3 font-medium text-slate-700 transition hover:bg-slate-50"
          >
            Cancel
          </button>

          <button
            type="submit"
            disabled={isSubmitting}
            className="rounded-lg bg-gradient-to-r from-teal-500 to-[#0877C9] px-5 py-3 font-medium text-white shadow-sm transition hover:from-teal-600 hover:to-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting
  ? isEditMode
    ? "Updating patient..."
    : "Adding patient..."
  : isEditMode
    ? "Update Patient"
    : "Add Patient"}
          </button>
        </div>
      </form>
    </section>
  );
}

type FormInputProps = {
  label: string;
  name: keyof PatientFormData;
  value: string;
  type?: string;
  required?: boolean;
  onChange: (
    event: ChangeEvent<HTMLInputElement>
  ) => void;
};

function FormInput({
  label,
  name,
  value,
  type = "text",
  required = false,
  onChange,
}: FormInputProps) {
  return (
    <div>
      <label
        htmlFor={name}
        className="mb-2 block text-sm font-medium text-slate-700"
      >
        {label}

        {required && (
          <span className="ml-1 text-red-500">*</span>
        )}
      </label>

      <input
        id={name}
        name={name}
        type={type}
        value={value}
        onChange={onChange}
        required={required}
        className="w-full rounded-lg border border-slate-300 px-4 py-3 outline-none transition focus:border-[#149bc0] focus:ring-2 focus:ring-[#149BC0]/20 focus:shadow-sm"
      />
    </div>
  );
}

export default AddPatientPage;