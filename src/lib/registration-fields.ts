// Shared by the registration form (browser) and /api/register (server), so
// both sides apply exactly the same rules. Mirrors the fields of the
// NewSpace Africa Conference 2027 Jotform form.

import { isCountryCode, countryNameEn, EUROPEAN_VAT_COUNTRIES } from "@/lib/countries";

export const LANGUAGES = ["en", "fr"] as const;

/**
 * localStorage key for the half-filled registration form (see
 * src/lib/registration-draft.ts). Cleared once payment succeeds.
 */
export const REGISTRATION_DRAFT_KEY = "nsac_reg_draft";
export type Language = (typeof LANGUAGES)[number];

export const PROFESSIONAL_CATEGORIES = [
  "government",
  "industry",
  "academia",
  "student",
  "media",
  "other",
] as const;
export type ProfessionalCategory = (typeof PROFESSIONAL_CATEGORIES)[number];

export const JOB_FUNCTIONS = [
  "executive",
  "engineering",
  "rnd",
  "business_development",
  "procurement",
  "legal_policy",
  "other",
] as const;
export type JobFunction = (typeof JOB_FUNCTIONS)[number];

export const PASSPORT_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"] as const;
export const PASSPORT_MAX_BYTES = 10 * 1024 * 1024;

export const LIMITS = {
  name: 60,
  email: 254,
  phone: 40,
  jobTitle: 120,
  organization: 160,
  foodAllergies: 500,
  vatNumber: 40,
  invoiceId: 60,
} as const;

// Deliberately simple: something@something.tld, no spaces.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_RE = /^\+?[\d\s().-]{6,}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type FieldName =
  | "firstName"
  | "lastName"
  | "email"
  | "jobTitle"
  | "phone"
  | "nationality"
  | "residenceCountry"
  | "organization"
  | "organizationCountry"
  | "professionalCategory"
  | "jobFunction"
  | "invitationLetter"
  | "passport"
  | "foodAllergies"
  | "safetyConsent"
  | "ticket"
  | "vatNumber"
  | "invoiceId";

/** Error codes, translated in the form (see registration-copy.ts). */
export type FieldError =
  | "required"
  | "too_long"
  | "invalid_email"
  | "invalid_phone"
  | "invalid_choice"
  | "consent_required"
  | "file_type"
  | "file_too_large"
  | "ticket_unavailable"
  | "vat_required";

export type ValidationErrors = Partial<Record<FieldName, FieldError>>;

export interface CleanRegistration {
  id: string;
  firstName: string;
  lastName: string;
  fullName: string;
  email: string;
  jobTitle: string;
  phone: string | null;
  nationality: string;
  residenceCountry: string;
  organization: string;
  organizationCountry: string;
  professionalCategory: ProfessionalCategory;
  jobFunction: JobFunction;
  needsInvitationLetter: boolean;
  /** Set when the browser is about to upload a passport file. */
  passport: { mime: string; size: number } | null;
  foodAllergies: string;
  optInOrganizer: boolean;
  optInSponsors: boolean;
  ticketId: string;
  vatNumber: string | null;
  invoiceId: string | null;
  language: Language;
  /** Badge role, derived from the professional category. */
  role: "delegate" | "press";
}

// Collapses runs of whitespace so "  Ama   Owusu " is stored as "Ama Owusu".
function clean(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

// Keeps line breaks (for the free-text allergies box) but trims the ends.
function cleanMultiline(value: unknown): string {
  return typeof value === "string" ? value.replace(/[ \t]+/g, " ").trim() : "";
}

function requireText(
  errors: ValidationErrors,
  field: FieldName,
  value: string,
  max: number
) {
  if (!value) errors[field] = "required";
  else if (value.length > max) errors[field] = "too_long";
}

function requireCountry(errors: ValidationErrors, field: FieldName, value: string) {
  if (!value) errors[field] = "required";
  else if (!isCountryCode(value)) errors[field] = "invalid_choice";
}

// `availableTicketIds`: tickets on sale right now. Prices are set in the
// admin, so the browser passes the list it was given and the server passes
// a fresh one from the database.
export function validateRegistration(
  raw: Record<string, unknown>,
  availableTicketIds: readonly string[]
): { ok: true; value: CleanRegistration } | { ok: false; errors: ValidationErrors; badId?: boolean } {
  const errors: ValidationErrors = {};

  const id = clean(raw.id);
  const firstName = clean(raw.firstName);
  const lastName = clean(raw.lastName);
  const email = clean(raw.email).toLowerCase();
  const jobTitle = clean(raw.jobTitle);
  const phone = clean(raw.phone);
  const nationality = clean(raw.nationality);
  const residenceCountry = clean(raw.residenceCountry);
  const organization = clean(raw.organization);
  const organizationCountry = clean(raw.organizationCountry);
  const professionalCategory = clean(raw.professionalCategory);
  const jobFunction = clean(raw.jobFunction);
  const invitationLetter = clean(raw.invitationLetter);
  const foodAllergies = cleanMultiline(raw.foodAllergies);
  const ticketId = clean(raw.ticket);
  const vatNumber = clean(raw.vatNumber);
  const invoiceId = clean(raw.invoiceId);
  const language: Language = clean(raw.language) === "fr" ? "fr" : "en";

  requireText(errors, "firstName", firstName, LIMITS.name);
  requireText(errors, "lastName", lastName, LIMITS.name);

  if (!email) errors.email = "required";
  else if (email.length > LIMITS.email) errors.email = "too_long";
  else if (!EMAIL_RE.test(email)) errors.email = "invalid_email";

  requireText(errors, "jobTitle", jobTitle, LIMITS.jobTitle);

  if (phone) {
    if (phone.length > LIMITS.phone) errors.phone = "too_long";
    else if (!PHONE_RE.test(phone)) errors.phone = "invalid_phone";
  }

  requireCountry(errors, "nationality", nationality);
  requireCountry(errors, "residenceCountry", residenceCountry);
  requireText(errors, "organization", organization, LIMITS.organization);
  requireCountry(errors, "organizationCountry", organizationCountry);

  if (!professionalCategory) errors.professionalCategory = "required";
  else if (!(PROFESSIONAL_CATEGORIES as readonly string[]).includes(professionalCategory))
    errors.professionalCategory = "invalid_choice";

  if (!jobFunction) errors.jobFunction = "required";
  else if (!(JOB_FUNCTIONS as readonly string[]).includes(jobFunction))
    errors.jobFunction = "invalid_choice";

  if (!invitationLetter) errors.invitationLetter = "required";
  else if (invitationLetter !== "yes" && invitationLetter !== "no")
    errors.invitationLetter = "invalid_choice";

  let passport: CleanRegistration["passport"] = null;
  if (raw.passport && typeof raw.passport === "object") {
    const p = raw.passport as { mime?: unknown; size?: unknown };
    const mime = typeof p.mime === "string" ? p.mime : "";
    const size = typeof p.size === "number" ? p.size : 0;
    if (!(PASSPORT_MIME_TYPES as readonly string[]).includes(mime)) errors.passport = "file_type";
    else if (size <= 0 || size > PASSPORT_MAX_BYTES) errors.passport = "file_too_large";
    else passport = { mime, size };
  }

  requireText(errors, "foodAllergies", foodAllergies, LIMITS.foodAllergies);

  if (raw.safetyConsent !== true) errors.safetyConsent = "consent_required";

  if (!ticketId) errors.ticket = "required";
  else if (!availableTicketIds.includes(ticketId)) errors.ticket = "ticket_unavailable";

  if (vatNumber.length > LIMITS.vatNumber) errors.vatNumber = "too_long";
  else if (!vatNumber && EUROPEAN_VAT_COUNTRIES.has(organizationCountry))
    errors.vatNumber = "vat_required";

  if (invoiceId.length > LIMITS.invoiceId) errors.invoiceId = "too_long";

  const badId = !UUID_RE.test(id);
  if (Object.keys(errors).length > 0 || badId) {
    return { ok: false, errors, badId };
  }

  return {
    ok: true,
    value: {
      id,
      firstName,
      lastName,
      fullName: `${firstName} ${lastName}`,
      email,
      jobTitle,
      phone: phone || null,
      nationality: countryNameEn(nationality),
      residenceCountry: countryNameEn(residenceCountry),
      organization,
      organizationCountry: countryNameEn(organizationCountry),
      professionalCategory: professionalCategory as ProfessionalCategory,
      jobFunction: jobFunction as JobFunction,
      needsInvitationLetter: invitationLetter === "yes",
      passport,
      foodAllergies,
      optInOrganizer: raw.optInOrganizer === true,
      optInSponsors: raw.optInSponsors === true,
      ticketId,
      vatNumber: vatNumber || null,
      invoiceId: invoiceId || null,
      language,
      role: professionalCategory === "media" ? "press" : "delegate",
    },
  };
}
