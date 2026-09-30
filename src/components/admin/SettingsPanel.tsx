"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { AdminPage, Alert, Button, Card, cx, ErrorState, linkClass, LoadingLabel, PageHeader, Skeleton, Spinner } from "@/components/ui";
import DeleteDialog from "@/components/admin/DeleteDialog";
import { useAdmin } from "@/components/admin/AdminContext";
import { EVENT_INFO } from "@/lib/event-info";

// /admin/settings: open/close registration, plus a read-only view of how
// payments, email and security are set up.

interface SettingsResponse {
  settings: { registrationOpen: boolean };
  closedByEnv: boolean;
  ticketsOnSale: number;
  status: {
    payments: { configured: boolean; mode: "live" | "test" | null; webhook: boolean };
    email: { provider: string | null; sender: string | null; testSender: boolean };
    security: { adminSignIn: boolean; owners: number; scannerAdminOnly: boolean; spamProtection: boolean };
    keepAlive: boolean;
    publicUrl: string | null;
  };
}

export default function SettingsPanel() {
  const { apiCall, me } = useAdmin();
  const [data, setData] = useState<SettingsResponse | null>(null);
  const [loadError, setLoadError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);

  async function deleteAll() {
    setSaveError("");
    setNotice("");
    const json = await apiCall("/api/admin/attendees?all=1&confirm=DELETE", { method: "DELETE" });
    setNotice(`Deleted ${json.deleted} registration${json.deleted === 1 ? "" : "s"}.`);
  }

  const load = useCallback(
    () =>
      apiCall("/api/admin/settings").then(
        (json) => setData(json as unknown as SettingsResponse),
        (err) => setLoadError(err instanceof Error ? err.message : "Couldn't load settings.")
      ),
    [apiCall]
  );

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once
  }, []);

  async function setRegistrationOpen(open: boolean) {
    if (!data) return;
    const question = open
      ? "Open registration? The public form will accept new registrations."
      : "Close registration? The public form will say registration is closed. Walk-ins in the admin keep working.";
    if (!window.confirm(question)) return;
    setSaving(true);
    setSaveError("");
    setNotice("");
    try {
      const json = await apiCall("/api/admin/settings", {
        method: "POST",
        body: JSON.stringify({ registrationOpen: open }),
      });
      setData({ ...data, settings: json.settings as SettingsResponse["settings"] });
      setNotice(open ? "Registration is open." : "Registration is closed.");
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Couldn't save.");
    } finally {
      setSaving(false);
    }
  }

  const header = <PageHeader eyebrow="Settings" title="Settings" description="How the registration site is running." />;

  if (!data) {
    return (
      <AdminPage width="max-w-4xl">
        {header}
        {loadError ? (
          <ErrorState
            title="Couldn't load settings"
            message={loadError}
            onRetry={() => {
              setLoadError("");
              load();
            }}
          />
        ) : (
          <div className="space-y-6">
            <LoadingLabel>Loading settings</LoadingLabel>
            {[0, 1, 2].map((i) => (
              <Card key={i} className="space-y-3 p-5 sm:p-6">
                <Skeleton className="h-6 w-48" />
                <Skeleton className="h-4 w-full max-w-lg" />
                <Skeleton className="h-4 w-2/3" />
              </Card>
            ))}
          </div>
        )}
      </AdminPage>
    );
  }

  const open = data.settings.registrationOpen;
  const effectiveOpen = open && !data.closedByEnv && data.ticketsOnSale > 0;

  return (
    <AdminPage width="max-w-4xl">
      {header}

      {notice && <Alert tone="success">{notice}</Alert>}
      {saveError && <Alert tone="error">{saveError}</Alert>}

      {/* Registration switch */}
      <Card className="p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-xl space-y-2">
            <h2 id="registration-switch" className="font-display text-xl font-bold text-blue">Public registration</h2>
            <p className="text-sm text-ink-2">
              When closed, the form says registration is closed and accepts no new registrations. Walk-ins added in the
              admin keep working.
            </p>
            <p className="flex items-center gap-2 text-sm font-semibold text-ink">
              <span aria-hidden="true" className={cx("h-2 w-2 shrink-0 rounded-full", effectiveOpen ? "bg-success" : "bg-danger")} />
              {effectiveOpen
                ? "The form is taking registrations"
                : data.closedByEnv
                  ? "Closed by the server setting REGISTRATION_OPEN=false"
                  : data.ticketsOnSale === 0
                    ? "Closed: no ticket is on sale (see Tickets & prices)"
                    : "The form is closed"}
            </p>
          </div>
          <Switch checked={open} disabled={saving || data.closedByEnv} busy={saving} onChange={setRegistrationOpen} labelledBy="registration-switch" />
        </div>
      </Card>

      {/* Event */}
      <Card className="space-y-3 p-5 sm:p-6">
        <h2 className="font-display text-xl font-bold text-blue">Event</h2>
        <dl className="divide-y divide-line">
          <Row label="Name" value={EVENT_INFO.name.en} />
          <Row label="Dates" value={EVENT_INFO.date.en} />
          <Row label="Venue" value={EVENT_INFO.place.en} />
          <Row label="Website" value={<a className={linkClass} href={EVENT_INFO.websiteUrl} target="_blank" rel="noopener noreferrer">{EVENT_INFO.website}</a>} />
          <Row label="Site address" value={data.status.publicUrl ?? <span className="font-semibold text-danger">Not set (PUBLIC_BASE_URL)</span>} />
        </dl>
        <p className="text-sm text-ink-3">
          Event details appear on the form, tickets, flyers, emails and calendar invites. Ask your developer to change them.
        </p>
      </Card>

      {/* Danger zone (super admins only) */}
      {me?.role === "super_admin" && (
      <Card className="space-y-3 border-danger p-5 sm:p-6">
        <h2 className="font-display text-xl font-bold text-danger">Delete all registrations</h2>
        <p className="text-sm text-ink-2">
          For starting again after testing. Deletes every registration and passport file for good; tickets and prices
          stay. Payments aren&apos;t refunded: do that in Stripe. To delete one person, open them on the dashboard instead.
        </p>
        <Button variant="danger" onClick={() => setDeleteOpen(true)}>
          Delete all registrations
        </Button>
      </Card>
      )}

      {/* System status */}
      {deleteOpen && (
        <DeleteDialog title="Delete all registrations?" confirmLabel="Delete all registrations" confirmation="DELETE" onConfirm={deleteAll} onClose={() => setDeleteOpen(false)}>
          <p>Every registration and passport file will be permanently deleted. This cannot be undone.</p>
        </DeleteDialog>
      )}
      <Card className="p-5 sm:p-6">
        <h2 className="font-display text-xl font-bold text-blue">System status</h2>
        <div className="mt-2 divide-y divide-line">
          <StatusGroup title="Payments (Stripe)">
            <Check ok={data.status.payments.configured} label="Stripe connected" />
            <Check
              ok={data.status.payments.mode === "live"}
              warn={data.status.payments.mode === "test"}
              label={data.status.payments.mode === "live" ? "Live mode: real payments" : data.status.payments.mode === "test" ? "Test mode: no real money" : "No mode"}
            />
            <Check ok={data.status.payments.webhook} label="Payment confirmations (webhook)" />
          </StatusGroup>
          <StatusGroup title="Email">
            <Check ok={Boolean(data.status.email.provider)} label={data.status.email.provider ? `Sending via ${data.status.email.provider}` : "No email provider"} />
            <Check
              ok={Boolean(data.status.email.sender) && !data.status.email.testSender}
              warn={data.status.email.testSender}
              label={data.status.email.sender ? `From ${data.status.email.sender}` : "No sender address"}
            />
          </StatusGroup>
          <StatusGroup title="Security">
            <Check
              ok={data.status.security.adminSignIn && data.status.security.owners > 0}
              label={
                !data.status.security.adminSignIn
                  ? "Admin sign-in not set up (NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY)"
                  : data.status.security.owners
                    ? `Admin sign-in with email and password (${data.status.security.owners} owner${data.status.security.owners === 1 ? "" : "s"})`
                    : "Admin sign-in: no owner set (ADMIN_EMAILS)"
              }
            />
            <Check ok={data.status.security.scannerAdminOnly} label="Check-in scanner restricted to signed-in admins" />
            <Check ok={data.status.security.spamProtection} warn={!data.status.security.spamProtection} label="Spam protection (Turnstile)" />
          </StatusGroup>
          <StatusGroup title="Database">
            <Check
              ok={data.status.keepAlive}
              warn={!data.status.keepAlive}
              label={
                data.status.keepAlive
                  ? "Daily keep-alive: the free Supabase plan won't pause it"
                  : "Daily keep-alive runs, but CRON_SECRET isn't set (anyone can trigger it)"
              }
            />
          </StatusGroup>
        </div>
      </Card>
    </AdminPage>
  );
}

function Switch({
  checked,
  disabled,
  busy,
  onChange,
  labelledBy,
}: {
  checked: boolean;
  disabled?: boolean;
  busy?: boolean;
  onChange: (v: boolean) => void;
  labelledBy: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-labelledby={labelledBy}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="group inline-flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-1 disabled:cursor-not-allowed disabled:opacity-50"
    >
      <span
        className={cx(
          "relative h-8 w-14 rounded-full border transition-colors duration-150",
          checked ? "border-gold-press bg-gold group-hover:bg-gold-hover" : "border-line-strong bg-subtle group-hover:bg-line"
        )}
      >
        <span
          className={cx(
            "absolute top-0.5 flex h-6 w-6 items-center justify-center rounded-full border border-line-strong bg-surface transition-[left] duration-150",
            checked ? "left-7" : "left-0.5"
          )}
        >
          {busy && <Spinner className="h-3.5 w-3.5 text-ink-3" />}
        </span>
      </span>
      <span className="w-16 text-left text-sm font-semibold text-ink">{checked ? "Open" : "Closed"}</span>
    </button>
  );
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="grid gap-1 py-2.5 text-sm sm:grid-cols-[9rem_1fr] sm:gap-3">
      <dt className="text-ink-3">{label}</dt>
      <dd className="wrap-break-word text-ink">{value}</dd>
    </div>
  );
}

function StatusGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="grid gap-2 py-4 sm:grid-cols-[11rem_1fr] sm:gap-4">
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
      <ul className="space-y-2">{children}</ul>
    </div>
  );
}

function Check({ ok, warn, label }: { ok: boolean; warn?: boolean; label: string }) {
  const state = ok ? "OK" : warn ? "Check" : "Not working";
  return (
    <li className="flex items-start gap-2.5 text-sm text-ink">
      <span aria-hidden="true" className={cx("mt-1.5 h-2 w-2 shrink-0 rounded-full", ok ? "bg-success" : warn ? "bg-gold" : "bg-danger")} />
      <span className="flex-1">{label}</span>
      <span className={cx("shrink-0 text-xs font-semibold", ok ? "text-success" : warn ? "text-gold-ink" : "text-danger")}>{state}</span>
    </li>
  );
}
