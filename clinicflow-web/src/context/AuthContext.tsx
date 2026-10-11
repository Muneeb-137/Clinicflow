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

import type {
  SignInResult,
  StaffUser,
} from "../types/auth";
import {
  postResendCode,
  postSignIn,
  postVerifyCode,
  readChallenge,
} from "../lib/twoStep";

type AuthContextType = {
  staff: StaffUser | null;
  loading: boolean;

  // Step one: the password. Usually answers with a
  // challenge for the emailed code.
  login: (
    email: string,
    password: string,
  ) => Promise<SignInResult<StaffUser>>;

  // Step two: the emailed code.
  verifyCode: (
    challengeId: string,
    code: string,
    trustDevice: boolean,
  ) => Promise<StaffUser>;

  resendCode: (challengeId: string) => Promise<string>;

  logout: () => void;
};

const AuthContext =
  createContext<AuthContextType | null>(null);

export function AuthProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [staff, setStaff] =
    useState<StaffUser | null>(null);

  const [loading, setLoading] =
    useState(true);

  const staffRef = useRef<StaffUser | null>(null);
  staffRef.current = staff;

  /*
   * An API call found the session expired: sign out
   * locally. The route guard then sends the user to the
   * login page, which explains why.
   */
  useEffect(() => {
    function handleExpired(event: Event) {
      const portal = (event as CustomEvent<{ portal: string }>)
        .detail?.portal;

      if (portal !== "staff" || !staffRef.current) {
        return;
      }

      markSessionExpired("staff");
      setStaff(null);
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
          "/api/auth/me",
        );

        if (!response.ok) {
          setStaff(null);
          return;
        }

        const data = await response.json();

        setStaff(data.staff);
      } catch (error) {
        console.error(
          "Unable to restore session:",
          error,
        );

        setStaff(null);
      } finally {
        setLoading(false);
      }
    }

    restoreSession();
  }, []);

  function signedIn(user: StaffUser) {
    setStaff(user);
    reconnectSocket();
    return user;
  }

  async function login(
    email: string,
    password: string,
  ): Promise<SignInResult<StaffUser>> {
    const data = await postSignIn("/api/auth", email, password);
    const challenge = readChallenge(data);

    if (challenge) {
      return { status: "two_step", challenge };
    }

    // Trusted device: signed in straight away.
    return { status: "signed_in", user: signedIn(data.staff as StaffUser) };
  }

  async function verifyCode(
    challengeId: string,
    code: string,
    trustDevice: boolean,
  ) {
    const data = await postVerifyCode("/api/auth", challengeId, code, trustDevice);
    return signedIn(data.staff as StaffUser);
  }

  function resendCode(challengeId: string) {
    return postResendCode("/api/auth", challengeId);
  }

  function logout() {
    setStaff(null);

    // Clear the session cookie on the server.
    void apiFetch("/api/auth/logout", {
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
    <AuthContext.Provider
      value={{
        staff,
        loading,
        login,
        verifyCode,
        resendCode,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error(
      "useAuth must be used inside AuthProvider.",
    );
  }

  return context;
}
