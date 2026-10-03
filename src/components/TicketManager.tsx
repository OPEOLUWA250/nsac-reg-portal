"use client";

import { useCallback, useEffect, useState } from "react";
import DeleteDialog from "@/components/admin/DeleteDialog";
import {
  AdminPage,
  Alert,
  Button,
  Card,
  Chip,
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
  const { apiCall, me } = useAdmin();
  // Prices are for super admins to change; other admins see them read-only.
  const canEdit = me?.role === "super_admin";
  const [tickets, setTickets] = useState<Ticket[] | null>(null);
  const [counts, setCounts] = useState<Record<string, TicketCounts>>({});
  const [loadError, setLoadError] = useState("");

  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Ticket | null>(null);

  const load = useCallback(
    () =>
      apiCall("/api/admin/tickets").then(
        (json) => {
          setTickets(json.tickets as Ticket[]);
          setCounts((json.counts as Record<string, TicketCounts>) ?? {});
          setLoadError("");
        },
        (err) => setLoadError(err instanceof Error ? err.message : "Couldn't load tickets."),
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
      setSaveError(err instanceof Error ? err.message : "Couldn't save.");
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
    setSaving(true);
    setSaveError("");
    setNotice("");
    try {
      await apiCall(`/api/admin/tickets?id=${encodeURIComponent(t.id)}`, { method: "DELETE" });
      setTickets((prev) => (prev ?? []).filter((x) => x.id !== t.id));
      setNotice(`"${t.name.en}" deleted.`);
    } finally {
      setSaving(false);
    }
  }

  const timezone = typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "local time";
  const onSaleCount = tickets?.filter((t) => isOnSale(t)).length ?? 0;

  return (
    <AdminPage>
      {deleteTarget && (
        <DeleteDialog title="Delete this ticket?" confirmLabel="Delete ticket" onConfirm={() => remove(deleteTarget)} onClose={() => setDeleteTarget(null)}>
          <p><strong className="text-ink">{deleteTarget.name.en}</strong> will be permanently removed. This cannot be undone.</p>
          <p>Only tickets with no registrations can be deleted.</p>
        </DeleteDialog>
      )}
      <PageHeader
        eyebrow="Registration form"
        title="Tickets & prices"
        description={
          canEdit
            ? "What you save here is what the registration form shows and what Stripe charges, from the next page load. People who already registered keep the price they paid. Discount codes are managed in Stripe."
            : "What the registration form shows and what Stripe charges. Only super admins can change tickets and prices."
        }
        actions={
          canEdit && (
            <Button variant="primary" onClick={startNew} disabled={saving || editingKey === NEW_KEY || tickets === null}>
              Add ticket
            </Button>
          )
        }
      />

      <details className="group rounded-lg border border-line bg-surface">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-lg px-4 py-2 text-sm font-semibold text-ink transition-colors duration-150 hover:bg-canvas">
          How the ticket controls work
          <span aria-hidden="true" className="text-ink-3 transition-transform duration-150 group-open:rotate-180">
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 9l6 6 6-6" /></svg>
          </span>
        </summary>
        <dl className="grid gap-x-8 gap-y-3 border-t border-line px-4 py-4 text-sm sm:grid-cols-2">
          {GUIDE.map(([title, body]) => (
            <div key={title}>
              <dt className="font-semibold text-ink">{title}</dt>
              <dd className="text-ink-3">{body}</dd>
            </div>
          ))}
        </dl>
      </details>

      {notice && <Alert tone="success">{notice}</Alert>}
      {saveError && !editingKey && <Alert tone="error">{saveError}</Alert>}
      {tickets && tickets.length > 0 && onSaleCount === 0 && (
        <Alert tone="error" title="The registration form is closed">
          No ticket is on sale. Show a ticket, or give one a later sale end date, to open the form again.
        </Alert>
      )}

      {editingKey === NEW_KEY && draft && (
        <Card className="p-5 transition-opacity duration-200 starting:opacity-0 sm:p-6">
          <h2 className="mb-4 font-display text-xl font-bold text-blue">New ticket</h2>
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
        </Card>
      )}

      {tickets === null ? (
        loadError ? (
          <ErrorState title="Couldn't load tickets" message={loadError} onRetry={() => { setLoadError(""); load(); }} />
        ) : (
          <Card>
            <LoadingLabel>Loading tickets</LoadingLabel>
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex flex-wrap items-center gap-4 border-t border-line p-4 first:border-t-0">
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-3 w-56 max-w-full" />
                </div>
                <Skeleton className="h-7 w-20" />
                <Skeleton className="h-9 w-48 rounded-md" />
              </div>
            ))}
          </Card>
        )
      ) : tickets.length === 0 ? (
        editingKey !== NEW_KEY && (
          <Card>
            <EmptyState
              title="No tickets yet"
              body="The registration form stays closed until at least one ticket is on sale."
              action={canEdit && <Button variant="outline" onClick={startNew}>Add the first ticket</Button>}
            />
          </Card>
        )
      ) : (
        <Card>
          <ul className="divide-y divide-line">
            {tickets.map((t) => {
              const status = statusOf(t);
              const c = counts[t.id] ?? { paid: 0, pending: 0, total: 0 };
              const editing = editingKey === t.id;
              return (
                <li key={t.id} className="space-y-4 p-4 sm:p-5">
                  <div className="flex flex-wrap items-start gap-x-6 gap-y-3">
                    <div className="min-w-0 flex-1 basis-56">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="font-semibold text-ink">{t.name.en}</h2>
                        <Chip dot={status.tone === "on" ? "var(--color-success)" : "var(--color-line-strong)"} className={status.tone === "off" ? "text-ink-3" : ""}>
                          {status.label}
                        </Chip>
                      </div>
                      <p className="text-sm text-ink-3">
                        {t.name.fr} · <span className="font-mono">{t.id}</span>
                      </p>
                      <p className="mt-1 text-sm text-ink-3">
                        {t.availableUntil
                          ? `Sale ends ${new Date(t.availableUntil).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}`
                          : "No end date"}
                        {" · "}
                        {c.paid} paid{c.pending > 0 && `, ${c.pending} awaiting payment`}
                      </p>
                    </div>
                    <p className="font-display text-2xl font-bold text-blue">{formatPrice(t.amountCents, t.currency)}</p>
                    {canEdit && <div className="flex w-full flex-wrap gap-2 lg:w-auto lg:justify-end">
                      <Button variant="outline" size="sm" disabled={saving && !editing} onClick={() => (editing ? cancelEdit() : startEdit(t))} aria-expanded={editing}>
                        {editing ? "Close" : "Edit"}
                      </Button>
                      <Button variant="outline" size="sm" disabled={saving} onClick={() => toggleActive(t)}>
                        {t.active ? "Hide" : "Show"}
                      </Button>
                      {isOnSale(t) && (
                        <Button variant="outline" size="sm" disabled={saving} onClick={() => endSaleNow(t)}>
                          End sale now
                        </Button>
                      )}
                      {c.total === 0 && (
                        <Button variant="danger" size="sm" disabled={saving} onClick={() => setDeleteTarget(t)}>
                          Delete
                        </Button>
                      )}
                    </div>}
                  </div>
                  {editing && draft && (
                    <div className="rounded-lg border border-line bg-canvas p-4 transition-opacity duration-200 starting:opacity-0">
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
  const prefix = isNew ? "new" : draft.id;
  const f = (name: string) => `ticket-${prefix}-${name}`;
  const aria = (name: string, error?: string, hint?: boolean) => ({
    "aria-invalid": !!error,
    "aria-describedby": describedBy(f(name), { hint, error }),
  });

  return (
    <form onSubmit={onSubmit} noValidate className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <Field id={f("id")} label="Ticket ID" required={isNew} error={errors.id} hint={isNew ? "Permanent, e.g. standard or student. Lowercase letters, numbers and underscores." : "Can't be changed."}>
        <input id={f("id")} className={inputClass(!!errors.id, "font-mono")} value={draft.id} onChange={(e) => set("id", e.target.value.toLowerCase())} disabled={!isNew} required {...aria("id", errors.id, true)} />
      </Field>
      <Field id={f("price")} label="Price (EUR)" required error={errors.amountCents} hint={`At least €${MIN_PRICE_CENTS / 100}.`}>
        <input id={f("price")} className={inputClass(!!errors.amountCents)} inputMode="decimal" value={draft.price} onChange={(e) => set("price", e.target.value)} required {...aria("price", errors.amountCents, true)} />
      </Field>
      <Field id={f("nameEn")} label="Name (English)" required error={errors.nameEn}>
        <input id={f("nameEn")} className={inputClass(!!errors.nameEn)} value={draft.nameEn} onChange={(e) => set("nameEn", e.target.value)} maxLength={80} required {...aria("nameEn", errors.nameEn)} />
      </Field>
      <Field id={f("nameFr")} label="Name (French)" required error={errors.nameFr}>
        <input id={f("nameFr")} className={inputClass(!!errors.nameFr)} value={draft.nameFr} onChange={(e) => set("nameFr", e.target.value)} maxLength={80} required {...aria("nameFr", errors.nameFr)} />
      </Field>
      <Field id={f("descriptionEn")} label="Description (English)" optionalLabel="optional" error={errors.descriptionEn}>
        <textarea id={f("descriptionEn")} className={inputClass(!!errors.descriptionEn)} rows={2} value={draft.descriptionEn} onChange={(e) => set("descriptionEn", e.target.value)} maxLength={300} {...aria("descriptionEn", errors.descriptionEn)} />
      </Field>
      <Field id={f("descriptionFr")} label="Description (French)" optionalLabel="optional" error={errors.descriptionFr}>
        <textarea id={f("descriptionFr")} className={inputClass(!!errors.descriptionFr)} rows={2} value={draft.descriptionFr} onChange={(e) => set("descriptionFr", e.target.value)} maxLength={300} {...aria("descriptionFr", errors.descriptionFr)} />
      </Field>
      <Field id={f("until")} label="Sale ends" optionalLabel="optional" error={errors.availableUntil} hint={`In your time zone (${timezone}). Leave empty for no end date.`}>
        <div className="flex gap-2">
          <input id={f("until")} type="datetime-local" className={inputClass(!!errors.availableUntil)} value={draft.availableUntil} onChange={(e) => set("availableUntil", e.target.value)} {...aria("until", errors.availableUntil, true)} />
          {draft.availableUntil && (
            <Button variant="ghost" onClick={() => set("availableUntil", "")}>
              Clear
            </Button>
          )}
        </div>
      </Field>
      <Field id={f("order")} label="Display order" error={errors.sortOrder} hint="Lower numbers are shown first.">
        <input id={f("order")} className={inputClass(!!errors.sortOrder)} inputMode="numeric" value={draft.sortOrder} onChange={(e) => set("sortOrder", e.target.value)} {...aria("order", errors.sortOrder, true)} />
      </Field>
      <label className="flex min-h-11 items-center gap-3 text-base text-ink sm:col-span-2">
        <input type="checkbox" checked={draft.active} onChange={(e) => set("active", e.target.checked)} className="h-5 w-5" />
        Show on the registration form
      </label>
      {saveError && (
        <div className="sm:col-span-2">
          <Alert tone="error">{saveError}</Alert>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <Button type="submit" variant="secondary" loading={saving}>
          {saving ? "Saving" : isNew ? "Add ticket" : "Save changes"}
        </Button>
        <Button variant="ghost" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
