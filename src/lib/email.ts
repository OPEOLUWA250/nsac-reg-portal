import nodemailer from "nodemailer";
import { Resend } from "resend";
import { escapeHtml } from "@/lib/escape-html";
import { EVENT_INFO } from "@/lib/event-info";
import { publicBaseUrl } from "@/lib/public-url";
import { buildIcs, googleCalendarUrl, icsFilename, outlookCalendarUrl } from "@/lib/calendar";

// Brand colours (the conference website's blue and gold), duplicated from
// globals.css: email HTML can't read CSS custom properties.
const BLUE = "#03416A";
const GOLD = "#F09F07";
const INK = "#232323";
const INK_2 = "#454B52";
const INK_3 = "#5E6670";
const LINE = "#D8DCE0";
const CANVAS = "#F5F5F5";

export type EmailLanguage = "en" | "fr";

const COPY = {
  en: {
    subject: (event: string) => `You're registered for the ${event}: your check-in QR code`,
    heading: "Registration confirmed",
    category: "YOUR REGISTRATION CATEGORY",
    categoryNote: "Your place at NewSpace Africa 2027",
    greeting: (first: string) => `Hi ${first},`,
    thanks: (event: string) =>
      `Thank you for registering for the <strong style="color:${BLUE};">${event}</strong>. Your place is confirmed.`,
    instructions:
      "Bring the QR code below, on your phone or printed, to the registration desk. It is scanned to check you in and print your badge.",
    qrAlt: "Your check-in QR code",
    ticketAttached: "Your ticket is also attached to this email, ready to save or print.",
    calendarTitle: "Add the conference to your calendar",
    calendarAttached: "A calendar invite is also attached to this email.",
    flyerCta: "Create your “I’m attending” flyer for LinkedIn",
    footer: "Questions? Just reply to this email.",
  },
  fr: {
    subject: (event: string) => `Votre inscription à la ${event} est confirmée\u00a0: votre QR code d'accès`,
    heading: "Inscription confirmée",
    category: "VOTRE CATÉGORIE D’INSCRIPTION",
    categoryNote: "Votre place à NewSpace Africa 2027",
    greeting: (first: string) => `Bonjour ${first},`,
    thanks: (event: string) =>
      `Merci pour votre inscription à la <strong style="color:${BLUE};">${event}</strong>. Votre place est confirmée.`,
    instructions:
      "Présentez le QR code ci-dessous, sur votre téléphone ou imprimé, à l'accueil. Il sera scanné pour enregistrer votre arrivée et imprimer votre badge.",
    qrAlt: "Votre QR code d'accès",
    ticketAttached: "Votre billet est également joint à cet e-mail, pour l'enregistrer ou l'imprimer.",
    calendarTitle: "Ajoutez la conférence à votre agenda",
    calendarAttached: "Une invitation d'agenda est également jointe à cet e-mail.",
    flyerCta: "Créez votre visuel «\u00a0J’y serai\u00a0» pour LinkedIn",
    footer: "Des questions\u00a0? Répondez simplement à cet e-mail.",
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

  // "Add to calendar" buttons. Apple Calendar opens the .ics from our site
  // (only when the public address is configured; the invite is attached too).
  const base = publicBaseUrl();
  const calendarButtons = [
    { label: "Google", href: googleCalendarUrl(language) },
    { label: "Outlook", href: outlookCalendarUrl(language) },
    ...(base ? [{ label: "Apple", href: `${base}/api/calendar?lang=${language}` }] : []),
  ];

  // Everything that came from a registrant is escaped before it goes into HTML.
  const firstName = escapeHtml(fullName.trim().split(/\s+/)[0] || fullName);
  const safeEvent = escapeHtml(event);
  const safeRole = role ? escapeHtml(role) : "";
  const font = "'DM Sans', Helvetica, Arial, 'Segoe UI', sans-serif";

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
      ...(logoPngBuffer
        ? [{ filename: "newspace-africa-logo.png", content: logoPngBuffer, contentType: "image/png", contentId: "brand-logo.png" }]
        : []),
      ...(ticketPngBuffer
        ? [{ filename: "newspace-africa-2027-ticket.png", content: ticketPngBuffer, contentType: "image/png" }]
        : []),
      // "Add to calendar": the conference days as an .ics invite.
      { filename: icsFilename(), content: Buffer.from(buildIcs(language)), contentType: "text/calendar" },
    ],
    html: `
<body style="margin:0; padding:32px 16px; background:${CANVAS}; font-family:${font}; color:${INK};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px; margin:0 auto; background:#ffffff; border:1px solid ${LINE}; border-radius:8px; overflow:hidden;">
    <tr>
      <td style="background:${BLUE}; padding:24px 32px; text-align:center;">
        ${
          logoPngBuffer
            ? `<img src="cid:brand-logo.png" alt="NewSpace Africa Conference" width="170" height="63" style="display:block; margin:0 auto; width:170px; height:63px;" />`
            : `<div style="color:#ffffff; font-size:20px; font-weight:700;">NewSpace Africa Conference</div>`
        }
      </td>
    </tr>
    <tr>
      <td style="padding:32px 32px 8px; text-align:center;">
        <h1 style="margin:0 0 16px; color:${BLUE}; font-size:24px; font-weight:800;">
          ${t.heading}
        </h1>
        <p style="margin:0 0 4px; color:${INK}; font-size:16px; line-height:1.6;">
          ${t.greeting(firstName)}
        </p>
        <p style="margin:0 0 4px; color:${INK_2}; font-size:16px; line-height:1.6;">
          ${t.thanks(safeEvent)}
        </p>
        <p style="margin:14px 0 4px; color:${BLUE}; font-size:16px; font-weight:700; line-height:1.6;">
          ${EVENT_INFO.date[language]} &nbsp;·&nbsp; ${EVENT_INFO.place[language]}
        </p>
        ${
          safeRole
            ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0 8px; background:${BLUE}; border-radius:10px; border:1px solid ${BLUE};">
                <tr><td style="height:5px; background:${GOLD}; border-radius:10px 10px 0 0; font-size:1px; line-height:5px;">&nbsp;</td></tr>
                <tr><td style="padding:22px 16px; text-align:center;">
                  <p style="margin:0 0 10px; color:${GOLD}; font-size:11px; font-weight:700; letter-spacing:2px;">${t.category}</p>
                  <p style="margin:0; color:#ffffff; font-size:28px; line-height:1.3; font-weight:800; letter-spacing:2px; text-transform:uppercase;">${safeRole}</p>
                  <p style="margin:10px 0 0; color:#ffffff; font-size:13px; line-height:1.5;">${t.categoryNote}</p>
                </td></tr>
              </table>`
            : ""
        }
      </td>
    </tr>
    <tr>
      <td style="padding:20px 32px 8px; text-align:center;">
        <p style="margin:0 0 20px; color:${INK_2}; font-size:15px; line-height:1.6;">
          ${t.instructions}
        </p>
        <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto; background:#ffffff; border:1px solid ${LINE}; border-radius:8px;">
          <tr>
            <td style="padding:16px;">
              <img src="cid:checkin-qr.png" alt="${t.qrAlt}" width="200" height="200" style="display:block; width:200px; height:200px;" />
            </td>
          </tr>
        </table>
        ${
          ticketPngBuffer
            ? `<p style="margin:18px 0 0; color:${INK_3}; font-size:14px; line-height:1.6;">${t.ticketAttached}</p>`
            : ""
        }
        <p style="margin:26px 0 10px; color:${BLUE}; font-size:14px; font-weight:700;">${t.calendarTitle}</p>
        <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;">
          <tr>
            ${calendarButtons
              .map(
                (b) =>
                  `<td style="padding:0 4px;"><a href="${escapeHtml(b.href)}" style="display:inline-block; border:1px solid ${BLUE}; border-radius:6px; padding:10px 16px; color:${BLUE}; font-size:14px; font-weight:700; text-decoration:none; white-space:nowrap;">${b.label}</a></td>`
              )
              .join("")}
          </tr>
        </table>
        <p style="margin:8px 0 0; color:${INK_3}; font-size:13px; line-height:1.6;">${t.calendarAttached}</p>
        ${
          flyerUrl
            ? `<p style="margin:24px 0 0;"><a href="${escapeHtml(flyerUrl)}" style="display:inline-block; background:${GOLD}; color:#000000; font-size:15px; font-weight:700; text-decoration:none; padding:13px 22px; border-radius:6px;">${t.flyerCta}</a></p>`
            : ""
        }
      </td>
    </tr>
    <tr>
      <td style="padding:24px 32px 28px; text-align:center;">
        <p style="margin:16px 0 0; padding-top:20px; border-top:1px solid ${LINE}; color:${INK_3}; font-size:13px;">
          ${t.footer}
        </p>
      </td>
    </tr>
  </table>
</body>
    `,
  };

  await deliver(message);
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
