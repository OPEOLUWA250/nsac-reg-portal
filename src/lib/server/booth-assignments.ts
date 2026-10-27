import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { describeError } from "@/lib/describe-error";
import { BOOTHS } from "@/lib/venue/data";
import type { ExhibitorMap } from "@/lib/venue/places";
import type { BoothAssignmentInput } from "@/lib/venue/booth-fields";

// Which company has which booth, for the venue map. Admins edit them at
// /admin/booths (one row per sold booth in `booth_assignments`, keyed by the
// code on the plan, e.g. W-S4); the map shows a change on the next page load.
// See docs/wayfinder/README.md.

const TABLE = "booth_assignments";
const KNOWN = new Set(BOOTHS.map((b) => b.code));

export interface BoothAssignment extends BoothAssignmentInput {
  updatedAt: string;
  updatedBy: string | null;
}

interface Row {
  booth_code: string;
  status: string | null;
  company_name: string;
  sector: string | null;
  website: string | null;
  description: string | null;
  updated_at: string;
  updated_by: string | null;
}

const COLUMNS = "booth_code, status, company_name, sector, website, description, updated_at, updated_by";

const fromRow = (r: Row): BoothAssignment => ({
  boothCode: r.booth_code,
  status: r.status === "reserved" ? "reserved" : "sold",
  companyName: r.company_name,
  sector: r.sector,
  website: r.website,
  description: r.description,
  updatedAt: r.updated_at,
  updatedBy: r.updated_by,
});

/** The table, or one of its columns, isn't there yet (the setup SQL wasn't run). */
export function isNotSetUp(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code;
  return code === "42P01" || code === "PGRST205" || code === "42703" || code === "PGRST204";
}

const httpUrl = (v: unknown) => (typeof v === "string" && /^https?:\/\/\S+$/i.test(v.trim()) ? v.trim() : null);
const text = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

const PUBLIC_COLUMNS = "booth_code, status, company_name, sector, website";

/** For the public map. Never throws: without the table every booth is "not yet assigned". */
export async function getBoothAssignments(): Promise<ExhibitorMap> {
  try {
    let { data, error } = await supabaseAdmin().from(TABLE).select(`${PUBLIC_COLUMNS}, description`);
    // Before the description column is added, the names still show.
    if (error && isNotSetUp(error)) ({ data, error } = await supabaseAdmin().from(TABLE).select(PUBLIC_COLUMNS));
    if (error) throw error;
    const out: ExhibitorMap = {};
    for (const row of (data ?? []) as (Omit<Row, "description" | "updated_at" | "updated_by"> & { description?: string | null })[]) {
      const code = text(row.booth_code)?.toUpperCase();
      const company = text(row.company_name);
      // Rows for booths that aren't on the plan (typos) are skipped, not shown.
      if (!code || !KNOWN.has(code) || !company) continue;
      // Reserved booths go out without the company: the deal isn't confirmed.
      out[code] = row.status === "reserved" ? { status: "reserved" } : { status: "sold", company, sector: text(row.sector), website: httpUrl(row.website), description: text(row.description) };
    }
    return out;
  } catch (err) {
    console.error(`Could not read booth assignments: ${describeError(err)}`);
    return {};
  }
}

/** For the admin: every assigned booth. Throws, so the page can say what went wrong. */
export async function listBoothAssignments(): Promise<BoothAssignment[]> {
  const { data, error } = await supabaseAdmin().from(TABLE).select(COLUMNS);
  if (error) throw error;
  return ((data ?? []) as Row[]).filter((r) => KNOWN.has(r.booth_code)).map(fromRow);
}

export async function saveBoothAssignment(input: BoothAssignmentInput, by: string): Promise<BoothAssignment> {
  const { data, error } = await supabaseAdmin()
    .from(TABLE)
    .upsert(
      {
        booth_code: input.boothCode,
        status: input.status,
        company_name: input.companyName,
        sector: input.sector,
        website: input.website,
        description: input.description,
        updated_at: new Date().toISOString(),
        updated_by: by,
      },
      { onConflict: "booth_code" }
    )
    .select(COLUMNS)
    .single();
  if (error) throw error;
  return fromRow(data as Row);
}

/** Frees a booth. False when it wasn't assigned. */
export async function clearBoothAssignment(boothCode: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin().from(TABLE).delete().eq("booth_code", boothCode).select("booth_code");
  if (error) throw error;
  return (data ?? []).length > 0;
}
