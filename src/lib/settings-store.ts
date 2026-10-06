import { supabaseAdmin } from "@/lib/supabase-admin";
import { describeError } from "@/lib/describe-error";

// Server-only: settings edited from /admin → Settings, stored in the
// `settings` table (20260929130000_settings.sql, see the README).

export interface AppSettings {
  /** Public registration form accepting new registrations. */
  registrationOpen: boolean;
}

const DEFAULTS: AppSettings = { registrationOpen: true };

const KEYS: Record<keyof AppSettings, string> = {
  registrationOpen: "registration_open",
};

export async function getSettings(): Promise<AppSettings> {
  try {
    const { data, error } = await supabaseAdmin().from("settings").select("key, value");
    if (error) throw error;
    const byKey = new Map((data ?? []).map((row) => [row.key as string, row.value as unknown]));
    return {
      registrationOpen:
        typeof byKey.get(KEYS.registrationOpen) === "boolean"
          ? (byKey.get(KEYS.registrationOpen) as boolean)
          : DEFAULTS.registrationOpen,
    };
  } catch (err) {
    // Table missing (migration not run) or database hiccup: fall back to
    // defaults rather than closing registration by accident.
    console.error(`Could not read settings, using defaults: ${describeError(err)}`);
    return DEFAULTS;
  }
}

export async function updateSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
  const rows = (Object.keys(patch) as (keyof AppSettings)[])
    .filter((k) => patch[k] !== undefined)
    .map((k) => ({ key: KEYS[k], value: patch[k], updated_at: new Date().toISOString() }));
  if (rows.length) {
    const { error } = await supabaseAdmin().from("settings").upsert(rows, { onConflict: "key" });
    if (error) throw error;
  }
  return getSettings();
}
