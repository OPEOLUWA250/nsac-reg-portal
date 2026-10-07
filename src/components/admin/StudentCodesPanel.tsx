"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AdminPage,
  Alert,
  Button,
  Card,
  Chip,
  cx,
  describedBy,
  EmptyState,
  ErrorState,
  Field,
  inputClass,
  LoadingLabel,
  linkClass,
  PageHeader,
  Skeleton,
} from "@/components/ui";
import { useAdmin } from "@/components/admin/AdminContext";
import { relativeTime } from "@/lib/admin-format";
import { formatPrice } from "@/lib/tickets";
import { IconRefresh, IconSearch } from "@/components/icons";

// /admin/student-codes: a student emails their student ID to
// info@spaceinafrica.com; an admin checks it and creates a personal code
// here (emailed straight away, or copied into a reply). The code unlocks the
// Student ticket on the form, for that email address only, once.

interface StudentCode {
  id: string;
  code: string;
  email: string;
  name: string;
  expiresAt: string;
  createdAt: string;
  createdBy: string | null;
  cancelledAt: string | null;
  usedAt: string | null;
  emailedAt: string | null;
  language: Lang;
}

interface StudentTicket {
  onSale: boolean;
  amountCents: number;
  currency: string;
}

type Lang = "en" | "fr";

const DEFAULT_DAYS = 30;

function defaultExpiry(): string {
  const d = new Date(Date.now() + DEFAULT_DAYS * 24 * 60 * 60_000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const EMPTY = { email: "", name: "", expires: "", language: "en" as Lang };

function status(c: StudentCode): { label: string; dot: string; muted: boolean } {
  if (c.usedAt) return { label: "Used", dot: "var(--color-blue)", muted: false };
  if (c.cancelledAt) return { label: "Cancelled", dot: "var(--color-line-strong)", muted: true };
  if (new Date(c.expiresAt).getTime() < Date.now()) return { label: "Expired", dot: "var(--color-line-strong)", muted: true };
  return { label: "Not used yet", dot: "var(--color-success)", muted: false };
}

const day = (iso: string, lang: Lang = "en") =>
  new Date(iso).toLocaleDateString(lang === "fr" ? "fr-FR" : "en-GB", { day: "numeric", month: "long", year: "numeric" });

/** The reply to paste into an email, for when the portal doesn't send it. */
function message(c: StudentCode, lang: Lang): string {
  const first = c.name.trim().split(/\s+/)[0] ?? "";
  const url = `${window.location.origin}/?lang=${lang}`;
  return lang === "fr"
    ? `Bonjour${first ? ` ${first}` : ""},\n\nMerci de nous avoir envoyé votre carte d'étudiant. Votre code étudiant personnel est : ${c.code}\n\nSur le formulaire d'inscription (${url}), choisissez le billet Étudiant à la dernière étape et saisissez ce code. Il ne fonctionne qu'avec cette adresse e-mail (${c.email}) et ne peut être utilisé qu'une fois, jusqu'au ${day(c.expiresAt, "fr")}.\n\nL'équipe de la Conférence NewSpace Africa`
    : `Hi${first ? ` ${first}` : ""},\n\nThank you for sending your student ID. Your personal student code is: ${c.code}\n\nOn the registration form (${url}), choose the Student ticket on the last step and enter this code. It only works with this email address (${c.email}) and can be used once, until ${day(c.expiresAt)}.\n\nThe NewSpace Africa Conference team`;
}

export default function StudentCodesPanel() {
  const { apiCall } = useAdmin();
  const [codes, setCodes] = useState<StudentCode[] | null>(null);
  const [ticket, setTicket] = useState<StudentTicket | null | undefined>(undefined);
  const [loadError, setLoadError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [draft, setDraft] = useState({ ...EMPTY, expires: defaultExpiry() });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<"send" | "create" | null>(null);
  const [saveError, setSaveError] = useState("");
  const [created, setCreated] = useState<{ code: StudentCode; language: Lang; emailError: string | null; sent: boolean } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const load = useCallback(() => {
    setRefreshing(true);
    return apiCall("/api/admin/student-codes")
      .then(
        (json) => {
          setCodes(json.codes as StudentCode[]);
          setTicket((json.studentTicket as StudentTicket | null) ?? null);
          setLoadError("");
        },
        (err) => setLoadError(err instanceof Error ? err.message : "Couldn't load the student codes.")
      )
      .finally(() => setRefreshing(false));
  }, [apiCall]);

  useEffect(() => {
    const first = setTimeout(load, 0);
    return () => clearTimeout(first);
  }, [load]);

  const set = <K extends keyof typeof EMPTY>(key: K, value: (typeof EMPTY)[K]) => {
    setDraft((d) => ({ ...d, [key]: value }));
    setFieldErrors((e) => ({ ...e, [key === "expires" ? "expiresAt" : key]: "" }));
  };

  async function create(send: boolean) {
    setSaving(send ? "send" : "create");
    setSaveError("");
    setFieldErrors({});
    setCreated(null);
    try {
      // Valid until the end of the chosen day, in this computer's time zone.
      const expiresAt = draft.expires ? new Date(`${draft.expires}T23:59:59`).toISOString() : "";
      const json = await apiCall("/api/admin/student-codes", {
        method: "POST",
        body: JSON.stringify({ email: draft.email, name: draft.name, expiresAt, language: draft.language, send }),
      });
      const code = json.code as StudentCode;
      setCodes((list) => [code, ...(list ?? [])]);
      setCreated({ code, language: draft.language, emailError: (json.emailError as string | null) ?? null, sent: send });
      setDraft({ ...EMPTY, language: draft.language, expires: defaultExpiry() });
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Couldn't create the code.");
      const fields = (err as { body?: { fields?: Record<string, string> } }).body?.fields;
      if (fields) setFieldErrors(fields);
    } finally {
      setSaving(null);
    }
  }

  async function patch(c: StudentCode, action: "cancel" | "email") {
    if (action === "cancel" && !window.confirm(`Cancel ${c.code} for ${c.email}? It will stop working straight away.`)) return;
    setBusyId(c.id);
    try {
      const json = await apiCall("/api/admin/student-codes", { method: "PATCH", body: JSON.stringify({ id: c.id, action }) });
      const updated = json.code as StudentCode;
      setCodes((list) => (list ?? []).map((x) => (x.id === updated.id ? updated : x)));
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Couldn't update the code.");
    } finally {
      setBusyId(null);
    }
  }

  async function copy(key: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied((k) => (k === key ? null : k)), 2000);
    } catch {
      window.prompt("Copy this:", text);
    }
  }

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!codes || !q) return codes;
    return codes.filter((c) => [c.code, c.email, c.name].some((v) => v.toLowerCase().includes(q)));
  }, [codes, query]);

  const unused = (codes ?? []).filter((c) => status(c).label === "Not used yet").length;
  const used = (codes ?? []).filter((c) => c.usedAt).length;
  const err = (k: string) => fieldErrors[k] || undefined;
  const aria = (id: string, e?: string, hint?: boolean) => ({ "aria-invalid": !!e, "aria-describedby": describedBy(id, { hint, error: e }) });

  return (
    <AdminPage>
      <PageHeader
        eyebrow="Registration form"
        title="Student codes"
        description="When a student emails their student ID to info@spaceinafrica.com, check it, then create their code here. The code unlocks the Student ticket for that email address only, and can be used once."
        actions={
          <Button variant="outline" onClick={() => load()} disabled={refreshing} aria-label="Refresh student codes" title="Refresh" className="px-3">
            <IconRefresh className={cx("h-4 w-4", refreshing && "animate-spin")} />
          </Button>
        }
      />

      {ticket === null && (
        <Alert tone="error" title="There's no Student ticket yet">
          Codes have nothing to unlock until it exists. Add it in{" "}
          <Link href="/admin/tickets" className={linkClass}>Tickets &amp; prices</Link> with the ticket ID <span className="font-mono">student</span>.
        </Alert>
      )}
      {ticket && !ticket.onSale && (
        <Alert tone="info" title="The Student ticket isn't on sale">
          Students can&apos;t use their codes until it is. Switch it on in{" "}
          <Link href="/admin/tickets" className={linkClass}>Tickets &amp; prices</Link>.
        </Alert>
      )}

      <Card className="p-5 sm:p-6">
        <h2 className="mb-1 font-display text-xl font-bold text-blue">New student code</h2>
        <p className="mb-5 text-sm text-ink-3">
          {ticket ? `Unlocks the Student ticket (${formatPrice(ticket.amountCents, ticket.currency)}). ` : ""}
          Registered as Delegate. Promo codes don&apos;t apply.
        </p>
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            create(true);
          }}
          className="grid grid-cols-1 gap-5 sm:grid-cols-2"
        >
          <Field id="sc-email" label="Student's email" required error={err("email")} hint="The address they sent their student ID from. The code only works with it.">
            <input id="sc-email" type="email" inputMode="email" autoCapitalize="none" spellCheck={false} className={inputClass(!!err("email"))} value={draft.email} onChange={(e) => set("email", e.target.value)} maxLength={254} {...aria("sc-email", err("email"), true)} />
          </Field>
          <Field id="sc-name" label="Name" optionalLabel="optional" error={err("name")} hint="Used to greet them in the email.">
            <input id="sc-name" className={inputClass(!!err("name"))} value={draft.name} onChange={(e) => set("name", e.target.value)} maxLength={120} {...aria("sc-name", err("name"), true)} />
          </Field>
          <Field id="sc-expires" label="Valid until" required error={err("expiresAt")} hint={`${DEFAULT_DAYS} days by default. Works until the end of that day.`}>
            <input id="sc-expires" type="date" className={inputClass(!!err("expiresAt"))} value={draft.expires} onChange={(e) => set("expires", e.target.value)} {...aria("sc-expires", err("expiresAt"), true)} />
          </Field>
          <Field id="sc-language" as="div" label="Email language">
            <div className="flex gap-2" role="group" aria-label="Email language">
              {(["en", "fr"] as const).map((l) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => set("language", l)}
                  aria-pressed={draft.language === l}
                  className={cx(
                    "min-h-11 rounded-md border px-4 text-sm transition-colors duration-150",
                    draft.language === l ? "border-blue font-semibold text-blue ring-1 ring-blue" : "border-line-strong text-ink-2 hover:bg-subtle"
                  )}
                >
                  {l === "en" ? "English" : "French"}
                </button>
              ))}
            </div>
          </Field>
          {saveError && (
            <div className="sm:col-span-2">
              <Alert tone="error">{saveError}</Alert>
            </div>
          )}
          <div className="flex flex-wrap gap-3 sm:col-span-2">
            <Button type="submit" variant="primary" loading={saving === "send"} disabled={saving !== null}>
              {saving === "send" ? "Creating" : "Create and email it"}
            </Button>
            <Button variant="outline" onClick={() => create(false)} loading={saving === "create"} disabled={saving !== null}>
              Create only
            </Button>
          </div>
        </form>
      </Card>

      {created && (
        <Alert
          tone={created.emailError ? "error" : "success"}
          title={`Code ${created.code.code} created${created.sent && !created.emailError ? ` and emailed to ${created.code.email}` : ""}`}
          action={
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => copy(`code-${created.code.id}`, created.code.code)}>
                {copied === `code-${created.code.id}` ? "Copied" : "Copy code"}
              </Button>
              <Button size="sm" variant="outline" onClick={() => copy(`msg-${created.code.id}`, message(created.code, created.language))}>
                {copied === `msg-${created.code.id}` ? "Copied" : "Copy message"}
              </Button>
            </div>
          }
        >
          {created.emailError ?? (created.sent ? "They can register with it now." : "Copy the message and send it as your reply to the student.")}
        </Alert>
      )}

      {codes === null ? (
        loadError ? (
          <ErrorState title="Couldn't load student codes" message={loadError} onRetry={() => { setLoadError(""); load(); }} />
        ) : (
          <Card>
            <LoadingLabel>Loading student codes</LoadingLabel>
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex flex-wrap items-center gap-4 border-t border-line p-4 first:border-t-0">
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-56 max-w-full" />
                </div>
                <Skeleton className="h-9 w-40 rounded-md" />
              </div>
            ))}
          </Card>
        )
      ) : codes.length === 0 ? (
        <Card>
          <EmptyState title="No student codes yet" body="Create one when a student sends their student ID to info@spaceinafrica.com." />
        </Card>
      ) : (
        <Card>
          <div className="flex flex-wrap items-center gap-3 border-b border-line p-4 sm:px-5">
            <p className="text-sm text-ink-2">
              {codes.length} {codes.length === 1 ? "code" : "codes"} · {used} used · {unused} not used yet
            </p>
            <label className="relative ml-auto w-full sm:w-72">
              <span className="sr-only">Search student codes</span>
              <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" />
              <input className={inputClass(false, "pl-9")} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search email, name or code" />
            </label>
          </div>
          {shown && shown.length === 0 ? (
            <p className="p-5 text-sm text-ink-3">No code matches “{query}”.</p>
          ) : (
            <ul className="divide-y divide-line">
              {(shown ?? []).map((c) => {
                const st = status(c);
                const open = st.label === "Not used yet";
                return (
                  <li key={c.id} className="flex flex-wrap items-start gap-x-6 gap-y-3 p-4 sm:p-5">
                    <div className="min-w-0 flex-1 basis-64 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-base font-semibold text-ink">{c.code}</span>
                        <Chip dot={st.dot} className={st.muted ? "text-ink-3" : ""}>{st.label}</Chip>
                      </div>
                      <p className="text-sm text-ink-2 [overflow-wrap:anywhere]">
                        {c.name ? `${c.name} · ` : ""}
                        {c.email}
                      </p>
                      <p className="text-sm text-ink-3">
                        {c.usedAt
                          ? `Used ${relativeTime(c.usedAt)}`
                          : `Valid until ${day(c.expiresAt)}`}
                        {" · "}
                        {c.emailedAt ? `emailed ${relativeTime(c.emailedAt)}` : "not emailed"}
                        {" · "}
                        created {relativeTime(c.createdAt)}
                        {c.createdBy ? ` by ${c.createdBy}` : ""}
                      </p>
                    </div>
                    {open && (
                      <div className="flex w-full flex-wrap gap-2 lg:w-auto">
                        <Button size="sm" variant="outline" onClick={() => copy(`msg-${c.id}`, message(c, c.language))}>
                          {copied === `msg-${c.id}` ? "Copied" : "Copy message"}
                        </Button>
                        <Button size="sm" variant="outline" loading={busyId === c.id} onClick={() => patch(c, "email")}>
                          {c.emailedAt ? "Email again" : "Email it"}
                        </Button>
                        <Button size="sm" variant="danger" disabled={busyId === c.id} onClick={() => patch(c, "cancel")}>
                          Cancel code
                        </Button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      )}
    </AdminPage>
  );
}
