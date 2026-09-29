"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Card, Kicker } from "@/components/ui";
import { useAdmin } from "@/components/admin/AdminContext";
import { formatPrice, isOnSale, MIN_PRICE_CENTS, type Ticket } from "@/lib/tickets";

// /admin/tickets: ticket types and prices. Whatever is saved here is what
// /register shows and what Stripe charges, from the next page load on.

interface TicketCounts {
  paid: number;
  pending: number;
  total: number;
}

const GUIDE: [string, string][] = [
  [
    "Set a sale end date",
    "The ticket disappears from the form automatically at that moment, e.g. Early Bird at the end of 31 Dec.",
  ],
  ["End sale now", "Takes a ticket off the form immediately, keeping it in your records."],
  ["Hide / Show", "Switch a ticket off the form and back on, e.g. keep Standard hidden until Early Bird ends."],
  ["Delete", "Only for tickets nobody has registered with. Used tickets can be hidden instead."],
];

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

export default function TicketManager() {
  const { apiCall, adminCode, setAdminCode } = useAdmin();
  const [tickets, setTickets] = useState<Ticket[] | null>(null);
  const [counts, setCounts] = useState<Record<string, TicketCounts>>({});
  const [loadError, setLoadError] = useState("");
  const [adminCodeRequired, setAdminCodeRequired] = useState(false);

  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");

  const load = useCallback(
    () =>
      apiCall("/api/admin/tickets").then(
        (json) => {
          setTickets(json.tickets as Ticket[]);
          setCounts((json.counts as Record<string, TicketCounts>) ?? {});
          setAdminCodeRequired(json.adminCodeRequired === true);
          setLoadError("");
        },
        (err) => setLoadError(err instanceof Error ? err.message : "Failed to load tickets"),
      ),
    [apiCall],
  );

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once when the page opens
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
        `Change the price of "${previous.name.en}" from ${formatPrice(previous.amountCents, previous.currency)} to ${formatPrice(payload.amountCents, previous.currency)}?\n\nNew registrations pay the new price straight away. People who already paid are not affected.`,
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

  // Takes a ticket off the form right now by setting its sale end to now.
  async function endSaleNow(t: Ticket) {
    const ok = window.confirm(
      `End the sale of "${t.name.en}" now? It disappears from the registration form immediately. People who already registered keep their ticket.`,
    );
    if (!ok) return;
    setEditingKey(null);
    setDraft(null);
    setNotice("");
    const payload = { ...toPayload(toDraft(t)), availableUntil: new Date().toISOString() };
    const saved = await save(payload, false);
    if (saved) setNotice(`Sale of "${saved.name.en}" ended. It's no longer on the form.`);
  }

  async function remove(t: Ticket) {
    if (!window.confirm(`Delete "${t.name.en}" permanently? This can't be undone.`)) return;
    setSaving(true);
    setSaveError("");
    setNotice("");
    try {
      await apiCall(`/api/admin/tickets?id=${encodeURIComponent(t.id)}`, { method: "DELETE" });
      setTickets((prev) => (prev ?? []).filter((x) => x.id !== t.id));
      setNotice(`"${t.name.en}" deleted.`);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to delete");
    } finally {
      setSaving(false);
    }
  }

  const timezone = typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "local time";
  const onSaleCount = tickets?.filter((t) => isOnSale(t)).length ?? 0;

  return (
    <main className="px-4 py-6 sm:px-8 sm:py-10">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="space-y-1">
            <Kicker>Registration form</Kicker>
            <h1 className="font-display text-3xl text-navy">Tickets &amp; prices</h1>
            <p className="text-sm text-navy/55 max-w-2xl">
              What you save here is what the registration form shows and what Stripe charges, from the next page load.
              People who already registered keep the price they were charged. Discount codes are managed in Stripe.
            </p>
          </div>
          <Button variant="gold" onClick={startNew} disabled={saving || editingKey === NEW_KEY}>
            + Add ticket
          </Button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {GUIDE.map(([title, body]) => (
            <div key={title} className="rounded-2xl border border-navy/10 bg-white p-4">
              <div className="text-sm font-semibold text-navy">{title}</div>
              <p className="mt-1 text-xs leading-relaxed text-navy/55">{body}</p>
            </div>
          ))}
        </div>

        <Card className="p-6 space-y-5">
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
          {notice && (
            <p className="text-sm text-navy bg-gold/10 border border-gold/30 rounded-lg px-3 py-2">{notice}</p>
          )}
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
                const c = counts[t.id] ?? { paid: 0, pending: 0, total: 0 };
                return (
                  <div key={t.id} className="p-4 space-y-4">
                    <div className="grid grid-cols-2 items-center gap-x-6 gap-y-3 lg:grid-cols-[minmax(0,1fr)_6rem_9rem_7rem_4.5rem_19.5rem]">
                      <div className="col-span-2 lg:col-span-1 min-w-0">
                        <div className="font-semibold text-navy">{t.name.en}</div>
                        <div className="text-xs text-navy/50">
                          {t.name.fr} · <span className="font-mono">{t.id}</span>
                        </div>
                      </div>
                      <div className="font-display text-xl text-navy">
                        {formatPrice(t.amountCents, t.currency)}
                      </div>
                      <div className="text-xs text-navy/60">
                        {t.availableUntil ? (
                          <>Sale ends {new Date(t.availableUntil).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</>
                        ) : (
                          "No end date"
                        )}
                      </div>
                      <span
                        className={`justify-self-start inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider whitespace-nowrap ${
                          status.tone === "on" ? "border-gold/40 bg-gold/15 text-navy" : "border-navy/15 text-navy/50"
                        }`}
                      >
                        {status.label}
                      </span>
                      <div className="text-xs text-navy/55">
                        {c.paid} paid{c.pending > 0 && ` · ${c.pending} pending`}
                      </div>
                      <div className="col-span-2 lg:col-span-1 flex flex-wrap gap-2 lg:justify-end">
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
                        {isOnSale(t) && (
                          <button
                            className="rounded-full border border-navy/20 px-3 py-1 text-xs font-medium text-navy hover:bg-navy/5 disabled:opacity-50 transition-colors"
                            disabled={saving}
                            onClick={() => endSaleNow(t)}
                          >
                            End sale now
                          </button>
                        )}
                        <button
                          className="rounded-full border border-red-200 px-3 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-40 transition-colors"
                          disabled={saving || c.total > 0}
                          title={
                            c.total > 0 ? "People registered with this ticket. Hide it instead." : "Delete this ticket"
                          }
                          onClick={() => remove(t)}
                        >
                          Delete
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
      </div>
    </main>
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
    <form
      onSubmit={onSubmit}
      className="rounded-xl bg-navy/[0.03] border border-navy/10 p-4 grid grid-cols-1 sm:grid-cols-2 gap-3"
    >
      <Field
        label="Ticket ID"
        error={errors.id}
        hint={isNew ? "Permanent, e.g. standard or student. Lowercase, numbers, underscores." : "Can't be changed."}
      >
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
        <input
          className={INPUT}
          value={draft.nameEn}
          onChange={(e) => set("nameEn", e.target.value)}
          maxLength={80}
          required
        />
      </Field>
      <Field label="Name (French)" error={errors.nameFr}>
        <input
          className={INPUT}
          value={draft.nameFr}
          onChange={(e) => set("nameFr", e.target.value)}
          maxLength={80}
          required
        />
      </Field>
      <Field label="Description (English)" error={errors.descriptionEn}>
        <textarea
          className={INPUT}
          rows={2}
          value={draft.descriptionEn}
          onChange={(e) => set("descriptionEn", e.target.value)}
          maxLength={300}
        />
      </Field>
      <Field label="Description (French)" error={errors.descriptionFr}>
        <textarea
          className={INPUT}
          rows={2}
          value={draft.descriptionFr}
          onChange={(e) => set("descriptionFr", e.target.value)}
          maxLength={300}
        />
      </Field>
      <Field
        label="Sale ends"
        error={errors.availableUntil}
        hint={`Optional. Your time zone (${timezone}). Empty = no end date.`}
      >
        <div className="flex gap-2">
          <input
            type="datetime-local"
            className={INPUT}
            value={draft.availableUntil}
            onChange={(e) => set("availableUntil", e.target.value)}
          />
          {draft.availableUntil && (
            <button
              type="button"
              className="text-xs text-navy/60 underline shrink-0"
              onClick={() => set("availableUntil", "")}
            >
              Clear
            </button>
          )}
        </div>
      </Field>
      <Field label="Display order" error={errors.sortOrder} hint="Lower numbers are shown first.">
        <input
          className={INPUT}
          inputMode="numeric"
          value={draft.sortOrder}
          onChange={(e) => set("sortOrder", e.target.value)}
        />
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
