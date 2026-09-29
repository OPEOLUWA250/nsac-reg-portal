"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Card, Kicker } from "@/components/ui";
import { useAdmin } from "@/components/admin/AdminContext";
import { EVENT_INFO } from "@/lib/event-info";

// /admin/settings: open/close registration, plus a read-only view of how
// payments, email and security are set up.

interface SettingsResponse {
  settings: { registrationOpen: boolean };
  closedByEnv: boolean;
  ticketsOnSale: number;
  adminCodeRequired: boolean;
  status: {
    payments: { configured: boolean; mode: "live" | "test" | null; webhook: boolean };
    email: { provider: string | null; sender: string | null; testSender: boolean };
    security: { staffCode: boolean; adminCode: boolean; spamProtection: boolean };
    publicUrl: string | null;
  };
}

export default function SettingsPanel() {
  const { apiCall, adminCode, setAdminCode } = useAdmin();
  const [data, setData] = useState<SettingsResponse | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let cancelled = false;
    apiCall("/api/admin/settings").then(
      (json) => !cancelled && setData(json as unknown as SettingsResponse),
      (err) => !cancelled && setError(err instanceof Error ? err.message : "Failed to load settings")
    );
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once
  }, []);

  async function setRegistrationOpen(open: boolean) {
    if (!data) return;
    const question = open
      ? "Open registration? The public form will accept new registrations."
      : "Close registration? The public form will show “Registration is currently closed”. Walk-ins in the admin keep working.";
    if (!window.confirm(question)) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const json = await apiCall("/api/admin/settings", {
        method: "POST",
        body: JSON.stringify({ registrationOpen: open }),
      });
      setData({ ...data, settings: json.settings as SettingsResponse["settings"] });
      setNotice(open ? "Registration is open." : "Registration is closed.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  const open = data?.settings.registrationOpen ?? true;
  const effectiveOpen = data ? open && !data.closedByEnv && data.ticketsOnSale > 0 : false;

  return (
    <main className="px-4 py-6 sm:px-8 sm:py-10">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="space-y-1">
          <Kicker>Settings</Kicker>
          <h1 className="font-display text-3xl text-navy">Settings</h1>
          <p className="text-sm text-navy/55">How the registration portal is running.</p>
        </div>

        {error && <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
        {notice && <p className="rounded-xl border border-gold/40 bg-gold/10 px-4 py-3 text-sm text-navy">{notice}</p>}

        {data?.adminCodeRequired && (
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-gold/40 bg-gold/10 px-4 py-3">
            <label htmlFor="admin-code" className="text-sm font-semibold text-navy">Admin code</label>
            <input
              id="admin-code"
              type="password"
              autoComplete="off"
              className="w-full max-w-[220px] rounded-lg border border-navy/15 bg-white px-3 py-2 text-sm text-navy outline-none focus:border-gold focus:ring-2 focus:ring-gold/25"
              value={adminCode}
              onChange={(e) => setAdminCode(e.target.value)}
            />
            <span className="text-xs text-navy/55">Needed to change settings and prices.</span>
          </div>
        )}

        {/* Registration switch */}
        <Card className="p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-1.5 max-w-xl">
              <h2 className="font-display text-lg text-navy">Public registration</h2>
              <p className="text-sm text-navy/60">
                When closed, the registration form shows “Registration is currently closed” and accepts no new
                registrations. Walk-ins added here in the admin keep working.
              </p>
              {data && (
                <p className={`inline-flex items-center gap-2 text-sm font-semibold ${effectiveOpen ? "text-emerald-700" : "text-red-700"}`}>
                  <span className={`h-2 w-2 rounded-full ${effectiveOpen ? "bg-emerald-500" : "bg-red-500"}`} />
                  {effectiveOpen
                    ? "The form is taking registrations"
                    : data.closedByEnv
                      ? "Closed by the server setting REGISTRATION_OPEN=false"
                      : data.ticketsOnSale === 0
                        ? "Closed: no ticket is on sale (see Tickets & prices)"
                        : "The form is closed"}
                </p>
              )}
            </div>
            <Switch
              checked={open}
              disabled={!data || saving || data.closedByEnv}
              onChange={setRegistrationOpen}
              label={open ? "Open" : "Closed"}
            />
          </div>
        </Card>

        {/* Event */}
        <Card className="p-6 space-y-3">
          <h2 className="font-display text-lg text-navy">Event</h2>
          <dl className="divide-y divide-navy/6">
            <Row label="Name" value={EVENT_INFO.name.en} />
            <Row label="Dates" value={EVENT_INFO.date.en} />
            <Row label="Venue" value={EVENT_INFO.place.en} />
            <Row label="Website" value={<a className="underline decoration-gold" href={EVENT_INFO.websiteUrl} target="_blank" rel="noopener noreferrer">{EVENT_INFO.website}</a>} />
            <Row label="Portal address" value={data?.status.publicUrl ?? <Warn>Not set (PUBLIC_BASE_URL)</Warn>} />
          </dl>
          <p className="text-xs text-navy/45">Event details are used on the form, tickets, flyers, emails and calendar invites. Ask your developer to change them.</p>
        </Card>

        {/* System status */}
        {data && (
          <div className="grid gap-4 md:grid-cols-3">
            <StatusCard title="Payments (Stripe)">
              <Check ok={data.status.payments.configured} label="Stripe connected" />
              <Check
                ok={data.status.payments.mode === "live"}
                warn={data.status.payments.mode === "test"}
                label={data.status.payments.mode === "live" ? "Live mode — real payments" : data.status.payments.mode === "test" ? "Test mode — no real money" : "No mode"}
              />
              <Check ok={data.status.payments.webhook} label="Payment confirmations (webhook)" />
            </StatusCard>
            <StatusCard title="Email">
              <Check ok={Boolean(data.status.email.provider)} label={data.status.email.provider ? `Sending via ${data.status.email.provider}` : "No email provider"} />
              <Check ok={Boolean(data.status.email.sender) && !data.status.email.testSender} warn={data.status.email.testSender} label={data.status.email.sender ? `From ${data.status.email.sender}` : "No sender address"} />
            </StatusCard>
            <StatusCard title="Security">
              <Check ok={data.status.security.staffCode} label="Staff access code" />
              <Check ok={data.status.security.adminCode} warn={!data.status.security.adminCode} label={data.status.security.adminCode ? "Admin code for prices & settings" : "No separate admin code"} />
              <Check ok={data.status.security.spamProtection} warn={!data.status.security.spamProtection} label="Spam protection (Turnstile)" />
            </StatusCard>
          </div>
        )}
      </div>
    </main>
  );
}

function Switch({ checked, disabled, onChange, label }: { checked: boolean; disabled?: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="inline-flex items-center gap-3 disabled:opacity-50"
    >
      <span className={`relative h-8 w-14 rounded-full transition-colors ${checked ? "bg-gold" : "bg-navy/20"}`}>
        <span className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-all ${checked ? "left-7" : "left-1"}`} />
      </span>
      <span className="text-sm font-semibold text-navy w-14 text-left">{label}</span>
    </button>
  );
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="grid grid-cols-[9rem_1fr] gap-3 py-2.5 text-sm">
      <dt className="text-navy/50">{label}</dt>
      <dd className="text-navy break-words">{value}</dd>
    </div>
  );
}

function StatusCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-navy/10 bg-white p-5">
      <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-gold">{title}</div>
      <ul className="mt-3 space-y-2.5">{children}</ul>
    </div>
  );
}

function Check({ ok, warn, label }: { ok: boolean; warn?: boolean; label: string }) {
  const tone = ok ? "bg-emerald-500" : warn ? "bg-gold" : "bg-red-500";
  return (
    <li className="flex items-start gap-2.5 text-sm text-navy">
      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${tone}`} />
      <span>{label}</span>
    </li>
  );
}

function Warn({ children }: { children: ReactNode }) {
  return <span className="text-red-700">{children}</span>;
}
