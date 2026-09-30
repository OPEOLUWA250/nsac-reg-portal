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
import type { Ticket } from "@/lib/tickets";

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
  ticketIds: string[]; // empty = all tickets
}

const EMPTY: Draft = { label: "", code: "", percentOff: "100", maxUses: "", expiresAt: "", ticketIds: [] };

function status(p: PromoCode): { label: string; dot: string } {
  if (!p.active) return { label: "Switched off", dot: "var(--color-line-strong)" };
  if (p.expiresAt && new Date(p.expiresAt).getTime() < Date.now()) return { label: "Expired", dot: "var(--color-line-strong)" };
  if (p.maxUses !== null && p.used >= p.maxUses) return { label: "Used up", dot: "var(--color-gold)" };
  return { label: "Active", dot: "var(--color-success)" };
}

const dateTime = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

export default function PromoCodesPanel() {
  const { apiCall } = useAdmin();
  const [codes, setCodes] = useState<PromoCode[] | null>(null);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loadError, setLoadError] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [created, setCreated] = useState<PromoCode | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const load = useCallback(() => {
    apiCall("/api/admin/promo-codes").then(
      (json) => setCodes(json.codes as PromoCode[]),
      (err) => setLoadError(err instanceof Error ? err.message : "Couldn't load promo codes.")
    );
    apiCall("/api/admin/tickets").then(
      (json) => setTickets(json.tickets as Ticket[]),
      () => {}
    );
  }, [apiCall]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once
  }, []);

  const ticketName = (id: string) => tickets.find((t) => t.id === id)?.name.en ?? id;
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((d) => ({ ...d, [key]: value }));
    setFieldErrors((e) => ({ ...e, [key]: "" }));
  };

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaveError("");
    setFieldErrors({});
    try {
      const json = await apiCall("/api/admin/promo-codes", {
        method: "POST",
        body: JSON.stringify({
          label: draft.label,
          code: draft.code,
          percentOff: Number(draft.percentOff),
          maxUses: draft.maxUses ? Number(draft.maxUses) : null,
          expiresAt: draft.expiresAt ? new Date(draft.expiresAt).toISOString() : null,
          ticketIds: draft.ticketIds,
        }),
      });
      const promo = json.code as PromoCode;
      setCodes((list) => [promo, ...(list ?? [])]);
      setCreated(promo);
      setDraft(EMPTY);
      setFormOpen(false);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Couldn't create the code.");
      const fields = (err as { body?: { fields?: Record<string, string> } }).body?.fields;
      if (fields) setFieldErrors(fields);
    } finally {
      setSaving(false);
    }
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

  const err = (k: string) => fieldErrors[k] || undefined;
  const aria = (id: string, e?: string, hint?: boolean) => ({ "aria-invalid": !!e, "aria-describedby": describedBy(id, { hint, error: e }) });

  return (
    <AdminPage>
      <PageHeader
        eyebrow="Registration form"
        title="Promo codes"
        description="Discounts and complimentary passes, e.g. for sponsors. People type the code on the form's ticket step. 100% off is a free pass: no card needed."
        actions={
          <Button variant="primary" onClick={() => { setFormOpen((o) => !o); setCreated(null); }} aria-expanded={formOpen}>
            {formOpen ? "Close" : "Create a code"}
          </Button>
        }
      />

      {created && (
        <Alert
          tone="success"
          title={`Code ${created.code} created`}
          action={<Button size="sm" variant="outline" onClick={() => copy(created.code)}>{copied === created.code ? "Copied" : "Copy code"}</Button>}
        >
          Send it to {created.label || "them"}. {created.percentOff === 100 ? "It gives a free pass" : `It gives ${created.percentOff}% off`}
          {created.maxUses ? `, for up to ${created.maxUses} ${created.maxUses === 1 ? "person" : "people"}` : ""}.
        </Alert>
      )}

      {formOpen && (
        <Card className="p-5 transition-opacity duration-200 starting:opacity-0 sm:p-6">
          <h2 className="mb-4 font-display text-xl font-bold text-blue">New promo code</h2>
          <form onSubmit={create} noValidate className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <Field id="promo-label" label="Who is it for?" required error={err("label")} hint="E.g. AfSA sponsor passes. Only you see this, and on the Stripe receipt.">
              <input id="promo-label" className={inputClass(!!err("label"))} value={draft.label} onChange={(e) => set("label", e.target.value)} maxLength={200} {...aria("promo-label", err("label"), true)} />
            </Field>
            <Field id="promo-code" label="Code" optionalLabel="optional" error={err("code")} hint="Leave empty and we'll make one, e.g. NSAC-7K3QXP.">
              <input id="promo-code" className={inputClass(!!err("code"), "font-mono uppercase")} value={draft.code} onChange={(e) => set("code", e.target.value.toUpperCase())} maxLength={40} {...aria("promo-code", err("code"), true)} />
            </Field>
            <Field id="promo-percent" as="div" label="Discount" required error={err("percentOff")}>
              <div className="flex flex-wrap items-center gap-2">
                {["100", "50", "25"].map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => set("percentOff", v)}
                    aria-pressed={draft.percentOff === v}
                    className={cx(
                      "min-h-11 rounded-md border px-3.5 text-sm transition-colors duration-150",
                      draft.percentOff === v ? "border-blue font-semibold text-blue ring-1 ring-blue" : "border-line-strong text-ink-2 hover:bg-subtle"
                    )}
                  >
                    {v === "100" ? "Free pass (100%)" : `${v}%`}
                  </button>
                ))}
                <label className="flex items-center gap-2 text-sm text-ink-2">
                  <span>Other</span>
                  <input
                    id="promo-percent"
                    className={inputClass(!!err("percentOff"), "w-24")}
                    inputMode="numeric"
                    value={draft.percentOff}
                    onChange={(e) => set("percentOff", e.target.value.replace(/[^0-9]/g, ""))}
                    aria-label="Discount in percent"
                    {...aria("promo-percent", err("percentOff"))}
                  />
                  <span>%</span>
                </label>
              </div>
            </Field>
            <Field id="promo-max" label="How many people can use it?" optionalLabel="optional" error={err("maxUses")} hint="Empty = no limit. Each completed registration counts once.">
              <input id="promo-max" className={inputClass(!!err("maxUses"))} inputMode="numeric" value={draft.maxUses} onChange={(e) => set("maxUses", e.target.value.replace(/[^0-9]/g, ""))} {...aria("promo-max", err("maxUses"), true)} />
            </Field>
            <Field id="promo-expires" label="Valid until" optionalLabel="optional" error={err("expiresAt")} hint="Empty = no end date. Your time zone.">
              <input id="promo-expires" type="datetime-local" className={inputClass(!!err("expiresAt"))} value={draft.expiresAt} onChange={(e) => set("expiresAt", e.target.value)} {...aria("promo-expires", err("expiresAt"), true)} />
            </Field>
            <Field id="promo-tickets" as="div" label="Works with" hint="Leave all unticked to allow every ticket.">
              <div className="space-y-1">
                {tickets.length === 0 && <p className="text-sm text-ink-3">Loading tickets…</p>}
                {tickets.map((t) => (
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
                {saving ? "Creating" : "Create code"}
              </Button>
              <Button variant="ghost" onClick={() => setFormOpen(false)} disabled={saving}>
                Cancel
              </Button>
            </div>
          </form>
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
              return (
                <li key={p.id} className="flex flex-wrap items-start gap-x-6 gap-y-3 p-4 sm:p-5">
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
                  </div>
                  <div className="flex w-full gap-2 lg:w-auto">
                    <Button size="sm" variant="outline" onClick={() => copy(p.code)}>
                      {copied === p.code ? "Copied" : "Copy code"}
                    </Button>
                    <Button size="sm" variant={p.active ? "danger" : "outline"} loading={busyId === p.id} onClick={() => toggle(p)}>
                      {p.active ? "Switch off" : "Switch on"}
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </AdminPage>
  );
}
