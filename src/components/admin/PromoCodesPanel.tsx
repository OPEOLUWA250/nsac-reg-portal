"use client";

import { useCallback, useEffect, useState } from "react";
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
  PageHeader,
  Skeleton,
} from "@/components/ui";
import { useAdmin } from "@/components/admin/AdminContext";
import { STUDENT_TICKET_ID, type Ticket } from "@/lib/tickets";
import { relativeTime } from "@/lib/admin-format";
import { IconRefresh } from "@/components/icons";

// /admin/promo-codes: create and manage promo codes (e.g. complimentary
// passes for sponsors). The codes live in Stripe; people type them on the
// registration form's ticket step.

interface PromoCode {
  id: string;
  code: string;
  label: string;
  percentOff: number;
  maxUses: number | null;
  used: number;
  /** From our own registrations: completed (paid or free) and started, not finished. */
  registrations?: { completed: number; started: number };
  expiresAt: string | null;
  active: boolean;
  ticketIds: string[] | null;
  createdAt: string;
}

interface Draft {
  label: string;
  code: string;
  percentOff: string;
  maxUses: string;
  expiresAt: string;
  ticketIds: string[];
}

const POLL_MS = 10_000;

// New codes work with the Standard ticket unless the admin ticks others.
const DEFAULT_TICKET = "standard";

const EMPTY: Draft = { label: "", code: "", percentOff: "100", maxUses: "", expiresAt: "", ticketIds: [DEFAULT_TICKET] };

function status(p: PromoCode): { label: string; dot: string } {
  if (!p.active) return { label: "Switched off", dot: "var(--color-line-strong)" };
  if (p.expiresAt && new Date(p.expiresAt).getTime() < Date.now()) return { label: "Expired", dot: "var(--color-line-strong)" };
  if (p.maxUses !== null && p.used >= p.maxUses) return { label: "Used up", dot: "var(--color-gold)" };
  return { label: "Active", dot: "var(--color-success)" };
}

const dateTime = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

// ISO → the value a datetime-local input shows, in this browser's time zone.
function localInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const discountText = (p: PromoCode) => (p.percentOff === 100 ? "a free pass" : `${p.percentOff}% off`);

export default function PromoCodesPanel() {
  const { apiCall } = useAdmin();
  const [codes, setCodes] = useState<PromoCode[] | null>(null);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loadError, setLoadError] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  /** The code being edited (by code, which stays the same when Stripe's id changes). */
  const [editing, setEditing] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ promo: PromoCode; edited: boolean } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const [checkedAt, setCheckedAt] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [, setTick] = useState(0); // re-renders "updated … ago"

  const loadCodes = useCallback(() => {
    setRefreshing(true);
    return apiCall("/api/admin/promo-codes")
      .then(
        (json) => {
          setCodes(json.codes as PromoCode[]);
          setCheckedAt(new Date());
          setLoadError("");
        },
        (err) => setLoadError(err instanceof Error ? err.message : "Couldn't load promo codes.")
      )
      .finally(() => setRefreshing(false));
  }, [apiCall]);

  const load = useCallback(() => {
    loadCodes();
    apiCall("/api/admin/tickets").then(
      (json) => setTickets(json.tickets as Ticket[]),
      () => {}
    );
  }, [apiCall, loadCodes]);

  // Live: check again every 10 seconds while this tab is open, and as soon
  // as you come back to it.
  useEffect(() => {
    const first = setTimeout(load, 0);
    const poll = setInterval(() => {
      if (document.visibilityState === "visible") loadCodes();
      setTick((n) => n + 1);
    }, POLL_MS);
    const onVisible = () => document.visibilityState === "visible" && loadCodes();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      clearTimeout(first);
      clearInterval(poll);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [load, loadCodes]);

  const ticketName = (id: string) => tickets.find((t) => t.id === id)?.name.en ?? id;
  const knownTickets = (ids: string[]) => ids.filter((id) => tickets.some((t) => t.id === id));

  const fieldsBody = (draft: Draft) => ({
    label: draft.label,
    percentOff: Number(draft.percentOff),
    maxUses: draft.maxUses ? Number(draft.maxUses) : null,
    expiresAt: draft.expiresAt ? new Date(draft.expiresAt).toISOString() : null,
    // Drops the Standard default if that ticket doesn't exist.
    ticketIds: knownTickets(draft.ticketIds),
  });

  async function create(draft: Draft) {
    const json = await apiCall("/api/admin/promo-codes", {
      method: "POST",
      body: JSON.stringify({ code: draft.code, ...fieldsBody(draft) }),
    });
    const promo = json.code as PromoCode;
    setCodes((list) => [promo, ...(list ?? [])]);
    setNotice({ promo, edited: false });
    setFormOpen(false);
  }

  async function save(p: PromoCode, draft: Draft) {
    const json = await apiCall("/api/admin/promo-codes", {
      method: "PATCH",
      body: JSON.stringify({ id: p.id, ...fieldsBody(draft) }),
    });
    const updated = json.code as PromoCode;
    // Matched by code: the edit may have given it a new Stripe id.
    setCodes((list) => (list ?? []).map((c) => (c.code === updated.code ? { ...updated, registrations: c.registrations } : c)));
    setNotice({ promo: updated, edited: true });
    setEditing(null);
  }

  function startEdit(p: PromoCode) {
    setEditing(p.code);
    setFormOpen(false);
    setNotice(null);
  }

  async function toggle(p: PromoCode) {
    if (p.active && !window.confirm(`Switch off ${p.code}? People can no longer use it. Registrations already made keep their discount.`)) return;
    setBusyId(p.id);
    try {
      const json = await apiCall("/api/admin/promo-codes", { method: "PATCH", body: JSON.stringify({ id: p.id, active: !p.active }) });
      const updated = json.code as PromoCode;
      setCodes((list) => (list ?? []).map((c) => (c.id === updated.id ? updated : c)));
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Couldn't update the code.");
    } finally {
      setBusyId(null);
    }
  }

  async function copy(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(code);
      setTimeout(() => setCopied((c) => (c === code ? null : c)), 2000);
    } catch {
      /* the code is on screen */
    }
  }

  return (
    <AdminPage>
      <PageHeader
        eyebrow="Registration form"
        title="Promo codes"
        description="Discounts and complimentary passes, e.g. for sponsors. People type the code on the form's ticket step. 100% off is a free pass: no card needed."
        actions={
          <>
            <span className="text-sm text-ink-3" aria-live="polite">
              {checkedAt ? `Updated ${relativeTime(checkedAt.toISOString())}` : ""}
            </span>
            <Button variant="outline" onClick={() => loadCodes()} disabled={refreshing} aria-label="Refresh promo codes" title="Refresh" className="px-3">
              <IconRefresh className={cx("h-4 w-4", refreshing && "animate-spin")} />
            </Button>
            <Button variant="primary" onClick={() => { setFormOpen((o) => !o); setNotice(null); setEditing(null); }} aria-expanded={formOpen}>
              {formOpen ? "Close" : "Create a code"}
            </Button>
          </>
        }
      />

      {notice && (
        <Alert
          tone="success"
          title={`Code ${notice.promo.code} ${notice.edited ? "updated" : "created"}`}
          action={<Button size="sm" variant="outline" onClick={() => copy(notice.promo.code)}>{copied === notice.promo.code ? "Copied" : "Copy code"}</Button>}
        >
          {notice.edited ? "It now gives " : `Send it to ${notice.promo.label || "them"}. It gives `}
          {discountText(notice.promo)}
          {notice.promo.maxUses ? `, for up to ${notice.promo.maxUses} ${notice.promo.maxUses === 1 ? "person" : "people"}` : ""}
          {notice.edited ? (notice.promo.expiresAt ? `, until ${dateTime(notice.promo.expiresAt)}` : ", with no end date") : ""}.
        </Alert>
      )}

      {formOpen && (
        <Card className="p-5 transition-opacity duration-200 starting:opacity-0 sm:p-6">
          <h2 className="mb-4 font-display text-xl font-bold text-blue">New promo code</h2>
          <PromoForm idPrefix="promo" initial={EMPTY} tickets={tickets} onSubmit={create} onCancel={() => setFormOpen(false)} />
        </Card>
      )}

      {codes === null ? (
        loadError ? (
          <ErrorState title="Couldn't load promo codes" message={loadError} onRetry={() => { setLoadError(""); load(); }} />
        ) : (
          <Card>
            <LoadingLabel>Loading promo codes</LoadingLabel>
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
        !formOpen && (
          <Card>
            <EmptyState
              title="No promo codes yet"
              body="Create one for a sponsor or partner, then send them the code."
              action={<Button variant="outline" onClick={() => setFormOpen(true)}>Create a code</Button>}
            />
          </Card>
        )
      ) : (
        <Card>
          <ul className="divide-y divide-line">
            {codes.map((p) => {
              const st = status(p);
              const isEditing = editing === p.code;
              return (
                <li key={p.code} className="p-4 sm:p-5">
                  <div className="flex flex-wrap items-start gap-x-6 gap-y-3">
                    <div className="min-w-0 flex-1 basis-64 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-base font-semibold text-ink">{p.code}</span>
                        <Chip dot={st.dot} className={st.label === "Active" ? "" : "text-ink-3"}>{st.label}</Chip>
                      </div>
                      <p className="text-sm text-ink-2">{p.label || "No description"}</p>
                      <p className="text-sm text-ink-3">
                        {p.ticketIds ? p.ticketIds.map(ticketName).join(", ") : "Any ticket"}
                        {" · "}
                        {p.expiresAt ? `until ${dateTime(p.expiresAt)}` : "no end date"}
                      </p>
                    </div>
                    <div className="min-w-24">
                      <p className="font-display text-xl font-bold text-blue">{p.percentOff === 100 ? "Free" : `${p.percentOff}%`}</p>
                      <p className="text-sm text-ink-3">{p.percentOff === 100 ? "pass" : "off"}</p>
                    </div>
                    <div className="min-w-24">
                      <p className="font-display text-xl font-bold text-blue">
                        {p.used}
                        {p.maxUses !== null && <span className="text-ink-3"> / {p.maxUses}</span>}
                      </p>
                      <p className="text-sm text-ink-3">{p.maxUses !== null ? "used" : "used, no limit"}</p>
                      {p.registrations && p.registrations.started > 0 && (
                        <p className="text-sm font-semibold text-gold-ink">
                          +{p.registrations.started} started, not finished
                        </p>
                      )}
                    </div>
                    <div className="flex w-full flex-wrap gap-2 lg:w-auto">
                      <Button size="sm" variant="outline" onClick={() => copy(p.code)}>
                        {copied === p.code ? "Copied" : "Copy code"}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => (isEditing ? setEditing(null) : startEdit(p))} aria-expanded={isEditing}>
                        {isEditing ? "Close" : "Edit"}
                      </Button>
                      <Button size="sm" variant={p.active ? "danger" : "outline"} loading={busyId === p.id} onClick={() => toggle(p)}>
                        {p.active ? "Switch off" : "Switch on"}
                      </Button>
                    </div>
                  </div>
                  {isEditing && (
                    <div className="mt-4 rounded-lg border border-line bg-subtle p-4 transition-opacity duration-200 starting:opacity-0 sm:p-5">
                      <h3 className="mb-4 font-display text-lg font-bold text-blue">Edit {p.code}</h3>
                      <PromoForm
                        idPrefix={`edit-${p.code}`}
                        editing={p}
                        initial={{
                          label: p.label,
                          code: p.code,
                          percentOff: String(p.percentOff),
                          maxUses: p.maxUses === null ? "" : String(p.maxUses),
                          expiresAt: localInput(p.expiresAt),
                          // An older code that works with any ticket: start with them all ticked.
                          ticketIds: p.ticketIds ?? tickets.filter((t) => t.id !== STUDENT_TICKET_ID).map((t) => t.id),
                        }}
                        tickets={tickets}
                        onSubmit={(draft) => save(p, draft)}
                        onCancel={() => setEditing(null)}
                      />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </AdminPage>
  );
}

// The fields of a new code, or of one being edited (`editing`): the same,
// except that the code itself can't change once it has been sent out.
function PromoForm({
  idPrefix,
  initial,
  editing,
  tickets,
  onSubmit,
  onCancel,
}: {
  idPrefix: string;
  initial: Draft;
  editing?: PromoCode;
  tickets: Ticket[];
  /** Throws on failure, with `body.fields` for field errors. */
  onSubmit: (draft: Draft) => Promise<void>;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<Draft>(initial);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const timeZone = typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "local time";
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((d) => ({ ...d, [key]: value }));
    setFieldErrors((e) => ({ ...e, [key]: "" }));
  };
  const id = (name: string) => `${idPrefix}-${name}`;
  const err = (k: string) => fieldErrors[k] || undefined;
  const aria = (fieldId: string, e?: string, hint?: boolean) => ({ "aria-invalid": !!e, "aria-describedby": describedBy(fieldId, { hint, error: e }) });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaveError("");
    setFieldErrors({});
    try {
      await onSubmit(draft);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : editing ? "Couldn't save the code." : "Couldn't create the code.");
      const fields = (error as { body?: { fields?: Record<string, string> } }).body?.fields;
      if (fields) setFieldErrors(fields);
    } finally {
      setSaving(false);
    }
  }

  const used = editing?.used ?? 0;

  return (
    <form onSubmit={submit} noValidate className="grid grid-cols-1 gap-5 sm:grid-cols-2">
      <Field id={id("label")} label="Who is it for?" required error={err("label")} hint="E.g. AfSA sponsor passes. Only you see this, and on the Stripe receipt.">
        <input id={id("label")} className={inputClass(!!err("label"))} value={draft.label} onChange={(e) => set("label", e.target.value)} maxLength={200} {...aria(id("label"), err("label"), true)} />
      </Field>
      {editing ? (
        <div className="space-y-1.5">
          <p className="text-sm font-semibold text-ink">Code</p>
          <p className="flex min-h-11 items-center font-mono text-base text-ink">{editing.code}</p>
          <p className="text-sm text-ink-3">Stays the same, so the people you sent it to can still use it.</p>
        </div>
      ) : (
        <Field id={id("code")} label="Code" optionalLabel="optional" error={err("code")} hint="Leave empty and we'll make one, e.g. NSAC-7K3QXP.">
          <input id={id("code")} className={inputClass(!!err("code"), "font-mono uppercase")} value={draft.code} onChange={(e) => set("code", e.target.value.toUpperCase())} maxLength={40} {...aria(id("code"), err("code"), true)} />
        </Field>
      )}
      <Field
        id={id("percent")}
        as="div"
        label="Discount"
        required
        error={err("percentOff")}
        hint={editing ? "A new discount applies to new registrations. People who already registered keep what they paid." : undefined}
      >
        <div className="flex flex-wrap items-center gap-2">
          {["100", "50", "25"].map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => set("percentOff", v)}
              aria-pressed={draft.percentOff === v}
              className={cx(
                "min-h-11 rounded-md border bg-surface px-3.5 text-sm transition-colors duration-150",
                draft.percentOff === v ? "border-blue font-semibold text-blue ring-1 ring-blue" : "border-line-strong text-ink-2 hover:bg-subtle"
              )}
            >
              {v === "100" ? "Free pass (100%)" : `${v}%`}
            </button>
          ))}
          <label className="flex items-center gap-2 text-sm text-ink-2">
            <span>Other</span>
            <input
              id={id("percent")}
              className={inputClass(!!err("percentOff"), "w-24")}
              inputMode="numeric"
              value={draft.percentOff}
              onChange={(e) => set("percentOff", e.target.value.replace(/[^0-9]/g, ""))}
              aria-label="Discount in percent"
              {...aria(id("percent"), err("percentOff"), !!editing)}
            />
            <span>%</span>
          </label>
        </div>
      </Field>
      <Field
        id={id("max")}
        label="How many people can use it?"
        required
        error={err("maxUses")}
        hint={
          editing
            ? `Used ${used} ${used === 1 ? "time" : "times"} so far, so at least ${Math.max(used, 1)}. Each completed registration counts as one use.`
            : "E.g. 10 for a sponsor with 10 passes. Each completed registration counts as one use."
        }
      >
        <input id={id("max")} className={inputClass(!!err("maxUses"))} inputMode="numeric" value={draft.maxUses} onChange={(e) => set("maxUses", e.target.value.replace(/[^0-9]/g, ""))} {...aria(id("max"), err("maxUses"), true)} />
      </Field>
      <Field id={id("expires")} label="Valid until" optionalLabel="optional" error={err("expiresAt")} hint={`Leave it empty if the code should never expire. The time is in your time zone (${timeZone}).`}>
        <div className="flex flex-wrap items-center gap-2">
          <input id={id("expires")} type="datetime-local" className={inputClass(!!err("expiresAt"), "min-w-0 flex-1")} value={draft.expiresAt} onChange={(e) => set("expiresAt", e.target.value)} {...aria(id("expires"), err("expiresAt"), true)} />
          {editing && draft.expiresAt && (
            <Button size="sm" variant="ghost" onClick={() => set("expiresAt", "")}>
              No end date
            </Button>
          )}
        </div>
      </Field>
      <Field id={id("tickets")} as="div" label="Works with" required error={err("ticketIds")} hint={editing ? undefined : "Standard by default. Tick other tickets to allow them too."}>
        <div role="group" className="space-y-1" aria-describedby={describedBy(id("tickets"), { hint: !editing, error: err("ticketIds") })}>
          {tickets.length === 0 && <p className="text-sm text-ink-3">Loading tickets…</p>}
          {tickets.filter((t) => t.id !== STUDENT_TICKET_ID).map((t) => (
            <label key={t.id} className="flex min-h-11 items-center gap-3 text-base text-ink">
              <input
                type="checkbox"
                className="h-5 w-5"
                checked={draft.ticketIds.includes(t.id)}
                onChange={(e) => set("ticketIds", e.target.checked ? [...draft.ticketIds, t.id] : draft.ticketIds.filter((x) => x !== t.id))}
              />
              {t.name.en}
            </label>
          ))}
        </div>
      </Field>
      {saveError && (
        <div className="sm:col-span-2">
          <Alert tone="error">{saveError}</Alert>
        </div>
      )}
      <div className="flex flex-wrap gap-3 sm:col-span-2">
        <Button type="submit" variant="secondary" loading={saving}>
          {editing ? (saving ? "Saving" : "Save changes") : saving ? "Creating" : "Create code"}
        </Button>
        <Button variant="ghost" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
