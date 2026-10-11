import { apiFetch } from "../lib/api";
import {
  CheckCircle2,
  CircleAlert,
  LoaderCircle,
} from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
} from "react";
import {
  useNavigate,
  useSearchParams,
} from "react-router-dom";

type VerificationStatus =
  | "loading"
  | "success"
  | "error";

type VerificationResult = {
  ok: boolean;
  message: string;
};

async function verifyEmail(
  token: string,
): Promise<VerificationResult> {
  try {
    const response = await apiFetch(
      "/api/patient-auth/verify-email",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          token,
        }),
      },
    );

    const data = await response
      .json()
      .catch(() => ({}));

    if (!response.ok) {
      return {
        ok: false,
        message:
          data.message ??
          "Unable to verify email.",
      };
    }

    return {
      ok: true,
      message:
        data.message ??
        "Email successfully verified.",
    };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : "Unable to verify email.",
    };
  }
}

function PatientVerifyEmailPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [status, setStatus] =
    useState<VerificationStatus>("loading");

  const [message, setMessage] = useState(
    "Verifying your email...",
  );

  /*
    The token is single-use. React StrictMode runs
    effects twice in development, so remember the
    request for the current token and reuse it instead
    of POSTing the same token again (the second POST
    would fail and hide the successful verification).
  */
  const verificationRef = useRef<{
    token: string;
    promise: Promise<VerificationResult>;
  } | null>(null);

  const token = searchParams.get("token");

  useEffect(() => {
    let ignore = false;

    if (!token) {
      setStatus("error");
      setMessage(
        "This verification link is invalid.",
      );
      return;
    }

    if (
      verificationRef.current?.token !== token
    ) {
      verificationRef.current = {
        token,
        promise: verifyEmail(token),
      };
    }

    verificationRef.current.promise.then(
      (result) => {
        if (ignore) {
          return;
        }

        setStatus(
          result.ok ? "success" : "error",
        );
        setMessage(result.message);
      },
    );

    return () => {
      ignore = true;
    };
  }, [token]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F7F9FC] px-6">
      <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        {status === "loading" && (
          <>
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#13B2B3]/10">
              <LoaderCircle className="h-8 w-8 animate-spin text-[#13B2B3]" />
            </div>

            <h1 className="mt-6 text-2xl font-bold text-slate-900">
              Verifying your email
            </h1>

            <p className="mt-3 text-sm text-slate-500">
              {message}
            </p>
          </>
        )}

        {status === "success" && (
          <>
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50">
              <CheckCircle2 className="h-8 w-8 text-emerald-600" />
            </div>

            <h1 className="mt-6 text-2xl font-bold text-slate-900">
              Email verified
            </h1>

            <p className="mt-3 text-sm leading-6 text-slate-500">
              Your ClinicFlow patient account is ready.
              You can now sign in.
            </p>

            <button
              type="button"
              onClick={() =>
                navigate("/patient/login")
              }
              className="mt-8 w-full rounded-xl bg-[#13B2B3] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#109c9d]"
            >
              Continue to sign in
            </button>
          </>
        )}

        {status === "error" && (
          <>
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-50">
              <CircleAlert className="h-8 w-8 text-red-500" />
            </div>

            <h1 className="mt-6 text-2xl font-bold text-slate-900">
              Verification failed
            </h1>

            <p className="mt-3 text-sm leading-6 text-slate-500">
              {message}
            </p>

            <button
              type="button"
              onClick={() =>
                navigate("/patient/login")
              }
              className="mt-8 w-full rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white"
            >
              Back to sign in
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default PatientVerifyEmailPage;