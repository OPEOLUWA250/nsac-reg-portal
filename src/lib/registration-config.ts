// Set REGISTRATION_OPEN=false to close public registration (walk-ins from
// /admin keep working).
export function registrationOpen(): boolean {
  return process.env.REGISTRATION_OPEN !== "false";
}

export const PRIVACY_POLICY_URL =
  process.env.NEXT_PUBLIC_PRIVACY_POLICY_URL ?? "https://spaceinafrica.com/privacy-policy-2/";
