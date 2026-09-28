"use client";

import { useEffect, useState } from "react";
import { Button, Card } from "@/components/ui";
import { formatPrice, isOnSale, MIN_PRICE_CENTS, type Ticket } from "@/lib/tickets";

// Admin panel for ticket types and prices. Whatever is saved here is what
// /register shows and what Stripe charges, from the next page load on.

type ApiCall = (path: string, options?: RequestInit) => Promise<Record<string, unknown>>;

export interface TicketCounts {
  paid: number;
  pending: number;
}

interface Draft {
  id: string;
  nameEn: string;
  nameFr: string;
  descriptionEn: string;
  descriptionFr: string;
  price: string; // euros, as typed
  availableUntil: string; // <input type="datetime-local"> value, admin's local time
  active: boolean;
  sortOrder: string;
}

type FieldErrors = Partial<Record<string, string>>;

const NEW_KEY = "__new__";

const INPUT =
  "w-full rounded-lg border border-navy/15 px-3 py-2 text-sm text-navy placeholder:text-navy/35 outline-none focus:border-gold focus:ring-2 focus:ring-gold/25";

function pad(n: number) {
  return String(n).padStart(2, "0");
}

// ISO → "2026-12-31T23:59" in the admin's own timezone.
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function toDraft(t: Ticket): Draft {
  return {
    id: t.id,
    nameEn: t.name.en,
    nameFr: t.name.fr,
    descriptionEn: t.description.en,
    descriptionFr: t.description.fr,
    price: (t.amountCents / 100).toFixed(t.amountCents % 100 === 0 ? 0 : 2),
    availableUntil: toLocalInput(t.availableUntil),
    active: t.active,
    sortOrder: String(t.sortOrder),
  };
}

function emptyDraft(sortOrder: number): Draft {
  return {
    id: "",
    nameEn: "",
    nameFr: "",
    descriptionEn: "",
    descriptionFr: "",
    price: "",
    availableUntil: "",
    active: true,
    sortOrder: String(sortOrder),
  };
}

function toPayload(d: Draft) {
  const euros = Number(d.price.trim().replace(",", "."));
  return {
    id: d.id.trim(),
    nameEn: d.nameEn,
    nameFr: d.nameFr,
    descriptionEn: d.descriptionEn,
    descriptionFr: d.descriptionFr,
    // Invalid input is sent as null so the server explains what's wrong.
    amountCents: d.price.trim() && Number.isFinite(euros) ? Math.round(euros * 100) : null,
    availableUntil: d.availableUntil ? new Date(d.availableUntil).toISOString() : null,
    active: d.active,
    sortOrder: Number.parseInt(d.sortOrder, 10) || 0,
  };
}

function statusOf(t: Ticket): { label: string; tone: "on" | "off" } {
  if (!t.active) return { label: "Hidden", tone: "off" };
  if (!isOnSale(t)) return { label: "Sale ended", tone: "off" };
  return { label: "On sale", tone: "on" };
}

export default function TicketManager({
  apiCall,
  counts,
}: {
  apiCall: ApiCall;
  counts: Record<string, TicketCounts>;
}) {
  const [tickets, setTickets] = useState<Ticket[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [adminCodeRequired, setAdminCodeRequired] = useState(false);
  const [adminCode, setAdminCode] = useState("");

  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let cancelled = false;
    apiCall("/api/admin/tickets").then(
      (json) => {
        if (cancelled) return;
        setTickets(json.tickets as Ticket[]);
        setAdminCodeRequired(json.adminCodeRequired === true);
        setLoadError("");
      },
      (err) => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : "Failed to load tickets");
      }
    );
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once when the panel opens
  }, []);

  function startEdit(t: Ticket) {
    setEditingKey(t.id);
    setDraft(toDraft(t));
    setFieldErrors({});
    setSaveError("");
    setNotice("");
  }

  function startNew() {
    const nextOrder = tickets?.length ? Math.max(...tickets.map((t) => t.sortOrder)) + 10 : 10;
    setEditingKey(NEW_KEY);
    setDraft(emptyDraft(nextOrder));
    setFieldErrors({});
    setSaveError("");
    setNotice("");
  }

  function cancelEdit() {
    setEditingKey(null);
    setDraft(null);
    setFieldErrors({});
    setSaveError("");
  }

  async function save(payload: ReturnType<typeof toPayload>, isNew: boolean): Promise<Ticket | null> {
    setSaving(true);
    setSaveError("");
    setFieldErrors({});
    try {
      const json = await apiCall("/api/admin/tickets", {
        method: "POST",
        headers: adminCode ? { "x-admin-code": adminCode } : {},
        body: JSON.stringify({ isNew, ticket: payload }),
      });
      const ticket = json.ticket as Ticket;
      setTickets((prev) => {
        const rest = (prev ?? []).filter((t) => t.id !== ticket.id);
        return [...rest, ticket].sort((a, b) => a.sortOrder - b.sortOrder);
      });
      return ticket;
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to save");
      const fields = (err as { body?: { fields?: FieldErrors } }).body?.fields;
      if (fields) setFieldErrors(fields);
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!draft) return;
    const isNew = editingKey === NEW_KEY;
    const payload = toPayload(draft);

    const previous = tickets?.find((t) => t.id === payload.id);
    if (
      previous &&
      payload.amountCents !== null &&
      payload.amountCents !== previous.amountCents &&
      !window.confirm(
        `Change the price of "${previous.name.en}" from ${formatPrice(previous.amountCents, previous.currency)} to ${formatPrice(payload.amountCents, previous.currency)}?\n\nNew registrations pay the new price straight away. People who already paid are not affected.`
      )
    ) {
      return;
    }

    const saved = await save(payload, isNew);
    if (saved) {
      setNotice(`Saved "${saved.name.en}".`);
      cancelEdit();
    }
  }

  async function toggleActive(t: Ticket) {
    setEditingKey(null);
    setDraft(null);
    setNotice("");
    const saved = await save(toPayload({ ...toDraft(t), active: !t.active }), false);
    if (saved) setNotice(`"${saved.name.en}" is now ${saved.active ? "shown on" : "hidden from"} the form.`);
  }

  const timezone =
    typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "local time";
  const onSaleCount = tickets?.filter((t) => isOnSale(t)).length ?? 0;

  return (
    <Card className="p-6 space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="font-display text-lg text-navy">Tickets &amp; prices</h2>
          <p className="text-sm text-navy/55 max-w-2xl">
            What you save here is what the registration form shows and what Stripe charges, from
            the next page load. People who already registered keep the price they were charged.
            Discount codes are managed in Stripe.
          </p>
        </div>
        <Button variant="gold" onClick={startNew} disabled={saving || editingKey === NEW_KEY}>
          + Add ticket
        </Button>
      </div>

      {adminCodeRequired && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-gold/40 bg-gold/10 px-4 py-3">
          <label htmlFor="admin-code" className="text-sm font-semibold text-navy">
            Admin code
          </label>
          <input
            id="admin-code"
            type="password"
            autoComplete="off"
            className={`${INPUT} max-w-[220px] bg-white`}
            value={adminCode}
            onChange={(e) => setAdminCode(e.target.value)}
          />
          <span className="text-xs text-navy/55">Needed to save changes to tickets and prices.</span>
        </div>
      )}

      {loadError && <p className="text-red-600 text-sm">{loadError}</p>}
      {notice && <p className="text-sm text-navy bg-gold/10 border border-gold/30 rounded-lg px-3 py-2">{notice}</p>}
      {saveError && !editingKey && <p className="text-red-600 text-sm">{saveError}</p>}
      {tickets && onSaleCount === 0 && (
        <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          No ticket is on sale, so the registration form is closed.
        </p>
      )}

      {editingKey === NEW_KEY && draft && (
        <TicketForm
          draft={draft}
          setDraft={setDraft}
          isNew
          errors={fieldErrors}
          saveError={saveError}
          saving={saving}
          timezone={timezone}
          onSubmit={handleSubmit}
          onCancel={cancelEdit}
        />
      )}

      {tickets === null && !loadError && <p className="text-sm text-navy/50">Loading tickets...</p>}

      {tickets && tickets.length > 0 && (
        <div className="divide-y divide-navy/8 rounded-xl border border-navy/10">
          {tickets.map((t) => {
            const status = statusOf(t);
            const c = counts[t.id] ?? { paid: 0, pending: 0 };
            return (
              <div key={t.id} className="p-4 space-y-4">
                <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                  <div className="min-w-[180px] flex-1">
                    <div className="font-semibold text-navy">{t.name.en}</div>
                    <div className="text-xs text-navy/50">
                      {t.name.fr} · <span className="font-mono">{t.id}</span>
                    </div>
                  </div>
                  <div className="font-display text-xl text-navy w-28">
                    {formatPrice(t.amountCents, t.currency)}
                  </div>
                  <div className="text-xs text-navy/60 w-44">
                    {t.availableUntil ? (
                      <>Sale ends {new Date(t.availableUntil).toLocaleString()}</>
                    ) : (
                      "No end date"
                    )}
                  </div>
                  <span
                    className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider whitespace-nowrap ${
                      status.tone === "on"
                        ? "border-gold/40 bg-gold/15 text-navy"
                        : "border-navy/15 text-navy/50"
                    }`}
                  >
                    {status.label}
                  </span>
                  <div className="text-xs text-navy/55 w-28">
                    {c.paid} paid{c.pending > 0 && ` · ${c.pending} pending`}
                  </div>
                  <div className="flex gap-2 ml-auto">
                    <button
                      className="rounded-full border border-navy/20 px-3 py-1 text-xs font-medium text-navy hover:bg-navy/5 disabled:opacity-50 transition-colors"
                      disabled={saving}
                      onClick={() => (editingKey === t.id ? cancelEdit() : startEdit(t))}
                    >
                      {editingKey === t.id ? "Close" : "Edit"}
                    </button>
                    <button
                      className="rounded-full border border-navy/20 px-3 py-1 text-xs font-medium text-navy hover:bg-navy/5 disabled:opacity-50 transition-colors"
                      disabled={saving}
                      onClick={() => toggleActive(t)}
                    >
                      {t.active ? "Hide" : "Show"}
                    </button>
                  </div>
                </div>
                {editingKey === t.id && draft && (
                  <TicketForm
                    draft={draft}
                    setDraft={setDraft}
                    isNew={false}
                    errors={fieldErrors}
                    saveError={saveError}
                    saving={saving}
                    timezone={timezone}
                    onSubmit={handleSubmit}
                    onCancel={cancelEdit}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

function TicketForm({
  draft,
  setDraft,
  isNew,
  errors,
  saveError,
  saving,
  timezone,
  onSubmit,
  onCancel,
}: {
  draft: Draft;
  setDraft: (d: Draft) => void;
  isNew: boolean;
  errors: FieldErrors;
  saveError: string;
  saving: boolean;
  timezone: string;
  onSubmit: (e: React.FormEvent) => void;
  onCancel: () => void;
}) {
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft({ ...draft, [key]: value });

  return (
    <form onSubmit={onSubmit} className="rounded-xl bg-navy/[0.03] border border-navy/10 p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
      <Field label="Ticket ID" error={errors.id} hint={isNew ? "Permanent, e.g. standard or student. Lowercase, numbers, underscores." : "Can't be changed."}>
        <input
          className={`${INPUT} font-mono ${isNew ? "" : "bg-navy/5 text-navy/50"}`}
          value={draft.id}
          onChange={(e) => set("id", e.target.value.toLowerCase())}
          disabled={!isNew}
          required
        />
      </Field>
      <Field label="Price (EUR)" error={errors.amountCents} hint={`Minimum €${MIN_PRICE_CENTS / 100}.`}>
        <input
          className={INPUT}
          inputMode="decimal"
          placeholder="e.g. 500"
          value={draft.price}
          onChange={(e) => set("price", e.target.value)}
          required
        />
      </Field>
      <Field label="Name (English)" error={errors.nameEn}>
        <input className={INPUT} value={draft.nameEn} onChange={(e) => set("nameEn", e.target.value)} maxLength={80} required />
      </Field>
      <Field label="Name (French)" error={errors.nameFr}>
        <input className={INPUT} value={draft.nameFr} onChange={(e) => set("nameFr", e.target.value)} maxLength={80} required />
      </Field>
      <Field label="Description (English)" error={errors.descriptionEn}>
        <textarea className={INPUT} rows={2} value={draft.descriptionEn} onChange={(e) => set("descriptionEn", e.target.value)} maxLength={300} />
      </Field>
      <Field label="Description (French)" error={errors.descriptionFr}>
        <textarea className={INPUT} rows={2} value={draft.descriptionFr} onChange={(e) => set("descriptionFr", e.target.value)} maxLength={300} />
      </Field>
      <Field label="Sale ends" error={errors.availableUntil} hint={`Optional. Your time zone (${timezone}). Empty = no end date.`}>
        <div className="flex gap-2">
          <input
            type="datetime-local"
            className={INPUT}
            value={draft.availableUntil}
            onChange={(e) => set("availableUntil", e.target.value)}
          />
          {draft.availableUntil && (
            <button type="button" className="text-xs text-navy/60 underline shrink-0" onClick={() => set("availableUntil", "")}>
              Clear
            </button>
          )}
        </div>
      </Field>
      <Field label="Display order" error={errors.sortOrder} hint="Lower numbers are shown first.">
        <input className={INPUT} inputMode="numeric" value={draft.sortOrder} onChange={(e) => set("sortOrder", e.target.value)} />
      </Field>
      <label className="sm:col-span-2 flex items-center gap-2.5 text-sm text-navy">
        <input
          type="checkbox"
          checked={draft.active}
          onChange={(e) => set("active", e.target.checked)}
          className="h-4 w-4 accent-[var(--gold)]"
        />
        Show on the registration form
      </label>
      <div className="sm:col-span-2 flex flex-wrap items-center gap-3">
        <Button type="submit" variant="navy" disabled={saving}>
          {saving ? "Saving..." : isNew ? "Add ticket" : "Save changes"}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        {saveError && <p className="text-red-600 text-sm">{saveError}</p>}
      </div>
    </form>
  );
}

function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <div className="text-xs font-semibold uppercase tracking-wider text-navy/55">{label}</div>
      {children}
      {hint && !error && <p className="text-[11px] text-navy/45">{hint}</p>}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
