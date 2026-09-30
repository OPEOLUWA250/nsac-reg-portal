// Generic Jotform submission -> attendee field mapping.
//
// Jotform's webhook sends a `rawRequest` field: a JSON object keyed by
// `q<number>_<fieldName>`, where `<fieldName>` is derived from the field's
// label (e.g. `q3_fullName`, `q5_emailAddress`, `q7_attendeeType`).
//
// We don't know your exact field names yet, so this matches by *keyword* in
// the key. Once you've tested against a real submission, tighten these
// keyword lists (or replace with exact key matches) to be precise.

const ROLE_KEYWORDS: Record<string, string[]> = {
  speaker: ["speaker", "panelist", "presenter"],
  host: ["host", "organizer", "organiser", "moderator"],
  staff: ["staff", "volunteer", "crew"],
  exhibitor: ["exhibitor", "sponsor"],
  media: ["media", "press", "journalist"],
  vip: ["vip"],
  delegate: ["delegate", "attendee", "participant", "guest"],
};

function normalizeRole(rawValue: string): string {
  const value = rawValue.toLowerCase();
  for (const [role, keywords] of Object.entries(ROLE_KEYWORDS)) {
    if (keywords.some((kw) => value.includes(kw))) return role;
  }
  return "delegate";
}

function flattenValue(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "object") {
    // Jotform name fields often come as { first, last } or { prefix, first, last }
    const obj = value as Record<string, string>;
    return [obj.prefix, obj.first, obj.middle, obj.last]
      .filter(Boolean)
      .join(" ")
      .trim();
  }
  return String(value).trim();
}

export interface MappedAttendee {
  full_name: string;
  email: string;
  role: string;
  organization: string | null;
  phone: string | null;
}

export function mapJotformSubmission(
  rawRequest: Record<string, unknown>
): MappedAttendee | null {
  let full_name = "";
  let email = "";
  let role = "";
  let organization: string | null = null;
  let phone: string | null = null;

  for (const [key, rawValue] of Object.entries(rawRequest)) {
    const k = key.toLowerCase();
    const value = flattenValue(rawValue);
    if (!value) continue;

    if (!email && k.includes("email")) {
      email = value;
      continue;
    }
    if (
      !full_name &&
      k.includes("name") &&
      !k.includes("username") &&
      !k.includes("company")
    ) {
      full_name = value;
      continue;
    }
    if (
      !role &&
      (k.includes("role") ||
        k.includes("type") ||
        k.includes("category") ||
        k.includes("attendee"))
    ) {
      role = value;
      continue;
    }
    if (
      !organization &&
      (k.includes("organization") ||
        k.includes("organisation") ||
        k.includes("company"))
    ) {
      organization = value;
      continue;
    }
    if (!phone && (k.includes("phone") || k.includes("mobile"))) {
      phone = value;
      continue;
    }
  }

  if (!email || !full_name) return null;

  return {
    full_name,
    email,
    role: role ? normalizeRole(role) : "delegate",
    organization,
    phone,
  };
}
