export type StaffRole =
  | "admin"
  | "receptionist"
  | "doctor";

export type StaffUser = {
  staff_user_id: number;
  first_name: string;
  last_name: string;
  email: string;
  role: StaffRole;

  // Only populated when this login belongs
  // to a physician.
  doctor_id: number | null;
};

export type LoginResponse = {
  staff: StaffUser;
};
/*
 * Signing in has two steps: the password, then a code
 * emailed to the account (skipped on a trusted device).
 */
export type TwoStepChallenge = {
  challengeId: string;
  emailHint: string;
};

export type SignInResult<User> =
  | { status: "signed_in"; user: User }
  | { status: "two_step"; challenge: TwoStepChallenge };

export type TwoStepResponse = {
  two_step_required: true;
  challenge_id: string;
  email_hint: string;
};
