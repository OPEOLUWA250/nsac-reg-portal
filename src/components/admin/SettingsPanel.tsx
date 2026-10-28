"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { AdminPage, Alert, Button, Card, cx, describedBy, ErrorState, Field, inputClass, linkClass, LoadingLabel, PageHeader, Skeleton, Spinner } from "@/components/ui";
import DeleteDialog from "@/components/admin/DeleteDialog";
import { useAdmin } from "@/components/admin/AdminContext";
import { usePopup } from "@/components/Popup";
import { EVENT_INFO } from "@/lib/event-info";
import { MAX_ALERT_EMAILS, mergeAlertRecipients, parseAlertEmailList } from "@/lib/alert-emails";
import { cleanAutoReminders, type AutoReminders as AutoRemindersSetting } from "@/lib/auto-reminders";
import { AUTO_REMINDER_DAYS } from "@/lib/payment-reminder";
import { usePopup } from "@/components/Popup";

// /admin/settings: open/close registration, who gets the registration
// alerts, plus a read-only view of how payments, email and security are set up.

interface SettingsResponse {
  settings: { registrationOpen: boolean; alertEmails: string[]; autoReminders: AutoRemindersSetting };
  /** From the ADMIN_NOTIFY_EMAILS server setting: always emailed, not editable here. */
  alertEmailsFromEnv: string[];
  closedByEnv: boolean;
  ticketsOnSale: number;
  status: {
    payments: { configured: boolean; mode: "live" | "test" | null; webhook: boolean };
    email: { provider: string | null; sender: string | null; testSender: boolean };
    security: { adminSignIn: boolean; owners: number; scannerAdminOnly: boolean; spamProtection: boolean };
    keepAlive: boolean;
    remindersReady: boolean;
    publicUrl: string | null;
  };
}

export default function SettingsPanel() {
  const { apiCall, me } = useAdmin();
  const { confirm, popup } = usePopup();
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
    const ok = await confirm(
      open
        ? { title: "Open registration?", body: "The public form will accept new registrations.", confirmLabel: "Open registration" }
        : {
            title: "Close registration?",
            body: "The public form will say registration is closed. Walk-ins in the admin keep working.",
            confirmLabel: "Close registration",
            tone: "danger",
          }
    );
    if (!ok) return;
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
      {popup}

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

      <AlertRecipients
        saved={data.settings.alertEmails}
        fromEnv={data.alertEmailsFromEnv}
        canEdit={me?.role === "super_admin"}
        onSave={async (alertEmails) => {
          const json = await apiCall("/api/admin/settings", { method: "POST", body: JSON.stringify({ alertEmails }) });
          setData((d) => (d ? { ...d, settings: json.settings as SettingsResponse["settings"] } : d));
          return (json.settings as SettingsResponse["settings"]).alertEmails;
        }}
      />

      <AutoReminders
        saved={data.settings.autoReminders}
        ready={data.status.remindersReady}
        canEdit={me?.role === "super_admin"}
        onSave={async (autoReminders) => {
          const json = await apiCall("/api/admin/settings", { method: "POST", body: JSON.stringify({ autoReminders }) });
          setData((d) => (d ? { ...d, settings: json.settings as SettingsResponse["settings"] } : d));
          return (json.settings as SettingsResponse["settings"]).autoReminders;
        }}
      />

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

// Who gets the "new registration" email. They don't need an admin account.
function AlertRecipients({
  saved,
  fromEnv,
  canEdit,
  onSave,
}: {
  saved: string[];
  fromEnv: string[];
  canEdit: boolean;
  /** Saves the list and returns it as stored. Throws with a message on failure. */
  onSave: (emails: string[]) => Promise<string[]>;
}) {
  const [text, setText] = useState(saved.join("\n"));
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);
  const changed = text.trim() !== saved.join("\n");
  const total = mergeAlertRecipients(saved, fromEnv).length;

  async function save() {
    setStatus("");
    const { emails, invalid } = parseAlertEmailList(text);
    if (invalid.length > 0) {
      setError(`${invalid.length === 1 ? "This isn't an email address" : "These aren't email addresses"}: ${invalid.join(", ")}`);
      return;
    }
    if (emails.length > MAX_ALERT_EMAILS) {
      setError(`Up to ${MAX_ALERT_EMAILS} addresses. Remove ${emails.length - MAX_ALERT_EMAILS}.`);
      return;
    }
    setError("");
    setSaving(true);
    try {
      const stored = await onSave(emails);
      setText(stored.join("\n"));
      setStatus(stored.length ? `Saved. ${stored.length} address${stored.length === 1 ? "" : "es"} on the list.` : "Saved. The list is empty.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save the list.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="space-y-4 p-5 sm:p-6">
      <div className="max-w-xl space-y-2">
        <h2 className="font-display text-xl font-bold text-blue">Registration alerts</h2>
        <p className="text-sm text-ink-2">
          Everyone listed gets an email when a registration is confirmed: after payment, or straight away for a free
          ticket. They don&apos;t need an admin account. The email includes the registrant&apos;s contact details and
          their passport, so list only the company staff who handle registrations.
        </p>
        <p className="flex items-center gap-2 text-sm font-semibold text-ink">
          <span aria-hidden="true" className={cx("h-2 w-2 shrink-0 rounded-full", total ? "bg-success" : "bg-line-strong")} />
          {total ? `${total} ${total === 1 ? "person gets" : "people get"} these emails` : "Nobody gets these emails yet"}
        </p>
      </div>

      {canEdit ? (
        <div className="max-w-xl space-y-3">
          <Field
            id="alert-emails"
            label="Email addresses"
            hint={`One per line, up to ${MAX_ALERT_EMAILS}.`}
            error={error || undefined}
          >
            <textarea
              id="alert-emails"
              rows={4}
              spellCheck={false}
              autoCapitalize="none"
              autoComplete="off"
              className={inputClass(Boolean(error), "min-h-32")}
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                setError("");
                setStatus("");
              }}
              aria-invalid={Boolean(error)}
              aria-describedby={describedBy("alert-emails", { hint: true, error })}
            />
          </Field>
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={save} disabled={!changed} loading={saving}>
              Save list
            </Button>
            <p role="status" className="text-sm font-semibold text-success">
              {status}
            </p>
          </div>
        </div>
      ) : (
        <div className="max-w-xl space-y-2">
          {saved.length ? (
            <ul className="divide-y divide-line rounded-lg border border-line">
              {saved.map((email) => (
                <li key={email} className="wrap-break-word px-4 py-2.5 text-sm text-ink">{email}</li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-ink-3">No addresses on the list.</p>
          )}
          <p className="text-sm text-ink-3">Only super admins can change this list.</p>
        </div>
      )}

      {fromEnv.length > 0 && (
        <p className="max-w-xl text-sm text-ink-3">
          Also always emailed, from the server setting ADMIN_NOTIFY_EMAILS: {fromEnv.join(", ")}.
        </p>
      )}
    </Card>
  );
}

// One automatic payment reminder for people who registered but didn't pay.
// Super admins switch it on; everyone else sees whether it's on.
function AutoReminders({
  saved,
  ready,
  canEdit,
  onSave,
}: {
  saved: AutoRemindersSetting;
  /** CRON_SECRET and PUBLIC_BASE_URL are set, so the daily run can send. */
  ready: boolean;
  canEdit: boolean;
  /** Saves the setting and returns it as stored. Throws with a message on failure. */
  onSave: (value: AutoRemindersSetting) => Promise<AutoRemindersSetting>;
}) {
  const { confirm, popup } = usePopup();
  const [enabled, setEnabled] = useState(saved.enabled);
  const [days, setDays] = useState(String(saved.afterDays));
  const [replyTo, setReplyTo] = useState(saved.replyTo ?? "");
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);
  const draft = { enabled, afterDays: Number(days), replyTo: replyTo.trim() || null };
  const changed = JSON.stringify(draft) !== JSON.stringify(saved);
  const dayWord = (n: number) => `${n} ${n === 1 ? "day" : "days"}`;

  async function save() {
    setStatus("");
    const value = cleanAutoReminders(draft);
    if (!value) {
      setError(
        !Number.isInteger(draft.afterDays) || draft.afterDays < AUTO_REMINDER_DAYS.min || draft.afterDays > AUTO_REMINDER_DAYS.max
          ? `Choose between ${AUTO_REMINDER_DAYS.min} and ${AUTO_REMINDER_DAYS.max} days.`
          : "The reply address doesn't look like an email address."
      );
      return;
    }
    if (value.enabled && !saved.enabled) {
      const ok = await confirm({
        title: "Switch on automatic reminders?",
        body: `From the next daily run, everyone who registered more than ${dayWord(value.afterDays)} ago without paying, and hasn't been reminded yet, gets one reminder.`,
        confirmLabel: "Switch on",
      });
      if (!ok) return;
    }
    setError("");
    setSaving(true);
    try {
      const stored = await onSave(value);
      setEnabled(stored.enabled);
      setDays(String(stored.afterDays));
      setReplyTo(stored.replyTo ?? "");
      setStatus(stored.enabled ? "Saved. Automatic reminders are on." : "Saved. Automatic reminders are off.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="space-y-4 p-5 sm:p-6">
      {popup}
      <div className="max-w-xl space-y-2">
        <h2 className="font-display text-xl font-bold text-blue">Automatic payment reminders</h2>
        <p className="text-sm text-ink-2">
          Once a day, people who filled in the form but haven&apos;t paid get one reminder, in their language, with a button
          to pay at today&apos;s price. Anyone already reminded, by an admin or automatically, is left alone, and nothing is
          sent while registration is closed. To remind people yourself, use the dashboard.
        </p>
        <p className="flex items-center gap-2 text-sm font-semibold text-ink">
          <span aria-hidden="true" className={cx("h-2 w-2 shrink-0 rounded-full", saved.enabled ? "bg-success" : "bg-line-strong")} />
          {saved.enabled ? `On: one reminder ${dayWord(saved.afterDays)} after registering` : "Off"}
        </p>
      </div>

      {saved.enabled && !ready && (
        <Alert tone="error">
          Nothing is sent yet: the server needs CRON_SECRET and PUBLIC_BASE_URL set (ask your developer).
        </Alert>
      )}

      {canEdit ? (
        <div className="max-w-xl space-y-4">
          <label className="flex min-h-11 items-center gap-3 text-sm font-semibold text-ink">
            <input type="checkbox" className="h-5 w-5 shrink-0" checked={enabled} disabled={saving} onChange={(e) => setEnabled(e.target.checked)} />
            Send automatic reminders
          </label>
          <div className="grid gap-4 sm:grid-cols-[10rem_1fr]">
            <Field id="reminder-days" label="Days after registering" hint={`${AUTO_REMINDER_DAYS.min} to ${AUTO_REMINDER_DAYS.max}.`}>
              <input
                id="reminder-days"
                type="number"
                inputMode="numeric"
                min={AUTO_REMINDER_DAYS.min}
                max={AUTO_REMINDER_DAYS.max}
                className={inputClass()}
                value={days}
                disabled={saving}
                onChange={(e) => setDays(e.target.value)}
                aria-describedby={describedBy("reminder-days", { hint: true })}
              />
            </Field>
            <Field id="reminder-reply" label="Replies go to" optionalLabel="optional" hint="Without it, replies go to the sending address.">
              <input
                id="reminder-reply"
                type="email"
                inputMode="email"
                className={inputClass()}
                value={replyTo}
                disabled={saving}
                onChange={(e) => setReplyTo(e.target.value)}
                aria-describedby={describedBy("reminder-reply", { hint: true })}
              />
            </Field>
          </div>
          {error && <Alert tone="error">{error}</Alert>}
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={save} disabled={!changed} loading={saving}>
              Save
            </Button>
            <p role="status" className="text-sm font-semibold text-success">
              {status}
            </p>
          </div>
        </div>
      ) : (
        <p className="text-sm text-ink-3">Only super admins can change this.</p>
      )}
    </Card>
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
