import { BOOTHS } from "@/lib/venue/data";
import { normalizeCode } from "@/lib/venue/places";

// What an admin can set on a booth (/admin/booths), checked the same way in
// the browser and on the server.

/** Sold: named on the public map. Reserved: on hold, shown as reserved without the name. */
export type AssignmentStatus = "sold" | "reserved";

export interface BoothAssignmentInput {
  boothCode: string;
  status: AssignmentStatus;
  companyName: string;
  sector: string | null;
  website: string | null;
  /** A line or two about the company, on its card on the venue map. */
  description: string | null;
}

export const LIMITS = { companyName: 120, sector: 80, url: 300, description: 280 } as const;

const BY_CODE = new Map(BOOTHS.map((b) => [normalizeCode(b.code), b.code]));

/** The booth's code as printed on the plan ("ws4" is W-S4), or null when it isn't one. */
export function boothCode(raw: unknown): string | null {
  return typeof raw === "string" ? (BY_CODE.get(normalizeCode(raw)) ?? null) : null;
}

const text = (v: unknown) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ") : "");

/** "example.com" becomes "https://example.com"; anything that isn't a web address is null. */
export function webAddress(raw: string): string | null {
  const v = raw.trim();
  if (!v) return null;
  try {
    const u = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(v) ? v : `https://${v}`);
    if ((u.protocol !== "https:" && u.protocol !== "http:") || !u.hostname.includes(".")) return null;
    return u.toString();
  } catch {
    return null;
  }
}

export type BoothFieldErrors = Partial<Record<keyof BoothAssignmentInput, string>>;

export function parseBoothAssignment(body: Record<string, unknown>): { value: BoothAssignmentInput } | { fields: BoothFieldErrors } {
  const fields: BoothFieldErrors = {};
  const code = boothCode(body.boothCode);
  const status = body.status === undefined ? "sold" : body.status;
  const companyName = text(body.companyName);
  const sector = text(body.sector);
  const websiteRaw = text(body.website);
  const website = webAddress(websiteRaw);
  const description = text(body.description);

  if (!code) fields.boothCode = "Pick a booth from the plan.";
  if (status !== "sold" && status !== "reserved") fields.status = "Choose Sold or Reserved.";
  if (!companyName) fields.companyName = "Enter the company's name.";
  else if (companyName.length > LIMITS.companyName) fields.companyName = `Keep it under ${LIMITS.companyName} characters.`;
  if (sector.length > LIMITS.sector) fields.sector = `Keep it under ${LIMITS.sector} characters.`;
  if (websiteRaw && (!website || website.length > LIMITS.url)) fields.website = "Enter a web address, such as example.com.";
  if (description.length > LIMITS.description) fields.description = `Keep it under ${LIMITS.description} characters.`;

  if (Object.keys(fields).length) return { fields };
  return { value: { boothCode: code!, status: status as AssignmentStatus, companyName, sector: sector || null, website, description: description || null } };
}
