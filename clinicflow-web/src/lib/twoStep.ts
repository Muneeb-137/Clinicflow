import { apiFetch } from "./api";
import type { TwoStepChallenge, TwoStepResponse } from "../types/auth";

/*
 * Requests for the second sign-in step. base is
 * "/api/auth" (staff and doctors) or "/api/patient-auth".
 */
async function postJson(url: string, body: unknown) {
  const response = await apiFetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message ?? "Something went wrong. Please try again.");
  }

  return data;
}

export function readChallenge(data: unknown): TwoStepChallenge | null {
  const value = data as Partial<TwoStepResponse> | null;

  return value?.two_step_required && value.challenge_id
    ? { challengeId: value.challenge_id, emailHint: value.email_hint ?? "your email" }
    : null;
}

export function postSignIn(base: string, email: string, password: string) {
  return postJson(`${base}/login`, { email, password });
}

export function postVerifyCode(
  base: string,
  challengeId: string,
  code: string,
  trustDevice: boolean,
) {
  return postJson(`${base}/login/verify`, {
    challenge_id: challengeId,
    code,
    trust_device: trustDevice,
  });
}

export async function postResendCode(base: string, challengeId: string) {
  const data = await postJson(`${base}/login/resend`, { challenge_id: challengeId });
  return (data.email_hint as string) ?? "your email";
}
