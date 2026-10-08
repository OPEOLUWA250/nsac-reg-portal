import nodemailer from "nodemailer";
import { Resend } from "resend";
import { escapeHtml } from "@/lib/escape-html";
import { EVENT_INFO } from "@/lib/event-info";
import { publicBaseUrl } from "@/lib/public-url";
import { buildIcs, googleCalendarUrl, icsFilename, outlookCalendarUrl } from "@/lib/calendar";

// Every email shares one letterhead layout: a navy band with the logo and
// the dates, a thin gold rule, a white page with a left-aligned letter, a
// credential card for the registration, the entry QR code and a sign-off.
// Tables and inline styles only, so it holds up in Gmail, Outlook and phone
// mail apps. Brand colours and fonts come from DESIGN.md (email HTML can't
// read the site's CSS); clients that can't load Raleway or DM Sans fall back
// to Helvetica or Arial.

const NAVY = "#03416A";
const GOLD = "#F09F07";
// Gold text on white is too faint: labels use the darker gold.
const GOLD_INK = "#8A5300";
const INK = "#232323";
const INK_2 = "#454B52";
const INK_3 = "#5E6670";
const IVORY = "#F4F2EE";
const PANEL = "#FAF8F4";
const HAIRLINE = "#E6E1D8";
const FONT = "'DM Sans', 'Helvetica Neue', Helvetica, Arial, sans-serif";
const DISPLAY = "Raleway, 'Helvetica Neue', Helvetica, Arial, sans-serif";

export type EmailLanguage = "en" | "fr";

// Category names in the attendee's language (the form only lists some).
const CATEGORY_NAMES: Record<EmailLanguage, Record<string, string>> = {
  en: { delegate: "Delegate", speaker: "Speaker", media: "Media", exhibitor: "Exhibitor", vip: "VIP", host: "Host", staff: "Staff" },
  fr: { delegate: "Délégué(e)", speaker: "Intervenant(e)", media: "Médias", exhibitor: "Exposant(e)", vip: "VIP", host: "Hôte", staff: "Équipe" },
};

/** "vip" -> "VIP", "delegate" -> "Délégué(e)" in French; unknown ones capitalised. Not escaped. */
function categoryName(role: string, language: EmailLanguage): string {
  return CATEGORY_NAMES[language]?.[role.toLowerCase()] ?? role.charAt(0).toUpperCase() + role.slice(1);
}

const LAYOUT_COPY = {
  en: {
    category: "REGISTRATION CATEGORY",
    name: "NAME",
    dates: "DATES",
    venue: "VENUE",
    entryPass: "YOUR ENTRY PASS",
    regards: "Kind regards,",
    team: "The NewSpace Africa Conference team",
    questions: "Questions? Simply reply to this email.",
  },
  fr: {
    category: "CATÉGORIE D’INSCRIPTION",
    name: "NOM",
    dates: "DATES",
    venue: "LIEU",
    entryPass: "VOTRE ACCÈS",
    regards: "Bien cordialement,",
    team: "L’équipe de la Conférence NewSpace Africa",
    questions: "Des questions ? Répondez simplement à cet e-mail.",
  },
} as const;

// ---------- building blocks (all values must already be escaped) ----------

const eyebrow = (text: string, align = "left") =>
  `<p style="margin:0 0 12px; font-family:${FONT}; color:${GOLD_INK}; font-size:11px; font-weight:700; letter-spacing:2.5px; text-transform:uppercase; text-align:${align};">${text}</p>`;

const heading = (text: string) =>
  `<h1 style="margin:0 0 24px; font-family:${DISPLAY}; color:${NAVY}; font-size:26px; line-height:1.25; font-weight:800;">${text}</h1>`;

const para = (html: string, style = "") =>
  `<p style="margin:0 0 16px; font-family:${FONT}; color:${INK_2}; font-size:15px; line-height:1.7;${style}">${html}</p>`;

/**
 * The registration at a glance: the category large, then name, dates and
 * venue in ruled rows, on a warm panel with a gold top edge.
 */
function credentialCard({ category, name, language }: { category: string; name: string; language: EmailLanguage }): string {
  const t = LAYOUT_COPY[language];
  // Long names ("Intervenant(e)") get smaller, so they fit on a phone.
  const size = category.length > 10 ? 22 : category.length > 8 ? 26 : 30;
  const label = `font-family:${FONT}; color:${INK_3}; font-size:10px; font-weight:700; letter-spacing:1.5px;`;
  const row = (key: string, value: string) => `
          <tr>
            <td width="32%" style="padding:12px 0 12px 24px; border-top:1px solid ${HAIRLINE}; vertical-align:top; ${label}">${key}</td>
            <td style="padding:11px 24px 11px 12px; border-top:1px solid ${HAIRLINE}; vertical-align:top; font-family:${FONT}; color:${INK}; font-size:14px; font-weight:600; line-height:1.5;">${value}</td>
          </tr>`;
  return `
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 28px; background:${PANEL}; border:1px solid ${HAIRLINE}; border-top:3px solid ${GOLD}; border-collapse:collapse;">
          <tr>
            <td colspan="2" style="padding:22px 24px 18px;">
              <p style="margin:0; ${label}">${t.category}</p>
              <p style="margin:8px 0 0; font-family:${DISPLAY}; color:${NAVY}; font-size:${size}px; line-height:1.2; font-weight:800; letter-spacing:1px; text-transform:uppercase; word-break:break-word;">${category}</p>
            </td>
          </tr>${row(t.name, name)}${row(t.dates, EVENT_INFO.date[language])}${row(t.venue, EVENT_INFO.place[language])}
        </table>`;
}

/** The entry QR code in a hairline frame, with what to do with it. */
function entryPass({ text, qrAlt, note, language }: { text: string; qrAlt: string; note?: string; language: EmailLanguage }): string {
  return `
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid ${HAIRLINE};">
          <tr>
            <td style="padding:30px 0 4px; text-align:center;">
              ${eyebrow(LAYOUT_COPY[language].entryPass, "center")}
              ${para(text, " text-align:center;")}
              <table role="presentation" cellpadding="0" cellspacing="0" style="margin:6px auto 0; border:1px solid ${HAIRLINE}; background:#ffffff;">
                <tr><td style="padding:14px;"><img src="cid:checkin-qr.png" alt="${qrAlt}" width="180" height="180" style="display:block; width:180px; height:180px;" /></td></tr>
              </table>
              ${note ? `<p style="margin:14px 0 0; font-family:${FONT}; color:${INK_3}; font-size:13px; line-height:1.6;">${note}</p>` : ""}
            </td>
          </tr>
        </table>`;
}

function signOff(language: EmailLanguage): string {
  const t = LAYOUT_COPY[language];
  return `
        <p style="margin:32px 0 0; font-family:${FONT}; color:${INK_2}; font-size:15px; line-height:1.7;">${t.regards}<br /><strong style="color:${INK};">${t.team}</strong></p>`;
}

/** The letterhead page around an email's content. */
function layout({
  language,
  preheader,
  hasLogo,
  content,
  footerNote,
}: {
  language: EmailLanguage;
  preheader: string;
  hasLogo: boolean;
  content: string;
  footerNote: string;
}): string {
  const t = LAYOUT_COPY[language];
  const brand = hasLogo
    ? `<img src="cid:brand-logo.png" alt="NewSpace Africa Conference" width="140" height="52" style="display:block; width:140px; height:52px; border:0;" />`
    : `<span style="font-family:${DISPLAY}; color:#ffffff; font-size:17px; font-weight:800;">NewSpace Africa Conference</span>`;
  return `<!doctype html>
<html lang="${language}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="color-scheme" content="light" />
<meta name="supported-color-schemes" content="light" />
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;600;700&amp;family=Raleway:wght@800&amp;display=swap" rel="stylesheet" />
</head>
<body style="margin:0; padding:0; background:${IVORY};">
  <div style="display:none; max-height:0; overflow:hidden; opacity:0; color:${IVORY};">${preheader}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${IVORY};">
    <tr>
      <td align="center" style="padding:36px 12px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px; background:#ffffff; border:1px solid ${HAIRLINE};">
          <tr>
            <td style="background:${NAVY}; padding:24px 32px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="vertical-align:middle;">${brand}</td>
                  <td align="right" style="vertical-align:middle; font-family:${FONT}; color:#ffffff; font-size:11px; font-weight:700; letter-spacing:1.5px; line-height:1.7; text-transform:uppercase; text-align:right;">
                    ${EVENT_INFO.date[language]}<br /><span style="color:#B9CCDA;">${EVENT_INFO.place[language]}</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr><td style="height:3px; background:${GOLD}; font-size:1px; line-height:3px;">&nbsp;</td></tr>
          <tr>
            <td style="padding:44px 36px 40px;">
${content}
            </td>
          </tr>
        </table>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
          <tr>
            <td style="padding:24px 24px 0; text-align:center; font-family:${FONT}; color:${INK_3}; font-size:12px; line-height:1.7;">
              <strong style="color:${INK_2}; white-space:nowrap;">${escapeHtml(EVENT_INFO.name[language])}</strong> &nbsp;·&nbsp; <span style="white-space:nowrap;">${EVENT_INFO.date[language]}</span> &nbsp;·&nbsp; <span style="white-space:nowrap;">${EVENT_INFO.place[language]}</span><br />
              ${t.questions}<br />
              <span style="color:#8A929B;">${footerNote}</span>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

const logoAttachment = (logoPngBuffer: Buffer) => ({
  filename: "newspace-africa-logo.png",
  content: logoPngBuffer,
  contentType: "image/png",
  contentId: "brand-logo.png",
});

// ---------- registration confirmed ----------

const COPY = {
  en: {
    subject: (event: string) => `You're registered for the ${event}: your check-in QR code`,
    preheader: "Your place is confirmed. Your entry QR code is inside.",
    eyebrow: "Registration confirmed",
    heading: "Your place is confirmed",
    greeting: (first: string) => `Dear ${first},`,
    thanks: (event: string) =>
      `Thank you for registering for the <strong style="color:${NAVY};">${event}</strong>. We look forward to welcoming you.`,
    instructions: "Present this QR code at the registration desk, on your phone or printed. It checks you in and prints your badge.",
    qrAlt: "Your check-in QR code",
    ticketAttached: "Your ticket is also attached, ready to save or print.",
    calendar: "Add to your calendar",
    calendarAttached: "An invite is also attached.",
    flyerCta: "Create your “I’m attending” flyer for LinkedIn",
    footerNote: "You are receiving this email because you registered for the conference.",
  },
  fr: {
    subject: (event: string) => `Votre inscription à la ${event} est confirmée : votre QR code d'accès`,
    preheader: "Votre place est confirmée. Votre QR code d'accès est à l'intérieur.",
    eyebrow: "Inscription confirmée",
    heading: "Votre place est confirmée",
    greeting: (first: string) => `Bonjour ${first},`,
    thanks: (event: string) =>
      `Merci pour votre inscription à la <strong style="color:${NAVY};">${event}</strong>. Nous nous réjouissons de vous accueillir.`,
    instructions:
      "Présentez ce QR code à l'accueil, sur votre téléphone ou imprimé. Il sert à enregistrer votre arrivée et à imprimer votre badge.",
    qrAlt: "Votre QR code d'accès",
    ticketAttached: "Votre billet est également joint, pour l'enregistrer ou l'imprimer.",
    calendar: "Ajouter à votre agenda",
    calendarAttached: "Une invitation est également jointe.",
    flyerCta: "Créez votre visuel « J’y serai » pour LinkedIn",
    footerNote: "Vous recevez cet e-mail suite à votre inscription à la conférence.",
  },
} as const;

interface SendQrEmailArgs {
  toEmail: string;
  fullName: string;
  qrPngBuffer: Buffer;
  /** Branded ticket image, attached as a file when available. */
  ticketPngBuffer?: Buffer | null;
  /** White conference logo, shown in the email header when available. */
  logoPngBuffer?: Buffer | null;
  /** Link to the "I'm attending" flyer maker, shown as a button when set. */
  flyerUrl?: string | null;
  eventName?: string;
  role?: string;
  language?: EmailLanguage;
}

export async function sendQrEmail({
  toEmail,
  fullName,
  qrPngBuffer,
  ticketPngBuffer,
  logoPngBuffer,
  flyerUrl,
  eventName,
  role,
  language = "en",
}: SendQrEmailArgs) {
  const fromAddress = process.env.EMAIL_FROM;
  if (!fromAddress) {
    throw new Error("Missing EMAIL_FROM environment variable");
  }

  const t = COPY[language] ?? COPY.en;
  // The event's name in the email's language ("Conférence NewSpace Africa 2027").
  const event = eventName ?? EVENT_INFO.name[language === "fr" ? "fr" : "en"];

  // "Add to calendar" links. Apple Calendar opens the .ics from our site
  // (only when the public address is configured; the invite is attached too).
  const base = publicBaseUrl();
  const calendarLinks = [
    { label: "Google", href: googleCalendarUrl(language) },
    { label: "Outlook", href: outlookCalendarUrl(language) },
    ...(base ? [{ label: "Apple", href: `${base}/api/calendar?lang=${language}` }] : []),
  ];

  // Everything that came from a registrant is escaped before it goes into HTML.
  const firstName = escapeHtml(fullName.trim().split(/\s+/)[0] || fullName);
  const safeRole = role ? escapeHtml(categoryName(role, language)) : "";
  const link = `color:${NAVY}; font-weight:700; text-decoration:underline; text-decoration-color:${GOLD};`;

  const content = `
        ${eyebrow(t.eyebrow)}
        ${heading(t.heading)}
        ${para(t.greeting(firstName), ` color:${INK};`)}
        ${para(t.thanks(escapeHtml(event)))}
        ${safeRole ? credentialCard({ category: safeRole, name: escapeHtml(fullName.trim()), language }) : ""}
        ${entryPass({ text: t.instructions, qrAlt: t.qrAlt, note: ticketPngBuffer ? t.ticketAttached : undefined, language })}
        <p style="margin:24px 0 0; font-family:${FONT}; color:${INK_3}; font-size:13px; line-height:1.7; text-align:center;">
          ${t.calendar}: ${calendarLinks.map((l) => `<a href="${escapeHtml(l.href)}" style="${link}">${l.label}</a>`).join(" &nbsp;·&nbsp; ")}<br />${t.calendarAttached}
        </p>
        ${
          flyerUrl
            ? `<p style="margin:24px 0 0; text-align:center;"><a href="${escapeHtml(flyerUrl)}" style="display:inline-block; border:1px solid ${NAVY}; border-radius:4px; padding:12px 20px; font-family:${FONT}; color:${NAVY}; font-size:14px; font-weight:700; text-decoration:none;">${t.flyerCta}</a></p>`
            : ""
        }
        ${signOff(language)}`;

  const message: OutgoingEmail = {
    from: fromAddress,
    to: toEmail,
    subject: t.subject(event),
    attachments: [
      {
        filename: "checkin-qr.png",
        content: qrPngBuffer,
        contentType: "image/png",
        contentId: "checkin-qr.png",
      },
      ...(logoPngBuffer ? [logoAttachment(logoPngBuffer)] : []),
      ...(ticketPngBuffer
        ? [{ filename: "newspace-africa-2027-ticket.png", content: ticketPngBuffer, contentType: "image/png" }]
        : []),
      // "Add to calendar": the conference days as an .ics invite.
      { filename: icsFilename(), content: Buffer.from(buildIcs(language)), contentType: "text/calendar" },
    ],
    html: layout({ language, preheader: t.preheader, hasLogo: Boolean(logoPngBuffer), content, footerNote: t.footerNote }),
  };

  await deliver(message);
}

// ---------- student code ----------

const STUDENT_COPY = {
  en: {
    subject: (event: string) => `Your student code for the ${event}`,
    preheader: "Your personal code for the Student ticket.",
    eyebrow: "Student ticket",
    heading: "Your student code",
    greeting: (first: string) => (first ? `Dear ${first},` : "Hello,"),
    intro: "Thank you for sending your student ID. Here is your personal code for the Student ticket:",
    how: "On the registration form, choose the <strong>Student</strong> ticket on the last step and enter this code.",
    only: (email: string, until: string) =>
      `It only works with this email address (${email}) and can be used once, until ${until}.`,
    cta: "Register now",
    footerNote: "You are receiving this email because you asked for a student code.",
  },
  fr: {
    subject: (event: string) => `Votre code étudiant pour la ${event}`,
    preheader: "Votre code personnel pour le billet Étudiant.",
    eyebrow: "Billet étudiant",
    heading: "Votre code étudiant",
    greeting: (first: string) => (first ? `Bonjour ${first},` : "Bonjour,"),
    intro: "Merci de nous avoir envoyé votre carte d'étudiant. Voici votre code personnel pour le billet Étudiant :",
    how: "Sur le formulaire d'inscription, choisissez le billet <strong>Étudiant</strong> à la dernière étape et saisissez ce code.",
    only: (email: string, until: string) =>
      `Il ne fonctionne qu'avec cette adresse e-mail (${email}) et ne peut être utilisé qu'une fois, jusqu'au ${until}.`,
    cta: "S'inscrire",
    footerNote: "Vous recevez cet e-mail suite à votre demande de code étudiant.",
  },
} as const;

/** Emails a student their personal code (sent from /admin/student-codes). */
export async function sendStudentCodeEmail({
  toEmail,
  name,
  code,
  expiresAt,
  registerUrl,
  logoPngBuffer,
  language = "en",
}: {
  toEmail: string;
  name: string;
  code: string;
  expiresAt: string;
  registerUrl: string;
  logoPngBuffer?: Buffer | null;
  language?: EmailLanguage;
}) {
  const fromAddress = process.env.EMAIL_FROM;
  if (!fromAddress) throw new Error("Missing EMAIL_FROM environment variable");
  const t = STUDENT_COPY[language] ?? STUDENT_COPY.en;
  const event = EVENT_INFO.name[language === "fr" ? "fr" : "en"];
  const until = new Date(expiresAt).toLocaleDateString(language === "fr" ? "fr-FR" : "en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Africa/Lagos",
  });
  const firstName = escapeHtml(name.trim().split(/\s+/)[0] ?? "");

  const content = `
        ${eyebrow(t.eyebrow)}
        ${heading(t.heading)}
        ${para(t.greeting(firstName), ` color:${INK};`)}
        ${para(t.intro)}
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 24px; background:${PANEL}; border:1px solid ${HAIRLINE}; border-top:3px solid ${GOLD}; border-collapse:collapse;">
          <tr><td style="padding:22px 16px; text-align:center; font-family:'Courier New', Courier, monospace; color:${NAVY}; font-size:28px; font-weight:700; letter-spacing:4px;">${escapeHtml(code)}</td></tr>
        </table>
        ${para(t.how)}
        ${para(t.only(escapeHtml(toEmail), until), ` color:${INK_3}; font-size:14px;`)}
        <p style="margin:8px 0 0;"><a href="${escapeHtml(registerUrl)}" style="display:inline-block; background:${GOLD}; border-radius:4px; padding:13px 24px; font-family:${FONT}; color:#000000; font-size:15px; font-weight:700; text-decoration:none;">${t.cta}</a></p>
        ${signOff(language)}`;

  await deliver({
    from: fromAddress,
    to: toEmail,
    subject: t.subject(event),
    attachments: logoPngBuffer ? [logoAttachment(logoPngBuffer)] : [],
    html: layout({ language, preheader: t.preheader, hasLogo: Boolean(logoPngBuffer), content, footerNote: t.footerNote }),
  });
}

// ---------- category changed (from the dashboard) ----------

const CATEGORY_COPY = {
  en: {
    subject: (event: string, vip: boolean) =>
      vip ? `You're a VIP guest at the ${event}` : `Your registration category for the ${event} has changed`,
    preheader: (category: string, vip: boolean) =>
      vip ? "You are now a VIP guest. Your entry QR code is inside." : `Your registration category is now ${category}.`,
    eyebrow: (vip: boolean) => (vip ? "VIP invitation" : "Registration update"),
    heading: (vip: boolean) => (vip ? "Welcome as our VIP guest" : "Your registration category has been updated"),
    greeting: (first: string) => `Dear ${first},`,
    changed: (event: string, category: string, vip: boolean) =>
      vip
        ? `We are delighted to confirm that your registration for the <strong style="color:${NAVY};">${event}</strong> has been upgraded to <strong>VIP</strong>.`
        : `Your registration category for the <strong style="color:${NAVY};">${event}</strong> has been updated to <strong>${category}</strong>.`,
    badge: "Your badge will show your category when you check in at the registration desk.",
    qrText: "Your QR code has not changed. Present it at the registration desk, on your phone or printed.",
    qrAlt: "Your check-in QR code",
    footerNote: "You are receiving this email because you registered for the conference.",
  },
  fr: {
    subject: (event: string, vip: boolean) =>
      vip ? `Vous êtes invité(e) VIP à la ${event}` : `Votre catégorie d'inscription à la ${event} a changé`,
    preheader: (category: string, vip: boolean) =>
      vip ? "Vous êtes désormais invité(e) VIP. Votre QR code d'accès est à l'intérieur." : `Votre catégorie d'inscription est désormais ${category}.`,
    eyebrow: (vip: boolean) => (vip ? "Invitation VIP" : "Mise à jour de votre inscription"),
    heading: (vip: boolean) => (vip ? "Bienvenue parmi nos invités VIP" : "Votre catégorie d'inscription a été mise à jour"),
    greeting: (first: string) => `Bonjour ${first},`,
    changed: (event: string, category: string, vip: boolean) =>
      vip
        ? `Nous avons le plaisir de vous confirmer que votre inscription à la <strong style="color:${NAVY};">${event}</strong> passe en catégorie <strong>VIP</strong>.`
        : `Votre catégorie d'inscription à la <strong style="color:${NAVY};">${event}</strong> est désormais <strong>${category}</strong>.`,
    badge: "Votre badge indiquera votre catégorie lors de votre enregistrement à l'accueil.",
    qrText: "Votre QR code ne change pas. Présentez-le à l'accueil, sur votre téléphone ou imprimé.",
    qrAlt: "Votre QR code d'accès",
    footerNote: "Vous recevez cet e-mail suite à votre inscription à la conférence.",
  },
} as const;

/**
 * Tells an attendee an admin changed their registration category (from the
 * dashboard), with their unchanged QR code. Becoming a VIP gets its own wording.
 */
export async function sendCategoryChangeEmail({
  toEmail,
  fullName,
  role,
  qrPngBuffer,
  logoPngBuffer,
  language = "en",
}: {
  toEmail: string;
  fullName: string;
  role: string;
  qrPngBuffer: Buffer;
  logoPngBuffer?: Buffer | null;
  language?: EmailLanguage;
}) {
  const fromAddress = process.env.EMAIL_FROM;
  if (!fromAddress) throw new Error("Missing EMAIL_FROM environment variable");
  const t = CATEGORY_COPY[language] ?? CATEGORY_COPY.en;
  const vip = role === "vip";
  const event = EVENT_INFO.name[language === "fr" ? "fr" : "en"];
  const category = escapeHtml(categoryName(role, language));
  const firstName = escapeHtml(fullName.trim().split(/\s+/)[0] || fullName);

  const content = `
        ${eyebrow(t.eyebrow(vip))}
        ${heading(t.heading(vip))}
        ${para(t.greeting(firstName), ` color:${INK};`)}
        ${para(t.changed(escapeHtml(event), category, vip))}
        ${credentialCard({ category, name: escapeHtml(fullName.trim()), language })}
        ${para(t.badge, " margin-bottom:28px;")}
        ${entryPass({ text: t.qrText, qrAlt: t.qrAlt, language })}
        ${signOff(language)}`;

  await deliver({
    from: fromAddress,
    to: toEmail,
    subject: t.subject(event, vip),
    attachments: [
      { filename: "checkin-qr.png", content: qrPngBuffer, contentType: "image/png", contentId: "checkin-qr.png" },
      ...(logoPngBuffer ? [logoAttachment(logoPngBuffer)] : []),
    ],
    html: layout({ language, preheader: t.preheader(category, vip), hasLogo: Boolean(logoPngBuffer), content, footerNote: t.footerNote }),
  });
}

interface OutgoingEmail {
  from: string;
  to: string;
  subject: string;
  html: string;
  attachments: { filename: string; content: Buffer; contentType: string; contentId?: string }[];
}

// Two ways to send, chosen by environment:
//  - SMTP (e.g. the organisation's Google Workspace account) when SMTP_HOST
//    is set. Works without any DNS changes.
//  - Resend otherwise. Needs the sending domain verified at resend.com/domains.
async function deliver(message: OutgoingEmail) {
  if (process.env.SMTP_HOST) {
    const port = Number(process.env.SMTP_PORT ?? 465);
    const transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
    // Throws on failure, so a failed send is never recorded as sent.
    await transport.sendMail({
      from: message.from,
      to: message.to,
      subject: message.subject,
      html: message.html,
      attachments: message.attachments.map((a) => ({
        filename: a.filename,
        content: a.content,
        contentType: a.contentType,
        ...(a.contentId ? { cid: a.contentId } : {}),
      })),
    });
    return;
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("Missing RESEND_API_KEY (or SMTP_HOST) environment variable");
  const { error } = await new Resend(apiKey).emails.send(message);

  // The Resend SDK reports API failures in `error` rather than throwing, so
  // surface them — otherwise a failed send would be recorded as sent.
  if (error) {
    throw new Error(`Resend error: ${error.message}`);
  }
}
