// Supabase/PostgREST errors keep their details in non-enumerable or plain
// fields, so console.error(err) can print just "{}". This turns any error
// into a readable one-liner for the server log.
export function describeError(err: unknown): string {
  if (err && typeof err === "object") {
    const e = err as { name?: string; code?: string; message?: string; details?: string; hint?: string };
    const parts = [
      e.code && `code=${e.code}`,
      e.message && `message=${e.message}`,
      e.details && `details=${e.details}`,
      e.hint && `hint=${e.hint}`,
    ].filter(Boolean);
    if (parts.length) return parts.join(" | ");
  }
  return String(err);
}
