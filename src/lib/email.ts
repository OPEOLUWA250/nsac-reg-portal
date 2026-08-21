import { Resend } from "resend";

// Brand colors, duplicated from globals.css — email HTML can't read CSS
// custom properties, so these are hardcoded here.
const NAVY = "#0A1A31";
const GOLD = "#F09F07";
const GOLD_LIGHT = "#f7c15c";
const OFFWHITE = "#FAFAF8";

interface SendQrEmailArgs {
  toEmail: string;
  fullName: string;
  qrPngBuffer: Buffer;
  eventName?: string;
  role?: string;
}

export async function sendQrEmail({
  toEmail,
  fullName,
  qrPngBuffer,
  eventName = "NewSpace Africa Conference",
  role,
}: SendQrEmailArgs) {
  const apiKey = process.env.RESEND_API_KEY;
  const fromAddress = process.env.EMAIL_FROM;

  if (!apiKey || !fromAddress) {
    throw new Error("Missing RESEND_API_KEY or EMAIL_FROM environment variables");
  }

  const resend = new Resend(apiKey);

  const firstName = fullName.split(" ")[0] || fullName;
  const font =
    "Helvetica, Arial, 'Segoe UI', sans-serif";

  await resend.emails.send({
    from: fromAddress,
    to: toEmail,
    subject: `You're registered for ${eventName} — your check-in QR code`,
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
          Registration Portal
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
          Registration confirmed 🎉
        </h1>
        <p style="margin:0 0 4px; color:${NAVY}; font-size:15px; line-height:1.6;">
          Hi ${firstName},
        </p>
        <p style="margin:0 0 4px; color:rgba(10,26,49,0.7); font-size:15px; line-height:1.6;">
          Thanks for registering for <strong style="color:${NAVY};">${eventName}</strong>. Your spot is confirmed.
        </p>
        ${
          role
            ? `<div style="margin:16px 0 4px;">
                <span style="display:inline-block; background:rgba(240,159,7,0.12); border:1px solid rgba(240,159,7,0.4); color:${NAVY}; font-size:11px; font-weight:700; letter-spacing:1px; text-transform:uppercase; padding:6px 14px; border-radius:999px;">
                  ${role}
                </span>
              </div>`
            : ""
        }
      </td>
    </tr>
    <tr>
      <td style="padding:20px 32px 8px; text-align:center;">
        <p style="margin:0 0 20px; color:rgba(10,26,49,0.7); font-size:14px; line-height:1.6;">
          Bring the QR code below (digital or printed) to the registration desk
          on the day of the event — it will be scanned to check you in and
          print your badge.
        </p>
        <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto; background:${OFFWHITE}; border:1px solid rgba(10,26,49,0.1); border-radius:12px;">
          <tr>
            <td style="padding:18px;">
              <img src="cid:checkin-qr.png" alt="Your check-in QR code" width="200" height="200" style="display:block; width:200px; height:200px;" />
            </td>
          </tr>
        </table>
      </td>
    </tr>
    <tr>
      <td style="padding:28px 32px 32px; text-align:center; border-top:1px solid rgba(10,26,49,0.08); margin-top:24px;">
        <p style="margin:20px 0 0; color:rgba(10,26,49,0.45); font-size:12px; letter-spacing:0.5px; text-transform:uppercase;">
          Questions? Just reply to this email.
        </p>
      </td>
    </tr>
  </table>
</body>
    `,
  });
}
