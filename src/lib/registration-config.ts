import { getSettings } from "@/lib/settings-store";

/** True when REGISTRATION_OPEN=false forces registration closed (e.g. emergencies). */
export function registrationClosedByEnv(): boolean {
  return process.env.REGISTRATION_OPEN === "false";
}

/**
 * Is the public form taking registrations? Controlled from /admin →
 * Settings; REGISTRATION_OPEN=false in the environment always closes it.
 * (Walk-ins from /admin keep working either way.)
 */
export async function isRegistrationOpen(): Promise<boolean> {
  if (registrationClosedByEnv()) return false;
  return (await getSettings()).registrationOpen;
}

export const PRIVACY_POLICY_URL =
  process.env.NEXT_PUBLIC_PRIVACY_POLICY_URL ?? "https://spaceinafrica.com/privacy-policy-2/";
