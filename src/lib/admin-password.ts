// Admin password rules, shared by the sign-in pages (browser) and the auth
// API routes (server), so both sides enforce exactly the same limits.

export const ADMIN_PASSWORD_MIN = 12;
export const ADMIN_PASSWORD_MAX = 200;

/** Why a new password isn't acceptable, or null when it's fine. */
export function passwordProblem(password: string): string | null {
  if (password.length < ADMIN_PASSWORD_MIN) return `Use at least ${ADMIN_PASSWORD_MIN} characters.`;
  if (password.length > ADMIN_PASSWORD_MAX) return `Use at most ${ADMIN_PASSWORD_MAX} characters.`;
  return null;
}
