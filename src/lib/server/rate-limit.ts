import "server-only";
import crypto from "node:crypto";
import type { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

// Per-visitor limits for the public checks and admin sign-in, counted in
// Supabase (20261003110000_rate_limits.sql, see the README) so they hold
// across every server instance. Fails open: if the count can't be reached,
// the request goes through, so registration never stops because of this.

/** The visitor's IP. Vercel sets these headers itself, so they can't be faked. */
export function clientIp(req: NextRequest): string {
  return req.headers.get("x-real-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

/**
 * Counts one request against `scope` for `value` (an IP or an email) and
 * says whether it's still within `max` requests per `windowSeconds`.
 * Values are hashed, so no IPs or emails are stored.
 */
export async function withinLimit(scope: string, value: string, max: number, windowSeconds: number): Promise<boolean> {
  const key = `${scope}:${crypto.createHash("sha256").update(value.toLowerCase()).digest("hex").slice(0, 32)}`;
  try {
    const { data, error } = await supabaseAdmin().rpc("rate_limit_hit", { p_key: key, p_max: max, p_window_seconds: windowSeconds });
    if (error) throw error;
    return data !== false;
  } catch (err) {
    console.warn(`Rate limit check failed (allowing the request): ${err instanceof Error ? err.message : String(err)}`);
    return true;
  }
}

/** Deletes counters older than a day (called by the daily keep-alive job). */
export async function pruneRateLimits(): Promise<void> {
  const cutoff = new Date(Date.now() - 24 * 60 * 60_000).toISOString();
  const { error } = await supabaseAdmin().from("rate_limits").delete().lt("window_start", cutoff);
  if (error) console.warn(`Pruning rate limits failed: ${error.message}`);
}
