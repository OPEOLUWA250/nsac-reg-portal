import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { describeError } from "@/lib/describe-error";
import { BOOTHS } from "@/lib/venue/data";
import type { ExhibitorMap } from "@/lib/venue/places";

// Which company has which booth, for the venue map. Organisers edit the
// `booth_assignments` table in Supabase (one row per sold booth, keyed by the
// code on the plan, e.g. W-S4); the map shows the change on the next page
// load. See docs/wayfinder/README.md.

const KNOWN = new Set(BOOTHS.map((b) => b.code));

const httpUrl = (v: unknown) => (typeof v === "string" && /^https?:\/\/\S+$/i.test(v.trim()) ? v.trim() : null);
const text = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

export async function getBoothAssignments(): Promise<ExhibitorMap> {
  try {
    const { data, error } = await supabaseAdmin().from("booth_assignments").select("booth_code, company_name, sector, website");
    if (error) throw error;
    const out: ExhibitorMap = {};
    for (const row of data ?? []) {
      const code = text(row.booth_code)?.toUpperCase();
      const company = text(row.company_name);
      // Rows for booths that aren't on the plan (typos) are skipped, not shown.
      if (!code || !KNOWN.has(code) || !company) continue;
      out[code] = { company, sector: text(row.sector), website: httpUrl(row.website) };
    }
    return out;
  } catch (err) {
    // Table not created yet, or the database is unreachable: the map still
    // works, with every booth shown as not yet assigned.
    console.error(`Could not read booth assignments: ${describeError(err)}`);
    return {};
  }
}
