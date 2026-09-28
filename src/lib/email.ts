import nodemailer from "nodemailer";
import { Resend } from "resend";
import { escapeHtml } from "@/lib/escape-html";
import { EVENT_INFO } from "@/lib/event-info";
import { buildIcs, icsFilename } from "@/lib/calendar";

// Brand colors, duplicated from globals.css — email HTML can't read CSS
// custom properties, so these are hardcoded here.
const NAVY = "#0A1A31";
// Secondary blue of the conference site (newspace.spaceinafrica.com).
const BRAND_BLUE = "#03416A";
const GOLD = "#F09F07";
const GOLD_LIGHT = "#f7c15c";
const OFFWHITE = "#FAFAF8";

export type EmailLanguage = "en" | "fr";

const COPY = {
  en: {
    subject: (event: string) => `You're registered for ${event} — your check-in QR code`,
    kicker: "Registration Portal",
    heading: "Registration confirmed",
    greeting: (first: string) => `Hi ${first},`,
    thanks: (event: string) =>
      `Thanks for registering for <strong style="color:${NAVY};">${event}</strong>. Your spot is confirmed.`,
    instructions:
      "Bring the QR code below (digital or printed) to the registration desk on the day of the event — it will be scanned to check you in and print your badge.",
    qrAlt: "Your check-in QR code",
    ticketAttached: "Your ticket is also attached to this email, ready to save or print.",
    calendarAttached: "Open the attached calendar invite to add the conference dates to your calendar.",
    flyerCta: "Create your “I’m attending” flyer for LinkedIn",
    footer: "Questions? Just reply to this email.",
  },
  fr: {
    subject: (event: string) => `Votre inscription à ${event} est confirmée — votre QR code d'accès`,
    kicker: "Portail d'inscription",
    heading: "Inscription confirmée",
    greeting: (first: string) => `Bonjour ${first},`,
    thanks: (event: string) =>
      `Merci pour votre inscription à <strong style="color:${NAVY};">${event}</strong>. Votre place est confirmée.`,
    instructions:
      "Présentez le QR code ci-dessous (sur votre téléphone ou imprimé) à l'accueil le jour de l'événement : il sera scanné pour enregistrer votre arrivée et imprimer votre badge.",
    qrAlt: "Votre QR code d'accès",
    ticketAttached: "Votre billet est aussi joint à cet e-mail, à enregistrer ou imprimer.",
    calendarAttached: "Ouvrez l'invitation jointe pour ajouter les dates de la conférence à votre agenda.",
    flyerCta: "Créez votre visuel « J’y serai » pour LinkedIn",
    footer: "Des questions ? Répondez simplement à cet e-mail.",
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
  eventName = "NewSpace Africa Conference",
  role,
  language = "en",
}: SendQrEmailArgs) {
  const fromAddress = process.env.EMAIL_FROM;
  if (!fromAddress) {
    throw new Error("Missing EMAIL_FROM environment variable");
  }

  const t = COPY[language] ?? COPY.en;

  // Everything that came from a registrant is escaped before it goes into HTML.
  const firstName = escapeHtml(fullName.trim().split(/\s+/)[0] || fullName);
  const safeEvent = escapeHtml(eventName);
  const safeRole = role ? escapeHtml(role) : "";
  const font = "Helvetica, Arial, 'Segoe UI', sans-serif";

  const message: OutgoingEmail = {
    from: fromAddress,
    to: toEmail,
    subject: t.subject(eventName),
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
<body style="margin:0; padding:32px 16px; background:${OFFWHITE}; font-family:${font};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px; margin:0 auto; background:#ffffff; border:1px solid rgba(10,26,49,0.08); border-radius:16px; overflow:hidden;">
    <tr>
      <td style="background:${NAVY}; background-image:linear-gradient(135deg, ${NAVY} 0%, ${BRAND_BLUE} 100%); padding:28px 32px; text-align:center;">
        ${
          logoPngBuffer
            ? `<img src="cid:brand-logo.png" alt="NewSpace Africa Conference" width="170" height="63" style="display:block; margin:0 auto 12px; width:170px; height:63px;" />`
            : `<div style="color:#ffffff; font-size:20px; font-weight:700; letter-spacing:0.5px; margin-bottom:6px;">NewSpace Africa</div>`
        }
        <div style="color:${GOLD_LIGHT}; font-size:11px; font-weight:700; letter-spacing:3px; text-transform:uppercase;">
          ${t.kicker}
        </div>
      </td>
    </tr>
    <tr>
      <td style="padding:36px 32px 8px; text-align:center;">
        <div style="display:inline-block; width:40px; height:4px; background:${GOLD}; border-radius:2px; margin-bottom:20px;"></div>
        <h1 style="margin:0 0 16px; color:${NAVY}; font-size:22px; font-weight:700;">
          ${t.heading}
        </h1>
        <p style="margin:0 0 4px; color:${NAVY}; font-size:15px; line-height:1.6;">
          ${t.greeting(firstName)}
        </p>
        <p style="margin:0 0 4px; color:rgba(10,26,49,0.7); font-size:15px; line-height:1.6;">
          ${t.thanks(safeEvent)}
        </p>
        <p style="margin:14px 0 4px; color:${NAVY}; font-size:15px; font-weight:700; line-height:1.6;">
          ${EVENT_INFO.date[language]} &nbsp;·&nbsp; ${EVENT_INFO.place[language]}
        </p>
        ${
          safeRole
            ? `<div style="margin:16px 0 4px;">
                <span style="display:inline-block; background:rgba(240,159,7,0.12); border:1px solid rgba(240,159,7,0.4); color:${NAVY}; font-size:11px; font-weight:700; letter-spacing:1px; text-transform:uppercase; padding:6px 14px; border-radius:999px;">
                  ${safeRole}
                </span>
              </div>`
            : ""
        }
      </td>
    </tr>
    <tr>
      <td style="padding:20px 32px 8px; text-align:center;">
        <p style="margin:0 0 20px; color:rgba(10,26,49,0.7); font-size:14px; line-height:1.6;">
          ${t.instructions}
        </p>
        <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto; background:${OFFWHITE}; border:1px solid rgba(10,26,49,0.1); border-radius:12px;">
          <tr>
            <td style="padding:18px;">
              <img src="cid:checkin-qr.png" alt="${t.qrAlt}" width="200" height="200" style="display:block; width:200px; height:200px;" />
            </td>
          </tr>
        </table>
        ${
          ticketPngBuffer
            ? `<p style="margin:18px 0 0; color:rgba(10,26,49,0.55); font-size:13px; line-height:1.6;">${t.ticketAttached}</p>`
            : ""
        }
        <p style="margin:8px 0 0; color:rgba(10,26,49,0.55); font-size:13px; line-height:1.6;">${t.calendarAttached}</p>
        ${
          flyerUrl
            ? `<p style="margin:24px 0 0;"><a href="${escapeHtml(flyerUrl)}" style="display:inline-block; background:${GOLD}; color:${NAVY}; font-size:14px; font-weight:700; text-decoration:none; padding:12px 22px; border-radius:999px;">${t.flyerCta}</a></p>`
            : ""
        }
      </td>
    </tr>
    <tr>
      <td style="padding:28px 32px 32px; text-align:center; border-top:1px solid rgba(10,26,49,0.08); margin-top:24px;">
        <p style="margin:20px 0 0; color:rgba(10,26,49,0.45); font-size:12px; letter-spacing:0.5px; text-transform:uppercase;">
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
