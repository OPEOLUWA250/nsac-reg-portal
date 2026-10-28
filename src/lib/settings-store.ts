import { supabaseAdmin } from "@/lib/supabase-admin";
import { describeError } from "@/lib/describe-error";
import { cleanAlertEmails } from "@/lib/alert-emails";
import { cleanAutoReminders, DEFAULT_AUTO_REMINDERS, type AutoReminders } from "@/lib/auto-reminders";

// Server-only: settings edited from /admin → Settings, stored in the
// `settings` table (20260929130000_settings.sql, see the README). One row
// per setting, the value as JSON: a new setting needs no database change.

export interface AppSettings {
  /** Public registration form accepting new registrations. */
  registrationOpen: boolean;
  /** Who gets the "new registration" email, besides ADMIN_NOTIFY_EMAILS. */
  alertEmails: string[];
  /** One automatic payment reminder for people who haven't paid (off unless switched on). */
  autoReminders: AutoReminders;
}

const DEFAULTS: AppSettings = { registrationOpen: true, alertEmails: [], autoReminders: DEFAULT_AUTO_REMINDERS };

const KEYS: Record<keyof AppSettings, string> = {
  registrationOpen: "registration_open",
  alertEmails: "alert_emails",
  autoReminders: "auto_payment_reminders",
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
      alertEmails: cleanAlertEmails(byKey.get(KEYS.alertEmails)) ?? DEFAULTS.alertEmails,
      autoReminders: cleanAutoReminders(byKey.get(KEYS.autoReminders)) ?? DEFAULTS.autoReminders,
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
