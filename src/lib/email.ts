import { Resend } from "resend";
import { escapeHtml } from "@/lib/escape-html";

// Brand colors, duplicated from globals.css — email HTML can't read CSS
// custom properties, so these are hardcoded here.
const NAVY = "#0A1A31";
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
    footer: "Des questions ? Répondez simplement à cet e-mail.",
  },
} as const;

interface SendQrEmailArgs {
  toEmail: string;
  fullName: string;
  qrPngBuffer: Buffer;
  eventName?: string;
  role?: string;
  language?: EmailLanguage;
}

export async function sendQrEmail({
  toEmail,
  fullName,
  qrPngBuffer,
  eventName = "NewSpace Africa Conference",
  role,
  language = "en",
}: SendQrEmailArgs) {
  const apiKey = process.env.RESEND_API_KEY;
  const fromAddress = process.env.EMAIL_FROM;

  if (!apiKey || !fromAddress) {
    throw new Error("Missing RESEND_API_KEY or EMAIL_FROM environment variables");
  }

  const resend = new Resend(apiKey);
  const t = COPY[language] ?? COPY.en;

  // Everything that came from a registrant is escaped before it goes into HTML.
  const firstName = escapeHtml(fullName.trim().split(/\s+/)[0] || fullName);
  const safeEvent = escapeHtml(eventName);
  const safeRole = role ? escapeHtml(role) : "";
  const font = "Helvetica, Arial, 'Segoe UI', sans-serif";

  const { error } = await resend.emails.send({
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
    ],
    html: `
<body style="margin:0; padding:32px 16px; background:${OFFWHITE}; font-family:${font};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px; margin:0 auto; background:#ffffff; border:1px solid rgba(10,26,49,0.08); border-radius:16px; overflow:hidden;">
    <tr>
      <td style="background:${NAVY}; padding:28px 32px; text-align:center;">
        <div style="color:${GOLD_LIGHT}; font-size:11px; font-weight:700; letter-spacing:3px; text-transform:uppercase; margin-bottom:6px;">
          ${t.kicker}
        </div>
        <div style="color:#ffffff; font-size:20px; font-weight:700; letter-spacing:0.5px;">
          NewSpace Africa
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
  });

  // The Resend SDK reports API failures in `error` rather than throwing, so
  // surface them — otherwise a failed send would be recorded as sent.
  if (error) {
    throw new Error(`Resend error: ${error.message}`);
  }
}
