import type { SignInResult } from "../types/auth";
import {
  postResendCode,
  postSignIn,
  postVerifyCode,
  readChallenge,
} from "../lib/twoStep";
import {
  apiFetch,
  markSessionExpired,
  SESSION_EXPIRED_EVENT,
} from "../lib/api";
import { reconnectSocket } from "../socket";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

import type { ReactNode } from "react";

export type PatientUser = {
  patient_user_id: number;
  patient_id: number;
  first_name: string;
  last_name: string;
  email: string;
};

type PatientAuthContextType = {
  patient: PatientUser | null;
  loading: boolean;

  // Step one: the password. Usually answers with a
  // challenge for the emailed code.
  login: (
    email: string,
    password: string,
  ) => Promise<SignInResult<PatientUser>>;

  // Step two: the emailed code.
  verifyCode: (
    challengeId: string,
    code: string,
    trustDevice: boolean,
  ) => Promise<PatientUser>;

  resendCode: (challengeId: string) => Promise<string>;

  logout: () => void;
};

const PatientAuthContext =
  createContext<PatientAuthContextType | null>(
    null,
  );

export function PatientAuthProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [patient, setPatient] =
    useState<PatientUser | null>(null);

  const [loading, setLoading] =
    useState(true);

  const patientRef = useRef<PatientUser | null>(null);
  patientRef.current = patient;

  // Session expired during use: sign out locally (see
  // AuthContext).
  useEffect(() => {
    function handleExpired(event: Event) {
      const portal = (event as CustomEvent<{ portal: string }>)
        .detail?.portal;

      if (portal !== "patient" || !patientRef.current) {
        return;
      }

      markSessionExpired("patient");
      setPatient(null);
      reconnectSocket();
    }

    window.addEventListener(SESSION_EXPIRED_EVENT, handleExpired);

    return () =>
      window.removeEventListener(
        SESSION_EXPIRED_EVENT,
        handleExpired,
      );
  }, []);

  /*
   * The session is an httpOnly cookie the page cannot
   * read, so ask the server who is signed in.
   */
  useEffect(() => {
    async function restoreSession() {
      try {
        const response = await apiFetch(
          "/api/patient-auth/me",
        );

        if (!response.ok) {
          setPatient(null);
          return;
        }

        const data = await response.json();

        setPatient(
          data.patient as PatientUser,
        );
      } catch (error) {
        console.error(
          "Unable to restore patient session:",
          error,
        );

        setPatient(null);
      } finally {
        setLoading(false);
      }
    }

    restoreSession();
  }, []);

  function signedIn(user: PatientUser) {
    setPatient(user);
    reconnectSocket();
    return user;
  }

  async function login(
    email: string,
    password: string,
  ): Promise<SignInResult<PatientUser>> {
    setPatient(null);

    const data = await postSignIn("/api/patient-auth", email, password);
    const challenge = readChallenge(data);

    if (challenge) {
      return { status: "two_step", challenge };
    }

    if (!data.patient) {
      throw new Error("Patient login did not return patient information.");
    }

    // Trusted device: signed in straight away.
    return { status: "signed_in", user: signedIn(data.patient as PatientUser) };
  }

  async function verifyCode(
    challengeId: string,
    code: string,
    trustDevice: boolean,
  ) {
    const data = await postVerifyCode("/api/patient-auth", challengeId, code, trustDevice);
    return signedIn(data.patient as PatientUser);
  }

  function resendCode(challengeId: string) {
    return postResendCode("/api/patient-auth", challengeId);
  }

  function logout() {
    setPatient(null);

    // Clear the session cookie on the server.
    void apiFetch("/api/patient-auth/logout", {
      method: "POST",
    })
      .catch((error) => {
        console.error(
          "Unable to sign out:",
          error,
        );
      })
      .finally(() => {
        reconnectSocket();
      });
  }

  return (
    <PatientAuthContext.Provider
      value={{
        patient,
        loading,
        login,
        verifyCode,
        resendCode,
        logout,
      }}
    >
      {children}
    </PatientAuthContext.Provider>
  );
}

export function usePatientAuth() {
  const context =
    useContext(PatientAuthContext);

  if (!context) {
    throw new Error(
      "usePatientAuth must be used inside PatientAuthProvider.",
    );
  }

  return context;
}
