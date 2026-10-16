import { escapeHtml } from "@/lib/escape-html";
import { categoryLabel, jobFunctionLabel, money, paymentLabel } from "@/lib/admin-format";
import { roleAccent, roleLabel } from "@/lib/role-style";
import type { Attendee } from "@/lib/types";

// The "new registration" alert to the organisers, in the admin dashboard's
// design (DESIGN.md, AttendeeDrawer.tsx): a card with the brand logo on a
// blue band, the registrant's name, category and payment, then the drawer's
// white section cards. Blue and greys only: no gold. Not the attendee
// letterhead in email.ts. Tables and inline styles only, for Gmail, Outlook
// and phone mail apps.

// The dashboard's tokens (src/app/globals.css, DESIGN.md).
const C = {
  canvas: "#F5F5F5",
  surface: "#FFFFFF",
  line: "#D8DCE0",
  lineStrong: "#858F99",
  ink: "#232323",
  ink2: "#454B52",
  ink3: "#5E6670",
  blue: "#03416A",
  success: "#1D6B43",
  danger: "#B42318",
  // white/65 on blue, as a solid colour (Outlook ignores rgba).
  onBlue65: "#A7BCCB",
};
const SANS = "'DM Sans', Arial, Helvetica, sans-serif";
const DISPLAY = "Raleway, Arial, Helvetica, sans-serif";

/** Content id of the logo attachment (see logoAttachment in email.ts). */
export const ADMIN_EMAIL_LOGO_CID = "brand-logo.png";

type Value = string | null | undefined;

function dotMark(color: string): string {
  return `<span style="display:inline-block; width:8px; height:8px; margin:0 6px 1px 0; border-radius:4px; background:${color}; vertical-align:middle;"></span>`;
}

/** A Chip from ui.tsx: white, 1px border, 4px corners, coloured dot. */
function chip(label: string, dot: string): string {
  return `<span style="display:inline-block; margin:0 6px 6px 0; padding:2px 8px; background:${C.surface}; border:1px solid ${C.line}; border-radius:4px; font-family:${SANS}; color:${C.ink}; font-size:12px; font-weight:600; line-height:18px; white-space:nowrap;">${dotMark(dot)}${escapeHtml(label)}</span>`;
}

const link = (href: string, text: string) =>
  `<a href="${escapeHtml(href)}" style="color:${C.blue}; text-decoration:underline; word-break:break-word;">${escapeHtml(text)}</a>`;

/**
 * A drawer Section: title in small caps, then label / value rows with 1px
 * dividers. `html` values are already escaped; empty rows are left out.
 */
function section(title: string, rows: [string, Value, "html"?][]): string {
  const shown = rows.filter(([, value]) => value != null && value !== "");
  if (shown.length === 0) return "";
  const body = shown
    .map(([label, value, kind], i) => {
      const rule = i === 0 ? "" : `border-top:1px solid ${C.line};`;
      const html = kind === "html" ? value! : escapeHtml(value!).replace(/\n/g, "<br />");
      return `
                <tr>
                  <td class="row-label" width="160" style="width:160px; padding:10px 12px 10px 0; ${rule} vertical-align:top; font-family:${SANS}; color:${C.ink3}; font-size:14px; line-height:20px;">${escapeHtml(label)}</td>
                  <td class="row-value" style="padding:10px 0; ${rule} vertical-align:top; font-family:${SANS}; color:${C.ink}; font-size:14px; line-height:20px; word-break:break-word;">${html}</td>
                </tr>`;
    })
    .join("");
  return `
          <tr><td style="padding:16px 0 0;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.surface}; border:1px solid ${C.line}; border-radius:8px; border-collapse:separate;">
              <tr><td class="pad" style="padding:16px 20px 4px; font-family:${SANS}; color:${C.ink3}; font-size:12px; font-weight:600; letter-spacing:0.05em; text-transform:uppercase;">${escapeHtml(title)}</td></tr>
              <tr><td class="pad" style="padding:0 20px 8px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${body}
                </table>
              </td></tr>
            </table>
          </td></tr>`;
}

/** "14 Oct 2026, 20:42 WAT": the organisers work from Lagos. */
function lagosTime(iso: string | null): string | null {
  if (!iso) return null;
  const time = new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Africa/Lagos",
  });
  return `${time} WAT`;
}

export interface AdminRegistrationEmail {
  subject: string;
  html: string;
}

export function buildAdminRegistrationEmail({
  attendee: a,
  ticketName,
  passportUploaded,
  dashboardUrl,
  hasLogo = false,
}: {
  attendee: Attendee;
  ticketName: string;
  /** Whether the passport file actually arrived in storage. */
  passportUploaded: boolean;
  dashboardUrl?: string | null;
  /** The white logo is attached as ADMIN_EMAIL_LOGO_CID. */
  hasLogo?: boolean;
}): AdminRegistrationEmail {
  const name = a.full_name.trim();
  const amount = a.amount_cents ? money(a.amount_cents, a.currency) : "Free";
  const role = roleLabel(a.role);
  const subtitle = [a.job_title, a.organization].filter(Boolean).join(" · ");
  const when = lagosTime(a.paid_at ?? a.created_at);
  const paymentDot =
    a.source === "walk_in" ? C.lineStrong : a.payment_status === "paid" ? C.success : a.payment_status === "pending" ? C.danger : C.lineStrong;
  const passport = passportUploaded
    ? `${dotMark(C.success)}Uploaded`
    : `${dotMark(C.danger)}Not received. Email them to collect it.`;

  const brand = hasLogo
    ? `<img src="cid:${ADMIN_EMAIL_LOGO_CID}" alt="NewSpace Africa Conference" width="140" height="52" style="display:block; width:140px; height:52px; border:0;" />`
    : `<span style="font-family:${DISPLAY}; color:#ffffff; font-size:17px; font-weight:700;">NewSpace Africa Conference</span>`;

  const sections = [
    section("Contact", [
      ["Email", link(`mailto:${a.email}`, a.email), "html"],
      ["Phone", a.phone ? link(`tel:${a.phone.replace(/\s/g, "")}`, a.phone) : null, "html"],
      ["Language", a.language === "fr" ? "French" : "English"],
    ]),
    section("Professional", [
      ["Job title", a.job_title],
      ["Organisation", a.organization],
      ["Organisation country", a.organization_country],
      ["Professional category", categoryLabel(a.professional_category)],
      ["Job function", jobFunctionLabel(a.job_function)],
    ]),
    section("Travel and logistics", [
      ["Nationality", a.nationality],
      ["Country of residence", a.residence_country],
      ["Passport", passport, "html"],
      ["Invitation letter", a.needs_invitation_letter == null ? null : a.needs_invitation_letter ? "Needed" : "Not needed"],
      ["Food allergies", a.food_allergies],
    ]),
    section("Ticket and payment", [
      ["Ticket", ticketName],
      ["Amount", amount],
      ["Promo code", a.promo_code],
      ["Paid at", lagosTime(a.paid_at)],
      ["VAT number", a.vat_number],
      ["Invoice ID", a.invoice_reference],
    ]),
  ].join("");

  // The dashboard's secondary button: brand blue, white text.
  const button = dashboardUrl
    ? `
                <table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:14px;">
                  <tr><td style="background:${C.blue}; border-radius:6px;"><a href="${escapeHtml(dashboardUrl)}" style="display:inline-block; padding:11px 20px; font-family:${SANS}; color:#ffffff; font-size:14px; font-weight:600; line-height:20px; text-decoration:none;">Open the dashboard</a></td></tr>
                </table>`
    : "";

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="color-scheme" content="light" />
<meta name="supported-color-schemes" content="light" />
<title>New registration</title>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;600;700&amp;family=Raleway:wght@700&amp;display=swap" rel="stylesheet" />
<style>
  /* Phones: narrower padding, labels above values, as in the drawer. */
  @media (max-width: 480px) {
    .page { padding: 16px 12px !important; }
    .pad { padding-left: 16px !important; padding-right: 16px !important; }
    .row-label, .row-value { display: block !important; width: auto !important; }
    .row-label { padding: 10px 0 2px !important; }
    .row-value { padding: 0 0 10px !important; border-top: 0 !important; }
  }
</style>
</head>
<body style="margin:0; padding:0; background:${C.canvas};">
  <div style="display:none; max-height:0; overflow:hidden; opacity:0;">${escapeHtml(`${role}, ${ticketName}, ${amount}`)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.canvas};">
    <tr>
      <td class="page" align="center" style="padding:24px 16px 32px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:576px;">
          <tr><td>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.surface}; border:1px solid ${C.line}; border-radius:8px; border-collapse:separate;">
              <tr>
                <td class="pad" style="padding:20px 20px; background:${C.blue}; border-radius:7px 7px 0 0;">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td style="vertical-align:middle;">${brand}</td>
                      <td align="right" style="vertical-align:middle; font-family:${SANS}; color:${C.onBlue65}; font-size:12px; font-weight:600; letter-spacing:0.05em; text-transform:uppercase; white-space:nowrap;">Registration alert</td>
                    </tr>
                  </table>
                </td>
              </tr>
              <tr><td class="pad" style="padding:20px 20px 20px;">
                <p style="margin:0; font-family:${SANS}; color:${C.ink3}; font-size:13px; line-height:20px;">New registration${when ? ` · ${escapeHtml(when)}` : ""}</p>
                <h1 style="margin:6px 0 0; font-family:${DISPLAY}; color:${C.blue}; font-size:24px; font-weight:700; line-height:30px; word-break:break-word;">${escapeHtml(name)}</h1>
                ${subtitle ? `<p style="margin:4px 0 0; font-family:${SANS}; color:${C.ink2}; font-size:14px; line-height:20px; word-break:break-word;">${escapeHtml(subtitle)}</p>` : ""}
                <p style="margin:14px 0 0;">${chip(role, roleAccent(a.role))}${chip(paymentLabel(a.payment_status, a.source), paymentDot)}</p>${button}
              </td></tr>
            </table>
          </td></tr>${sections}
          <tr><td style="padding:20px 4px 0; font-family:${SANS}; color:${C.ink3}; font-size:12px; line-height:18px;">
            Sent to the registration alert list, which super admins manage in the dashboard settings. Passports are never attached: open them in the dashboard.
          </td></tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject: `New registration: ${name} (${ticketName})`, html };
}
