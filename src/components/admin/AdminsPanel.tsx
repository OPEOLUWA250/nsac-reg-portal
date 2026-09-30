"use client";

import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { AdminPage, Alert, Button, Card, Chip, EmptyState, ErrorState, Field, inputClass, LoadingLabel, PageHeader, Skeleton } from "@/components/ui";
import { useAdmin } from "@/components/admin/AdminContext";
import PasswordInput from "@/components/admin/PasswordInput";
import { ADMIN_PASSWORD_MIN } from "@/lib/admin-password";
import { relativeTime } from "@/lib/admin-format";

// /admin/admins (super admins only): who can sign in to the admin, plus how
// the check-in scanner is protected. Owners come from the ADMIN_EMAILS
// server setting and can't be changed here.

type Role = "admin" | "super_admin";

interface Account {
  hasAccount: boolean;
  lastSignInAt: string | null;
  mustChangePassword: boolean;
}
interface Owner extends Account {
  email: string;
}
interface AdminRow extends Account {
  id: string;
  email: string;
  role: Role;
  created_at: string;
}
interface AdminsResponse {
  me: string;
  owners: Owner[];
  admins: AdminRow[];
  missingTable?: boolean;
  error?: string;
}

const ROLE_NAME: Record<Role, string> = { admin: "Admin", super_admin: "Super admin" };
const ROLE_HELP = "Admins can do everything except manage admins and delete all registrations. Super admins can do both.";

// Easy to read aloud or type: no 0/O, 1/l/I.
const PASSWORD_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
function temporaryPassword(length = 16): string {
  const bytes = crypto.getRandomValues(new Uint32Array(length));
  return Array.from(bytes, (n) => PASSWORD_ALPHABET[n % PASSWORD_ALPHABET.length]).join("");
}

export default function AdminsPanel() {
  const { apiCall, me } = useAdmin();
  const [data, setData] = useState<AdminsResponse | null>(null);
  const [loadError, setLoadError] = useState("");
  const [notice, setNotice] = useState<ReactNode>(null);
  const [actionError, setActionError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const isSuper = me?.role === "super_admin";

  const load = useCallback(async () => {
    try {
      const admins = await apiCall("/api/admin/admins");
      setData(admins as unknown as AdminsResponse);
      setLoadError("");
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Couldn't load the admins.");
    }
  }, [apiCall]);

  useEffect(() => {
    if (!isSuper) return;
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [isSuper, load]);

  async function run(id: string, action: () => Promise<void>) {
    setBusyId(id);
    setActionError("");
    setNotice(null);
    try {
      await action();
      await load();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Something went wrong. Try again.");
    } finally {
      setBusyId(null);
    }
  }

  function changeRole(admin: AdminRow, role: Role) {
    if (role === admin.role) return;
    if (!window.confirm(`Make ${admin.email} ${ROLE_NAME[role] === "Admin" ? "an Admin" : "a Super admin"}?`)) return;
    run(admin.id, async () => {
      await apiCall("/api/admin/admins", { method: "PATCH", body: JSON.stringify({ id: admin.id, role }) });
      setNotice(`${admin.email} is now ${role === "admin" ? "an Admin" : "a Super admin"}.`);
    });
  }

  function resetPassword(admin: AdminRow) {
    if (!window.confirm(`Give ${admin.email} a new temporary password? Their current password stops working.`)) return;
    const password = temporaryPassword();
    run(admin.id, async () => {
      await apiCall("/api/admin/admins", { method: "PATCH", body: JSON.stringify({ id: admin.id, password }) });
      setNotice(<TempPasswordNotice email={admin.email} password={password} />);
    });
  }

  function remove(admin: AdminRow) {
    if (!window.confirm(`Remove ${admin.email}? They won't be able to sign in any more.`)) return;
    run(admin.id, async () => {
      await apiCall(`/api/admin/admins?id=${admin.id}`, { method: "DELETE" });
      setNotice(`${admin.email} was removed.`);
    });
  }

  const header = <PageHeader eyebrow="Admins" title="Admins" description="Who can sign in to the admin, and how the check-in scanner is protected." />;

  if (me && !isSuper) {
    return (
      <AdminPage width="max-w-4xl">
        {header}
        <EmptyState title="Only super admins can manage admins" body="Ask a super admin if someone needs access." />
      </AdminPage>
    );
  }

  if (!data) {
    return (
      <AdminPage width="max-w-4xl">
        {header}
        {loadError ? (
          <ErrorState title="Couldn't load the admins" message={loadError} onRetry={load} />
        ) : (
          <Card className="space-y-4 p-5 sm:p-6">
            <LoadingLabel>Loading admins</LoadingLabel>
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </Card>
        )}
      </AdminPage>
    );
  }

  return (
    <AdminPage width="max-w-4xl">
      {header}

      {notice && <Alert tone="success">{notice}</Alert>}
      {actionError && <Alert tone="error">{actionError}</Alert>}
      {data.missingTable && (
        <Alert tone="error" title="One setup step left">
          {data.error} Owners can sign in already; adding other admins needs it.
        </Alert>
      )}

      <Card className="p-5 sm:p-6">
        <h2 className="font-display text-xl font-bold text-blue">People with access</h2>
        <p className="mt-1 text-sm text-ink-2">{ROLE_HELP}</p>
        <ul className="mt-4 divide-y divide-line border-y border-line">
          {data.owners.map((owner) => (
            <li key={owner.email} className="flex flex-wrap items-start justify-between gap-3 py-4">
              <PersonInfo email={owner.email} you={owner.email === data.me} account={owner} />
              <div className="text-right text-sm">
                <p className="font-semibold text-ink">Owner · Super admin</p>
                <p className="text-xs text-ink-3">Set in ADMIN_EMAILS on the server</p>
              </div>
            </li>
          ))}
          {data.admins.map((admin) => {
            const you = admin.email === data.me;
            const busy = busyId === admin.id;
            return (
              <li key={admin.id} className="flex flex-wrap items-start justify-between gap-3 py-4">
                <PersonInfo email={admin.email} you={you} account={admin} />
                <div className="flex flex-wrap items-center gap-2">
                  <label className="sr-only" htmlFor={`role-${admin.id}`}>
                    Role for {admin.email}
                  </label>
                  <select
                    id={`role-${admin.id}`}
                    className={inputClass(false, "min-h-11 w-auto py-1.5 text-sm")}
                    value={admin.role}
                    disabled={you || busy}
                    onChange={(e) => changeRole(admin, e.target.value as Role)}
                  >
                    <option value="admin">Admin</option>
                    <option value="super_admin">Super admin</option>
                  </select>
                  {!you && (
                    <>
                      <Button variant="outline" size="sm" disabled={busy} onClick={() => resetPassword(admin)}>
                        New password
                      </Button>
                      <Button variant="ghost" size="sm" disabled={busy} onClick={() => remove(admin)} className="text-danger">
                        Remove
                      </Button>
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
        {!data.admins.length && !data.missingTable && (
          <p className="mt-4 text-sm text-ink-3">No other admins yet. Add one below.</p>
        )}
      </Card>

      {!data.missingTable && (
        <AddAdmin
          onAdded={async (email, password) => {
            await load();
            setActionError("");
            setNotice(<TempPasswordNotice email={email} password={password} added />);
          }}
        />
      )}

      <Card className="p-5 sm:p-6">
        <h2 className="font-display text-xl font-bold text-blue">Check-in scanner</h2>
        <p className="mt-2 flex items-center gap-2 text-sm font-semibold">
          <span aria-hidden="true" className="h-2 w-2 rounded-full bg-success" />
          <span className="text-success">Admin sign-in required</span>
        </p>
        <p className="mt-1 text-sm text-ink-2">
          Only signed-in admins and super admins can use the scanner. Add an admin account above for anyone who needs to check in attendees.
        </p>
      </Card>
    </AdminPage>
  );
}

function PersonInfo({ email, you, account }: { email: string; you: boolean; account: Account }) {
  return (
    <div className="min-w-0 flex-1 space-y-1">
      <p className="wrap-break-word text-sm font-semibold text-ink">
        {email}
        {you && <span className="ml-1.5 font-normal text-ink-3">(you)</span>}
      </p>
      <div className="flex flex-wrap items-center gap-2 text-xs text-ink-3">
        {!account.hasAccount ? (
          <Chip dot="bg-danger">No sign-in account yet</Chip>
        ) : (
          <span>{account.lastSignInAt ? `Last signed in ${relativeTime(account.lastSignInAt)}` : "Hasn't signed in yet"}</span>
        )}
        {account.mustChangePassword && <Chip dot="bg-gold">Temporary password</Chip>}
      </div>
    </div>
  );
}

function TempPasswordNotice({ email, password, added = false }: { email: string; password: string; added?: boolean }) {
  return (
    <div className="space-y-1">
      <p>
        {added ? `${email} was added.` : `${email} has a new temporary password.`} Send it to them privately (not in the
        same message as the address), then they set their own when they sign in:
      </p>
      <p className="font-mono text-base font-semibold text-ink [overflow-wrap:anywhere]">{password}</p>
      <p className="text-ink-3">It won&apos;t be shown again.</p>
    </div>
  );
}

function AddAdmin({ onAdded }: { onAdded: (email: string, password: string) => Promise<void> }) {
  const { apiCall } = useAdmin();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("admin");
  const [password, setPassword] = useState(temporaryPassword);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    setError("");
    try {
      await apiCall("/api/admin/admins", { method: "POST", body: JSON.stringify({ email, role, password }) });
      const added = { email: email.trim().toLowerCase(), password };
      setEmail("");
      setRole("admin");
      setPassword(temporaryPassword());
      await onAdded(added.email, added.password);
    } catch (err) {
      const body = (err as { body?: { fields?: Record<string, string> } }).body;
      if (body?.fields) setErrors(body.fields);
      else setError(err instanceof Error ? err.message : "Couldn't add the admin.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-5 sm:p-6">
      <h2 className="font-display text-xl font-bold text-blue">Add an admin</h2>
      <p className="mt-1 text-sm text-ink-2">
        They get a temporary password to sign in with at /admin/login, and must choose their own straight away.
      </p>
      {error && <Alert tone="error" className="mt-4">{error}</Alert>}
      <form onSubmit={submit} noValidate className="mt-5 grid gap-5 sm:grid-cols-2">
        <Field id="new-admin-email" label="Email" required error={errors.email}>
          <input
            id="new-admin-email"
            type="email"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            className={inputClass(Boolean(errors.email))}
            aria-invalid={Boolean(errors.email) || undefined}
            aria-describedby={errors.email ? "new-admin-email-error" : undefined}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <Field id="new-admin-role" label="Role" error={errors.role}>
          <select id="new-admin-role" className={inputClass(Boolean(errors.role))} value={role} onChange={(e) => setRole(e.target.value as Role)}>
            <option value="admin">Admin</option>
            <option value="super_admin">Super admin</option>
          </select>
        </Field>
        <div className="sm:col-span-2">
          <Field
            id="new-admin-password"
            label="Temporary password"
            hint={`At least ${ADMIN_PASSWORD_MIN} characters. One is made for you; you can change it.`}
            error={errors.password}
          >
            <div className="flex gap-2">
              <div className="min-w-0 flex-1">
                <PasswordInput
                  id="new-admin-password"
                  autoComplete="new-password"
                  invalid={Boolean(errors.password)}
                  aria-describedby={["new-admin-password-hint", errors.password ? "new-admin-password-error" : ""].filter(Boolean).join(" ")}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <Button variant="outline" onClick={() => setPassword(temporaryPassword())} className="min-h-12 shrink-0">
                New one
              </Button>
            </div>
          </Field>
        </div>
        <div className="sm:col-span-2">
          <Button type="submit" variant="primary" loading={busy}>
            Add admin
          </Button>
        </div>
      </form>
    </Card>
  );
}
