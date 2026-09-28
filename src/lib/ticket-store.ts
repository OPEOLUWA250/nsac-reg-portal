import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  isOnSale,
  MAX_PRICE_CENTS,
  MIN_PRICE_CENTS,
  TICKET_ID_RE,
  type Ticket,
} from "@/lib/tickets";

// Server-only: reads and writes the `tickets` table. Never import this from
// a client component (it uses the service-role Supabase client).

interface TicketRow {
  id: string;
  name_en: string;
  name_fr: string;
  description_en: string;
  description_fr: string;
  amount_cents: number;
  currency: string;
  available_until: string | null;
  active: boolean;
  sort_order: number;
}

function fromRow(row: TicketRow): Ticket {
  return {
    id: row.id,
    name: { en: row.name_en, fr: row.name_fr },
    description: { en: row.description_en, fr: row.description_fr },
    amountCents: row.amount_cents,
    currency: row.currency,
    availableUntil: row.available_until,
    active: row.active,
    sortOrder: row.sort_order,
  };
}

/** Every ticket, including hidden and expired ones (for the admin). */
export async function listTickets(): Promise<Ticket[]> {
  const { data, error } = await supabaseAdmin()
    .from("tickets")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) {
    if (error.code === "42P01" || error.code === "PGRST205") {
      console.error(
        "tickets table is missing — run supabase/migrations/20260928130000_tickets.sql",
        error
      );
    }
    throw error;
  }
  return (data as TicketRow[]).map(fromRow);
}

/** Tickets that can be bought right now, in display order. */
export async function availableTickets(now: Date = new Date()): Promise<Ticket[]> {
  return (await listTickets()).filter((t) => isOnSale(t, now));
}

export type TicketInputErrors = Partial<Record<
  "id" | "nameEn" | "nameFr" | "descriptionEn" | "descriptionFr" | "amountCents" | "availableUntil" | "sortOrder",
  string
>>;

function text(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim();
  return v.length <= max ? v : null;
}

/** Validates a ticket sent from the admin dashboard. */
export function validateTicketInput(
  raw: Record<string, unknown>
): { ok: true; row: TicketRow } | { ok: false; errors: TicketInputErrors } {
  const errors: TicketInputErrors = {};

  const id = typeof raw.id === "string" ? raw.id.trim() : "";
  if (!TICKET_ID_RE.test(id)) {
    errors.id = "Use 2–40 lowercase letters, numbers or underscores (e.g. standard).";
  }

  const nameEn = text(raw.nameEn, 80);
  const nameFr = text(raw.nameFr, 80);
  const descriptionEn = text(raw.descriptionEn ?? "", 300);
  const descriptionFr = text(raw.descriptionFr ?? "", 300);
  if (!nameEn) errors.nameEn = "Required (max 80 characters).";
  if (!nameFr) errors.nameFr = "Required (max 80 characters).";
  if (descriptionEn === null) errors.descriptionEn = "Max 300 characters.";
  if (descriptionFr === null) errors.descriptionFr = "Max 300 characters.";

  const amountCents = raw.amountCents;
  if (
    typeof amountCents !== "number" ||
    !Number.isInteger(amountCents) ||
    amountCents < MIN_PRICE_CENTS ||
    amountCents > MAX_PRICE_CENTS
  ) {
    errors.amountCents = `Enter a price between €${MIN_PRICE_CENTS / 100} and €${MAX_PRICE_CENTS / 100}.`;
  }

  let availableUntil: string | null = null;
  if (raw.availableUntil !== null && raw.availableUntil !== undefined && raw.availableUntil !== "") {
    const date = typeof raw.availableUntil === "string" ? new Date(raw.availableUntil) : null;
    if (!date || Number.isNaN(date.getTime())) errors.availableUntil = "Not a valid date.";
    else availableUntil = date.toISOString();
  }

  const sortOrder = raw.sortOrder ?? 0;
  if (typeof sortOrder !== "number" || !Number.isInteger(sortOrder) || Math.abs(sortOrder) > 1000) {
    errors.sortOrder = "Whole number between -1000 and 1000.";
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return {
    ok: true,
    row: {
      id,
      name_en: nameEn!,
      name_fr: nameFr!,
      description_en: descriptionEn!,
      description_fr: descriptionFr!,
      amount_cents: amountCents as number,
      currency: "eur",
      available_until: availableUntil,
      active: raw.active !== false,
      sort_order: sortOrder as number,
    },
  };
}

/**
 * Creates or updates a ticket. `isNew` guards against accidentally
 * overwriting an existing ticket when adding one with the same id.
 */
export async function saveTicket(
  row: TicketRow,
  isNew: boolean
): Promise<{ ok: true; ticket: Ticket } | { ok: false; conflict: true } | { ok: false; notFound: true }> {
  const supabase = supabaseAdmin();
  const values = { ...row, updated_at: new Date().toISOString() };

  if (isNew) {
    const { data, error } = await supabase.from("tickets").insert(values).select().single();
    if (error?.code === "23505") return { ok: false, conflict: true };
    if (error) throw error;
    return { ok: true, ticket: fromRow(data as TicketRow) };
  }

  const { data, error } = await supabase
    .from("tickets")
    .update(values)
    .eq("id", row.id)
    .select()
    .maybeSingle();
  if (error) throw error;
  if (!data) return { ok: false, notFound: true };
  return { ok: true, ticket: fromRow(data as TicketRow) };
}
