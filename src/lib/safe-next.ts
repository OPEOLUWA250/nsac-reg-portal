// Where to send an admin after signing in (or after a password-reset link).
// Only plain /admin paths are allowed, so a crafted ?next= can't send
// someone to another site ("open redirect") or to an unexpected page.

export const SAFE_ADMIN_NEXT = /^\/admin(\/[\w-]*)*$/;

export function safeAdminNext(next: string | null | undefined, fallback = "/admin"): string {
  return typeof next === "string" && SAFE_ADMIN_NEXT.test(next) ? next : fallback;
}
