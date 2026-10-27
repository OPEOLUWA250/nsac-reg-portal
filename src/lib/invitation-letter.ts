import { EVENT_INFO } from "@/lib/event-info";
import type { Attendee } from "@/lib/types";

// Visa invitation letters: what an admin fills in before sending one (from
// the dashboard, never automatically) and the wording of the letter, in
// English or French. The PDF is drawn by src/lib/server/invitation-letter-pdf.ts
// and emailed by sendInvitationLetterEmail (src/lib/email.ts).

export type LetterLanguage = "en" | "fr";

/** What the admin types or picks in the preview. */
export interface LetterInput {
  /** Replies go here, and the letter gives it as the contact. */
  senderEmail: string;
  /** Who signs the letter. */
  signatoryName: string;
  signatoryTitle: string | null;
  /** Typed from the passport so the consulate can match the two. */
  passportNumber: string | null;
  language: LetterLanguage;
  /** A copy of the email to the sender, for their records. */
  copyToSender: boolean;
}

export const LETTER_LIMITS = { email: 254, name: 100, title: 120, passport: 20 } as const;

export type LetterFieldErrors = Partial<Record<keyof LetterInput, string>>;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const text = (v: unknown) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ") : "");

export function parseLetterInput(body: Record<string, unknown>): { value: LetterInput } | { fields: LetterFieldErrors } {
  const fields: LetterFieldErrors = {};
  const senderEmail = text(body.senderEmail).toLowerCase();
  const signatoryName = text(body.signatoryName);
  const signatoryTitle = text(body.signatoryTitle);
  // Passport numbers are letters and digits; spaces typed by habit are dropped.
  const passportNumber = text(body.passportNumber).replace(/\s/g, "").toUpperCase();
  const language = body.language === "fr" ? "fr" : body.language === "en" || body.language === undefined ? "en" : null;

  if (!senderEmail) fields.senderEmail = "Enter the email address replies should go to.";
  else if (!EMAIL_RE.test(senderEmail) || senderEmail.length > LETTER_LIMITS.email) fields.senderEmail = "This doesn't look like an email address.";
  if (!signatoryName) fields.signatoryName = "Enter the name of the person signing the letter.";
  else if (signatoryName.length > LETTER_LIMITS.name) fields.signatoryName = `Keep it under ${LETTER_LIMITS.name} characters.`;
  if (signatoryTitle.length > LETTER_LIMITS.title) fields.signatoryTitle = `Keep it under ${LETTER_LIMITS.title} characters.`;
  if (passportNumber && !/^[A-Z0-9-]{4,20}$/.test(passportNumber)) fields.passportNumber = "Use the letters and numbers as printed on the passport.";
  if (!language) fields.language = "Choose English or French.";

  if (Object.keys(fields).length) return { fields };
  return {
    value: {
      senderEmail,
      signatoryName,
      signatoryTitle: signatoryTitle || null,
      passportNumber: passportNumber || null,
      language: language!,
      copyToSender: body.copyToSender !== false,
    },
  };
}

// ---------- the letter ----------

export type LetterAttendee = Pick<
  Attendee,
  "id" | "full_name" | "nationality" | "residence_country" | "organization" | "job_title" | "role" | "registration_number"
>;

export interface LetterContent {
  language: LetterLanguage;
  reference: string;
  date: string;
  recipient: string[];
  subject: string;
  salutation: string;
  intro: string;
  /** The person invited, as label/value rows. */
  details: [string, string][];
  paragraphs: string[];
  closing: string;
  signatoryName: string;
  signatoryTitle: string | null;
  onBehalf: string;
  footer: string;
}

const CATEGORY: Record<LetterLanguage, Record<string, string>> = {
  en: { delegate: "Delegate", speaker: "Speaker", media: "Media", exhibitor: "Exhibitor", vip: "VIP guest", host: "Host", staff: "Staff" },
  fr: { delegate: "Délégué(e)", speaker: "Intervenant(e)", media: "Médias", exhibitor: "Exposant(e)", vip: "Invité(e) VIP", host: "Hôte", staff: "Équipe" },
};

const COPY = {
  en: {
    ref: "Ref.",
    recipient: ["To the Visa Section", "Embassy or Consulate of the Republic of Senegal"],
    subject: `Invitation letter: ${EVENT_INFO.name.en}, ${EVENT_INFO.place.en}, ${EVENT_INFO.date.en}`,
    salutation: "Dear Sir or Madam,",
    intro: `We are pleased to invite the person named below to attend the ${EVENT_INFO.name.en}, which takes place ${EVENT_INFO.dateInSentence.en} in Dakar, Senegal.`,
    labels: {
      name: "Full name",
      nationality: "Nationality",
      passport: "Passport number",
      position: "Position",
      organisation: "Organisation",
      residence: "Country of residence",
      category: "Registration category",
      number: "Registration number",
    },
    about:
      "The NewSpace Africa Conference is the leading gathering of Africa's space industry. It brings together space agencies, governments, companies, investors and researchers from across the continent and beyond. The 2027 edition is organised by Space in Africa and the African Space Agency (AfSA), and hosted by the Ministry of Higher Education, Research and Innovation (MESRI) of the Republic of Senegal.",
    purpose: "This letter is issued at the attendee's request, to support their application for a visa to enter Senegal.",
    costs:
      "This invitation does not commit the organisers to any financial obligation. Travel, accommodation, insurance, living expenses and all other costs remain the responsibility of the attendee or their organisation.",
    contact: (email: string) => `For any question about this invitation, please write to us at ${email}.`,
    closing: "Yours faithfully,",
    onBehalf: `On behalf of the organising committee, ${EVENT_INFO.name.en}`,
  },
  fr: {
    ref: "Réf.",
    recipient: ["À l'attention de la section des visas", "Ambassade ou consulat de la République du Sénégal"],
    subject: `Lettre d'invitation : ${EVENT_INFO.name.fr}, ${EVENT_INFO.place.fr}, ${EVENT_INFO.date.fr}`,
    salutation: "Madame, Monsieur,",
    intro: `Nous avons le plaisir d'inviter la personne désignée ci-dessous à participer à la ${EVENT_INFO.name.fr}, qui se tiendra ${EVENT_INFO.dateInSentence.fr} à Dakar, au Sénégal.`,
    labels: {
      name: "Nom complet",
      nationality: "Nationalité",
      passport: "Numéro de passeport",
      position: "Fonction",
      organisation: "Organisation",
      residence: "Pays de résidence",
      category: "Catégorie d'inscription",
      number: "Numéro d'inscription",
    },
    about:
      "La Conférence NewSpace Africa est le principal rendez-vous de l'industrie spatiale africaine. Elle réunit agences spatiales, gouvernements, entreprises, investisseurs et chercheurs du continent et d'ailleurs. L'édition 2027 est organisée par Space in Africa et l'Agence spatiale africaine (AfSA), et accueillie par le ministère de l'Enseignement supérieur, de la Recherche et de l'Innovation (MESRI) de la République du Sénégal.",
    purpose: "Cette lettre est délivrée à la demande de la personne invitée, à l'appui de sa demande de visa pour entrer au Sénégal.",
    costs:
      "Cette invitation n'engage les organisateurs à aucune obligation financière. Les frais de voyage, d'hébergement, d'assurance, de séjour et tous les autres frais restent à la charge de la personne invitée ou de son organisation.",
    contact: (email: string) => `Pour toute question concernant cette invitation, veuillez nous écrire à ${email}.`,
    closing: "Veuillez agréer, Madame, Monsieur, l'expression de nos salutations distinguées.",
    onBehalf: `Pour le comité d'organisation de la ${EVENT_INFO.name.fr}`,
  },
} as const;

/** "NSAC27-INV-0134" (registration number), or the start of the id before there is one. */
export function letterReference(a: Pick<Attendee, "id" | "registration_number">): string {
  return `NSAC27-INV-${a.registration_number != null ? String(a.registration_number).padStart(4, "0") : a.id.slice(0, 8).toUpperCase()}`;
}

export function buildLetter(a: LetterAttendee, input: LetterInput, today = new Date()): LetterContent {
  const language = input.language;
  const t = COPY[language];
  const l = t.labels;
  const category = CATEGORY[language][a.role.toLowerCase()] ?? a.role.charAt(0).toUpperCase() + a.role.slice(1);
  const rows: [string, string | null | undefined][] = [
    [l.name, a.full_name.trim()],
    [l.nationality, a.nationality],
    [l.passport, input.passportNumber],
    [l.position, a.job_title],
    [l.organisation, a.organization],
    [l.residence, a.residence_country],
    [l.category, category],
    [l.number, a.registration_number != null ? String(a.registration_number) : null],
  ];
  return {
    language,
    reference: `${t.ref} ${letterReference(a)}`,
    date: today.toLocaleDateString(language === "fr" ? "fr-FR" : "en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Africa/Dakar" }),
    recipient: [...t.recipient],
    subject: t.subject,
    salutation: t.salutation,
    intro: t.intro,
    details: rows.filter((r): r is [string, string] => !!r[1]?.trim()).map(([k, v]) => [k, v.trim()]),
    paragraphs: [t.about, t.purpose, t.costs, t.contact(input.senderEmail)],
    closing: t.closing,
    signatoryName: input.signatoryName,
    signatoryTitle: input.signatoryTitle,
    onBehalf: t.onBehalf,
    footer: `${EVENT_INFO.name[language]} · ${EVENT_INFO.date[language]} · ${EVENT_INFO.place[language]} · ${EVENT_INFO.website}`,
  };
}

/** "invitation-letter-134-ada-obi.pdf". */
export function letterFilename(a: Pick<Attendee, "id" | "full_name" | "registration_number">): string {
  const slug =
    a.full_name
      .normalize("NFKD")
      .replace(/\p{M}/gu, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 50) || "attendee";
  return `invitation-letter-${a.registration_number ?? a.id.slice(0, 8)}-${slug}.pdf`;
}
